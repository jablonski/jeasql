// Column filters for table pages: one expression per column, turned into a WHERE clause.
import { findName, parseNumber, quote } from "./sql.ts";
import { dict } from "../dict.ts";
import type { SQLInputValue } from "node:sqlite";

/** Filter expressions by column name; empty expressions are left out. */
export type Filters = Record<string, string>;

/** Prefix of the query parameters holding filters: ?f.name=…&f.age=>30 */
export const FILTER_PARAM = "f.";

/**
 * The filters among query parameters, for known columns only (with their declared
 * names, see findName), in column order.
 */
export function parseFilters(columnNames: string[], query: Record<string, string>): Filters {
  // No prototype: a column named "__proto__" must stay an ordinary entry.
  const filters = dict<string>();
  for (const [param, value] of Object.entries(query)) {
    if (!param.startsWith(FILTER_PARAM) || !value.trim()) {
      continue;
    }
    const column = findName(columnNames, param.slice(FILTER_PARAM.length));
    if (column) {
      filters[column] = value.trim();
    }
  }
  return Object.fromEntries(
    columnNames.filter((name) => Object.hasOwn(filters, name)).map((name) => [name, filters[name]]),
  );
}

/** Filters as query parameters (see FILTER_PARAM). */
export const filterParams = (filters: Filters = {}) =>
  Object.fromEntries(Object.entries(filters).map(([name, value]) => [FILTER_PARAM + name, value]));

/** Comparison operators, longest first so "<=" isn't read as "<". */
const OPERATORS = ["<=", ">=", "!=", "<>", "=", "<", ">"] as const;

/**
 * One filter expression as SQL on `column` (already quoted) with `param` as its
 * placeholder; `value` is undefined when nothing is bound. Syntax:
 * - `NULL`, `!NULL`: is (not) NULL
 * - `=v`, `!=v`, `<>v`, `<v`, `<=v`, `>v`, `>=v`: comparison; canonical numbers compare as numbers
 * - `!text`: does not contain text
 * - anything else: contains text (case-insensitive for ASCII, like LIKE)
 */
function filterCondition(
  column: string,
  expression: string,
  param: string,
): { sql: string; value?: SQLInputValue } {
  const text = expression.trim();
  if (/^null$/i.test(text)) {
    return { sql: `${column} IS NULL` };
  }
  if (/^!\s*null$/i.test(text)) {
    return { sql: `${column} IS NOT NULL` };
  }
  const op = OPERATORS.find((o) => text.startsWith(o));
  if (op) {
    const raw = text.slice(op.length).trim();
    const sqlOp = op === "<>" ? "!=" : op;
    return { sql: `${column} ${sqlOp} ${param}`, value: parseNumber(raw) ?? raw };
  }
  const negate = text.startsWith("!");
  const needle = (negate ? text.slice(1) : text).trim();
  // NULLs neither contain nor lack the text; "not containing" includes them.
  return {
    sql: negate
      ? `(${column} IS NULL OR ${column} NOT LIKE ${param} ESCAPE '\\')`
      : `${column} LIKE ${param} ESCAPE '\\'`,
    value: `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
  };
}

/**
 * A WHERE clause (with leading space, or "" without filters) and its named
 * parameters. Only quoted column names and fixed operators reach the SQL text.
 */
export function filterClause(filters: Filters = {}) {
  const terms: string[] = [];
  const params: Record<string, SQLInputValue> = {};
  Object.entries(filters).forEach(([name, expression], i) => {
    const param = `$jeasql_filter${i}`;
    const { sql, value } = filterCondition(quote(name), expression, param);
    terms.push(sql);
    if (value !== undefined) {
      params[param.slice(1)] = value;
    }
  });
  return { where: terms.length ? ` WHERE ${terms.join(" AND ")}` : "", params };
}
