// Running SQL and parsing it into statements.
import { db, holdCursor } from "./connection.ts";
import type { PageSlice } from "./paging.ts";
import { PAGE_CLAUSE, pageParams } from "./paging.ts";

/** One row of a table or query result, values in column order. */
export type Row = unknown[];

/** Start of a CREATE TRIGGER, as regex source (see CREATE_TRIGGER, stripTriggers). */
const CREATE_TRIGGER_SOURCE = String.raw`\bCREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b`;

/** Finds a CREATE TRIGGER in SQL with strings and comments blanked out (see parseSql). */
const CREATE_TRIGGER = new RegExp(CREATE_TRIGGER_SOURCE, "i");

/** A whole trigger: its body ends with "; END" (a CASE … END never directly follows a ";"). */
const TRIGGER_BODY = new RegExp(String.raw`${CREATE_TRIGGER_SOURCE}[\s\S]*?\bBEGIN\b[\s\S]*?;\s*END\b`, "gi");

/**
 * Numeric literals as SQL writes them (42, -1.5, .5, 1., 1e5, +3, 0x1F), e.g. for DEFAULT.
 * Looser than parseNumber: SQL reads "007" as 7, so as a literal it is a number.
 */
export const SQL_NUMBER = /^[+-]?((\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?|0x[0-9a-f]+)$/i;

/** Canonical decimal forms only, as String() and BigInt print numbers (-12, 3.5, 1.5e-7, 1e+21). */
const CANONICAL_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?(e[+-]?\d+)?$/i;

/**
 * A typed value as a number, or undefined to keep it as text. Integers become
 * BigInt (node:sqlite binds every JS number as REAL, 42 → 42.0; only BigInt binds as
 * INTEGER), decimals numbers. Only canonical forms count, so "007" or "+1" stay
 * text, and integers beyond 64 bits too (they would lose digits).
 */
export function parseNumber(value: string): bigint | number | undefined {
  if (!CANONICAL_NUMBER.test(value)) {
    return undefined;
  }
  if (/^-?\d+$/.test(value)) {
    const n = BigInt(value);
    return n >= -(2n ** 63n) && n < 2n ** 63n ? n : undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Lowercases ASCII letters only, the way SQLite folds names (see sameSqlName). */
const foldAscii = (name: string) => name.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * True if two table or column names are the same: SQLite matches names case-insensitively,
 * but only for ASCII letters, so "Ä" and "ä" are different columns.
 */
export const sameSqlName = (a: string, b: string) => foldAscii(a) === foldAscii(b);

/** The entry of `names` matching `name` (see sameSqlName), as declared; undefined if none. */
export const findName = (names: string[], name: unknown) =>
  names.find((declared) => sameSqlName(declared, String(name ?? "")));

/** Quotes an identifier (table or column name) for safe use in SQL. */
export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Quotes identifiers and joins them for a column list: ["a", "b"] → `"a", "b"`. */
export const quoteList = (names: string[]) => names.map(quote).join(", ");

/**
 * Runs arbitrary SQL. For statements that produce rows, returns a lazy
 * cursor over them (rows as arrays, so columns with the same name, like
 * SELECT a.id, b.id, keep their own values); otherwise runs it and returns
 * the number of changed rows.
 * With `page`, a pageable query (see isPageable) reads only that slice: SQLite
 * skips the rows before it instead of the app reading and dropping them.
 * `paged` tells whether that happened; callers use it instead of checking isPageable
 * themselves, so the SQL is parsed only once.
 */
export function runQuery(sql: string, page?: PageSlice) {
  const parsed = parseSql(sql);
  const { statements } = parsed;
  // Several statements, or a trigger (whose body has ";" inside, so the count is unreliable
  // and preparing it would silently drop anything after it): run them all, return no rows.
  if (statements.length !== 1 || parsed.trigger) {
    return noRows(
      [],
      countChanges(() => execAtomic(parsed)),
    );
  }
  const statement = prepareBig(statements[0]);
  // Names from the query itself: wrapped in a subquery, SQLite renames duplicates ("id:1").
  const columns = statement.columns().map((column) => column.name);
  if (!columns.length) {
    return noRows(
      columns,
      countChanges(() => statement.run()),
    );
  }
  const paged = Boolean(page) && isPageable(parsed);
  // Newlines around the query, so a trailing "-- comment" can't swallow the ")".
  // Named parameters for the page, so "?" placeholders in the query itself stay
  // unbound (NULL) just as when it runs unpaged, instead of taking the limit.
  const reader = paged
    ? prepareBig(`SELECT * FROM (\n${statements[0]}\n) ${PAGE_CLAUSE}`)
    : statement;
  reader.setReturnArrays(true);
  const cursor = paged ? reader.iterate(pageParams(page!)) : reader.iterate();
  return {
    columns,
    rows: holdCursor(cursor as Iterable<unknown>) as Iterable<Row>,
    changes: 0,
    paged,
  };
}

/** The result of SQL that produces no rows, only changes. */
function noRows(columns: string[], changes: number) {
  return { columns, rows: [] as Row[], changes, paged: false };
}

/**
 * Runs several statements all or nothing, unless the SQL manages transactions
 * itself, contains a statement that can't run inside one (VACUUM), or is already
 * inside one: then it runs as given.
 */
function execAtomic({ sql, code }: ParsedSql) {
  if (!db().isTransaction && !mustRunUnwrapped(code)) {
    db().exec("BEGIN");
    try {
      db().exec(sql);
      db().exec("COMMIT");
    } catch (e) {
      if (db().isTransaction) {
        db().exec("ROLLBACK");
      }
      throw e;
    }
    return;
  }
  db().exec(sql);
}

/**
 * Statements that control transactions, or fail inside one (VACUUM). Only at the
 * start of a statement: CASE … END is no transaction.
 */
const TRANSACTION_CONTROL = /^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|VACUUM)\b/i;

/**
 * True if any statement of the (blanked-out) SQL begins, ends or nests a transaction,
 * or can't run inside one, so it must not be wrapped in BEGIN … COMMIT.
 */
function mustRunUnwrapped(code: string) {
  return stripTriggers(code)
    .split(";")
    .some((statement) => TRANSACTION_CONTROL.test(statement));
}

/** Blanks out trigger bodies (see TRIGGER_BODY), whose BEGIN … END is no transaction. */
function stripTriggers(code: string) {
  return code.replace(TRIGGER_BODY, " ");
}

/**
 * Runs `fn` and returns the number of rows it changed. Uses the total_changes()
 * delta, because changes() keeps a stale value after DDL statements.
 */
function countChanges(fn: () => unknown) {
  const total = () => Number(db().prepare("SELECT total_changes() AS n").get()?.n ?? 0);
  const before = total();
  fn();
  return total() - before;
}

/**
 * Prepares a statement that reads every integer as BigInt, so values beyond
 * Number.MAX_SAFE_INTEGER don't throw. For statements on user data (reads and writes alike);
 * schema queries (PRAGMAs, sqlite_schema) use db().prepare, whose small numbers stay numbers.
 */
export function prepareBig(sql: string) {
  const statement = db().prepare(sql);
  statement.setReadBigInts(true);
  return statement;
}

/** SQL split into statements, plus what the checks below need to know about it. */
export type ParsedSql = {
  /** The SQL as given. */
  sql: string;
  /** Statements without empty or comment-only parts (unreliable if `trigger`). */
  statements: string[];
  /** The SQL with strings, quoted names and comments blanked out, to look for keywords. */
  code: string;
  /** True if it creates a trigger, whose body has ";" between BEGIN and END. */
  trigger: boolean;
};

/**
 * Splits SQL into statements at ";" outside of strings, quoted names and comments,
 * in one pass. Parse once and pass the result on (to isReadOnly, isPageable).
 */
export function parseSql(sql: string): ParsedSql {
  const statements: string[] = [];
  let code = "";
  let start = 0;
  // Walk the SQL once. Strings, quoted names and comments are skipped as a whole
  // (by jumping `i` to their end), so a ";" or keyword inside them is ignored.
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    // 'text', "name", `name` and [name]: jump to the closing quote. A doubled
    // quote ('it''s') just looks like two strings in a row, which gives the same result.
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const end = sql.indexOf(ch === "[" ? "]" : ch, i + 1);
      i = end < 0 ? sql.length : end;
      code += " x "; // placeholder keeps words on both sides apart
    } else if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end;
      code += " ";
    } else if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 1; // +1: skip the "/" of "*/" too
      code += " ";
    } else {
      code += ch;
      if (ch === ";") {
        statements.push(sql.slice(start, i));
        start = i + 1;
      }
    }
  }
  statements.push(sql.slice(start));
  return {
    sql,
    // Drop parts that hold only whitespace or comments.
    statements: statements.filter((s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").trim()),
    code,
    trigger: CREATE_TRIGGER.test(code),
  };
}

/** Statements usable as a subquery, so they can be wrapped for paging. */
const PAGEABLE_START = /^\s*(SELECT|VALUES|WITH)\b/i;

/** Statements that may only read; unlike PAGEABLE_START also EXPLAIN (no subquery). */
const READ_START = /^\s*(SELECT|VALUES|WITH|EXPLAIN)\b/i;

/** Keywords that write or change state; any of them makes SQL count as writing. */
const WRITE_KEYWORD =
  /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * True if a query can be paged inside SQL: read-only (so running it again per
 * page repeats no write) and usable as a subquery (EXPLAIN is not).
 */
export function isPageable(parsed: ParsedSql) {
  return isReadOnly(parsed) && PAGEABLE_START.test(parsed.code);
}

/**
 * True if the SQL is a single statement that only reads: it starts with
 * SELECT, VALUES, WITH or EXPLAIN and contains no writing keyword.
 */
export function isReadOnly({ statements, code }: ParsedSql) {
  // `code` has strings and comments blanked out, so 'DELETE' in a string literal
  // or a comment doesn't count as a write. This errs on the safe side: the
  // function call replace(...) also matches REPLACE, so such a query counts as writing.
  return statements.length === 1 && READ_START.test(code) && !WRITE_KEYWORD.test(code);
}
