// Tables, views and their structure.
import { db } from "./connection.ts";
import { quote, SQL_NUMBER } from "./sql.ts";
import { filterClause } from "./filter.ts";
import type { Filters } from "./filter.ts";
import { requireText, trimmed } from "../fields.ts";

/** A table or view. */
export type SchemaObject = { name: string; type: string; sql: string };

/** One row of PRAGMA table_info. */
export type Column = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

/** A column for CREATE TABLE / ADD COLUMN. */
export type ColumnSpec = {
  name: string;
  type?: string;
  pk?: boolean;
  notnull?: boolean;
  unique?: boolean;
  dflt?: string;
};

/** Selects tables and views, without SQLite internals. */
const OBJECTS_SQL =
  "SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'";

/** Column types offered in forms ("" = no type). */
export const TYPES = ["INTEGER", "TEXT", "REAL", "NUMERIC", "BLOB", ""];

/** Lists all tables and views (without SQLite internals). */
export function listObjects() {
  return db().prepare(`${OBJECTS_SQL} ORDER BY type, name`).all() as SchemaObject[];
}

/**
 * Returns the table or view with the given name, or undefined. Names match
 * case-insensitively, like everywhere in SQLite; `name` of the result is as declared.
 */
export function findObject(name: string) {
  return db().prepare(`${OBJECTS_SQL} AND name = ? COLLATE NOCASE`).get(String(name)) as
    | SchemaObject
    | undefined;
}

/** Table and view names with their column names, e.g. for SQL completion. */
// One query for all objects (pragma_table_info joined), instead of one PRAGMA per object.
export function schemaMap() {
  const rows = db()
    .prepare(
      `SELECT o.name AS tbl, c.name AS col FROM (${OBJECTS_SQL}) AS o, pragma_table_info(o.name) AS c ORDER BY o.type, o.name, c.cid`,
    )
    .all() as { tbl: string; col: string }[];
  // No prototype: a table named "constructor" or "__proto__" must not hit inherited members.
  const schema: Record<string, string[]> = Object.create(null);
  for (const { tbl, col } of rows) {
    (schema[tbl] ??= []).push(col);
  }
  return schema;
}

/** Columns of a table or view (PRAGMA table_info). */
export function tableColumns(table: string) {
  return db()
    .prepare(`PRAGMA table_info(${quote(table)})`)
    .all() as Column[];
}

/** Indexes of a table (PRAGMA index_list). */
export function indexes(table: string) {
  return db()
    .prepare(`PRAGMA index_list(${quote(table)})`)
    .all() as { name: string; unique: number; origin: string }[];
}

/** Foreign keys of a table (PRAGMA foreign_key_list). */
export function foreignKeys(table: string) {
  return db()
    .prepare(`PRAGMA foreign_key_list(${quote(table)})`)
    .all() as { table: string; from: string; to: string }[];
}

/**
 * Row count, or undefined if it fails (e.g. a view referencing a dropped table).
 * With `limit`, counting stops after limit + 1 rows, so a result above `limit`
 * only means "more than that" (cheap enough for many big tables at once).
 */
export function tryCount(table: string, limit?: number, filters?: Filters) {
  const { where, params } = filterClause(filters);
  const from =
    limit === undefined
      ? `${quote(table)}${where}`
      : `(SELECT 1 FROM ${quote(table)}${where} LIMIT ${limit + 1})`;
  try {
    const row = db().prepare(`SELECT count(*) AS n FROM ${from}`).get(params);
    return Number(row?.n ?? 0);
  } catch {
    return undefined;
  }
}

/** Counting stops here, so pages stay fast for big tables (see countRows). */
export const COUNT_LIMIT = 100_000;

/** A row count that may be capped: `capped` means "more than `count`"; undefined if counting failed. */
export type RowCount = { count: number | undefined; capped: boolean };

/**
 * Lower cap for the overview, which counts every table at once: N big tables
 * would otherwise read up to N × COUNT_LIMIT rows per page load.
 */
export const OVERVIEW_COUNT_LIMIT = 10_000;

/** Row count up to `limit` (default COUNT_LIMIT), of rows matching `filters`; see RowCount. */
export function countRows(table: string, limit = COUNT_LIMIT, filters?: Filters): RowCount {
  const count = tryCount(table, limit, filters);
  return count !== undefined && count > limit
    ? { count: limit, capped: true }
    : { count, capped: false };
}

/** Columns declared as BLOB or without a type have BLOB affinity in SQLite. */
// SQLite's affinity rules, in order: "INT" → INTEGER; "CHAR", "CLOB" or "TEXT" → TEXT;
// "BLOB" or no type → BLOB (values stored exactly as given, without conversion).
export const hasBlobAffinity = (type: string) =>
  (!type.trim() || /BLOB/i.test(type)) && !/INT|CHAR|CLOB|TEXT/i.test(type);

/** Column types may only contain simple characters, e.g. "VARCHAR(255)". */
function checkType(type: string) {
  const value = trimmed(type);
  if (!/^[A-Za-z0-9_ (),]*$/.test(value)) {
    throw new Error(`Invalid column type: ${value}`);
  }
  return value;
}

/** Turns user input into a DEFAULT expression: numbers and keywords as-is, everything else as text. */
function defaultExpression(input: string | undefined) {
  const value = trimmed(input);
  // Numbers (42, -1.5, .5, 1e5, 0x1F) and BLOB literals (X'00ff') as-is.
  if (SQL_NUMBER.test(value) || /^x'([0-9a-f]{2})*'$/i.test(value)) {
    return value;
  }
  if (/^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|TRUE|FALSE)$/i.test(value)) {
    return value.toUpperCase();
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/** Column definition for CREATE TABLE / ADD COLUMN. */
function columnDefinition(column: ColumnSpec) {
  return [
    quote(requireText(column.name, "Column name is required")),
    checkType(column.type ?? ""),
    column.pk ? "PRIMARY KEY" : "",
    column.notnull ? "NOT NULL" : "",
    column.unique ? "UNIQUE" : "",
    trimmed(column.dflt) ? `DEFAULT ${defaultExpression(column.dflt)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Throws unless `object` is a table (missing, or a view, which can't be changed). */
export function assertTable(object: SchemaObject | undefined, name: string): asserts object {
  if (object?.type !== "table") {
    throw new Error(`Unknown table: ${name}`);
  }
}

/** Creates a table and returns its (trimmed) name. */
export function createTable(table: string, cols: ColumnSpec[]) {
  const name = requireText(table, "Table name is required");
  if (!cols.length) {
    throw new Error("At least one column is required");
  }
  // Several key columns need one table-level PRIMARY KEY (a, b) instead of one per column.
  const keys = cols.filter((column) => column.pk);
  const composite = keys.length > 1;
  const parts = cols.map((column) =>
    columnDefinition(composite ? { ...column, pk: false } : column),
  );
  if (composite) {
    parts.push(`PRIMARY KEY (${keys.map((column) => quote(trimmed(column.name))).join(", ")})`);
  }
  db().exec(`CREATE TABLE ${quote(name)} (\n  ${parts.join(",\n  ")}\n)`);
  return name;
}

/**
 * Form input for a structural change; each operation reads the fields it needs.
 * `op` is user input, checked against the TableOp names by alterTable.
 */
export type TableChange = {
  op: string;
  name?: string;
  column?: string;
  type?: string;
  notnull?: boolean;
  dflt?: string;
};

/** What the user is told, and the table to show next (undefined after a drop). */
type ChangeResult = { notice: string; table?: string };

/** Applies one structural change to `table` (declared name; `quotedTable` is it quoted for SQL). */
type TableChangeHandler = (table: string, quotedTable: string, change: TableChange) => ChangeResult;

/** One handler per operation. */
const TABLE_CHANGES = {
  "rename-table": (_table, quotedTable, change) => {
    const newName = requireText(change.name, "New table name is required");
    db().exec(`ALTER TABLE ${quotedTable} RENAME TO ${quote(newName)}`);
    return { notice: "Table renamed.", table: newName };
  },
  "add-column": (table, quotedTable, { name = "", type, notnull, dflt }) => {
    db().exec(
      `ALTER TABLE ${quotedTable} ADD COLUMN ${columnDefinition({ name, type, notnull, dflt })}`,
    );
    return { notice: "Column added.", table };
  },
  "rename-column": (table, quotedTable, change) => {
    const column = requireText(change.column, "Column is required");
    const newName = requireText(change.name, "New column name is required");
    db().exec(`ALTER TABLE ${quotedTable} RENAME COLUMN ${quote(column)} TO ${quote(newName)}`);
    return { notice: "Column renamed.", table };
  },
  "drop-column": (table, quotedTable, change) => {
    const column = requireText(change.column, "Column is required");
    db().exec(`ALTER TABLE ${quotedTable} DROP COLUMN ${quote(column)}`);
    return { notice: "Column dropped.", table };
  },
  "drop-table": (table, quotedTable) => {
    db().exec(`DROP TABLE ${quotedTable}`);
    return { notice: `Table ${table} dropped.` };
  },
} satisfies Record<string, TableChangeHandler>;

/** The structural changes alterTable knows (see TABLE_CHANGES). */
export type TableOp = keyof typeof TABLE_CHANGES;

const isTableOp = (op: string): op is TableOp => Object.hasOwn(TABLE_CHANGES, op);

/**
 * Structural changes on a table (see TABLE_CHANGES). Returns a message for the
 * user and the table to show next (its new name after a rename, undefined after a drop).
 */
export function alterTable(table: string, change: TableChange): ChangeResult {
  if (!isTableOp(change.op)) {
    throw new Error(`Unknown operation: ${change.op}`);
  }
  const handler: TableChangeHandler = TABLE_CHANGES[change.op];
  const object = findObject(table);
  assertTable(object, table);
  // The declared name, not the user's spelling (names match case-insensitively).
  return handler(object.name, quote(object.name), change);
}
