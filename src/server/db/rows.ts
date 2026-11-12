// Reading and changing single rows and cells.
import { db, holdCursor } from "./connection.ts";
import { assertTable, findObject, hasBlobAffinity, tableColumns } from "./schema.ts";
import { PAGE_CLAUSE, pageParams, parseNumber, quote, prepareBig, sameSqlName } from "./sql.ts";
import { keyValue } from "../rowKey.ts";
import type { RowKey } from "../rowKey.ts";
import type { SQLInputValue } from "node:sqlite";
import type { Column, SchemaObject } from "./schema.ts";

export type { RowKey };

/** Sort direction of a table page. */
export type SortDir = "asc" | "desc";

/** One row of a table or query result, values in column order. */
export type Row = unknown[];

/** A table or view with everything the pages and row functions need to know about it. */
export type TableInfo = {
  object: SchemaObject;
  cols: Column[];
  columnNames: string[];
  /** Columns identifying a row (see keyColumnsOf); empty for views. */
  keyColumns: string[];
  withoutRowid: boolean;
  /** Columns with BLOB affinity, which accept file uploads. */
  blobColumns: string[];
};

/** Everything about a table or view in one go; undefined if there is none by that name. */
export function describeTable(name: string): TableInfo | undefined {
  const object = findObject(name);
  if (!object) {
    return undefined;
  }
  const cols = tableColumns(object.name);
  const withoutRowid = isWithoutRowid(object);
  return {
    object,
    cols,
    columnNames: cols.map((column) => column.name),
    keyColumns: keyColumnsOf(object, cols, withoutRowid),
    withoutRowid,
    blobColumns: cols.filter((column) => hasBlobAffinity(column.type)).map((column) => column.name),
  };
}

/** The declared name of a column of `info` (see sameSqlName); undefined if there is none. */
export function findColumn(info: Pick<TableInfo, "columnNames">, name: string | undefined) {
  return info.columnNames.find((column) => sameSqlName(column, String(name ?? "")));
}

/** Like describeTable, but throws unless it is a table (views can't be changed). */
function requireTableInfo(name: string) {
  const info = describeTable(name);
  assertTable(info?.object, name);
  return info!;
}

/** True for a table declared WITHOUT ROWID (asks SQLite instead of parsing its SQL). */
export function isWithoutRowid(object: SchemaObject) {
  if (object.type !== "table") {
    return false;
  }
  const info = db()
    .prepare(`PRAGMA table_list(${quote(object.name)})`)
    .get();
  return Boolean(info?.wr);
}

/** SQLite's names for the built-in rowid; a real column of that name hides it. */
const ROWID_ALIASES = ["rowid", "_rowid_", "oid"];

/**
 * Columns that identify a row: the rowid for normal tables, the primary key
 * columns for WITHOUT ROWID tables. A real column named "rowid" hides the built-in
 * one: then the primary key is used, or else another alias ("_rowid_", "oid") that
 * is still free. Empty for views, and for tables that hide all aliases without a primary key.
 */
function keyColumnsOf(object: SchemaObject, cols: Column[], withoutRowid: boolean) {
  if (object.type !== "table") {
    return [];
  }
  // `pk` is the column's position in the primary key (1, 2, …), 0 if not part of it.
  const primaryKey = cols
    .filter((column) => column.pk)
    .toSorted((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  if (withoutRowid) {
    return primaryKey;
  }
  const free = ROWID_ALIASES.filter(
    (alias) => !cols.some((column) => sameSqlName(column.name, alias)),
  );
  if (free[0] === "rowid") {
    return ["rowid"];
  }
  return primaryKey.length ? primaryKey : free.slice(0, 1);
}

/**
 * One page of a table or view as a lazy cursor of rows (arrays in column order),
 * sorted by `sort` if it is a column. For tables, `rowKey` reads a row's key:
 * the key columns are selected once more after the visible ones, so the hidden
 * rowid is available too.
 */
export function readTablePage(
  { object, columnNames, keyColumns }: TableInfo,
  { sort, dir, limit, offset }: { sort?: string; dir?: SortDir; limit: number; offset: number },
) {
  const sortColumn = findColumn({ columnNames }, sort);
  const keySelect = keyColumns.map((name) => `, ${quote(name)}`).join("");
  // Only known column names and a fixed direction reach the SQL text.
  // The key columns break ties, so rows with equal sort values keep one order
  // across pages (otherwise OFFSET paging may repeat or skip them).
  const terms = [
    ...(sortColumn ? [`${quote(sortColumn)} ${dir === "desc" ? "DESC" : "ASC"}`] : []),
    ...keyColumns.map(quote),
  ];
  const order = terms.length ? ` ORDER BY ${terms.join(", ")}` : "";
  const statement = prepareBig(
    `SELECT *${keySelect} FROM ${quote(object.name)}${order} ${PAGE_CLAUSE}`,
  );
  statement.setReturnArrays(true);
  const visibleCount = columnNames.length;
  return {
    rows: holdCursor(
      statement.iterate(pageParams({ limit, offset })) as Iterable<unknown>,
    ) as Iterable<Row>,
    rowKey: keyColumns.length
      ? (row: Row): RowKey =>
          Object.fromEntries(keyColumns.map((k, i) => [k, row[visibleCount + i]]))
      : undefined,
  };
}

/**
 * Updates one cell and returns the stored value plus the row's key afterwards,
 * which differs from `key` when a key column was changed (e.g. an INTEGER
 * PRIMARY KEY, which is the rowid).
 * `key`: column/value pairs identifying the row
 */
export function updateCell(
  table: string,
  key: RowKey,
  name: string,
  value: string | Uint8Array | null,
) {
  const { cols, keyColumns, where, values } = locateRow(table, key);
  const columnDef = requireColumn(cols, name);
  const column = columnDef.name;
  const bound = bindValue(columnDef, value);
  // RETURNING reads the row as stored, by its new key if that changed.
  // Rows as arrays, so a key column can't clash with the value's alias.
  const statement = prepareBig(
    `UPDATE ${quote(table)} SET ${quote(column)} = ? WHERE ${where} RETURNING ${quote(column)}, ${keyColumns.map(quote).join(", ")}`,
  );
  statement.setReturnArrays(true);
  const rows = statement.all(bound, ...values) as unknown as unknown[][];
  expectOneRow(rows.length, "changed");
  const [stored, ...keyValues] = rows[0];
  return {
    column,
    value: stored ?? null,
    key: Object.fromEntries(keyColumns.map((name, i) => [name, keyValues[i]])),
  };
}

/** Reads one BLOB cell; undefined if the row is gone or the value is no BLOB. */
export function readBlob(table: string, key: RowKey, name: string) {
  const { cols, where, values } = locateRow(table, key);
  const value = readCell(table, requireColumn(cols, name).name, where, values);
  return value instanceof Uint8Array ? value : undefined;
}

/** The value of one cell of the row selected by `where`; null if there is no such row. */
function readCell(table: string, column: string, where: string, values: SQLInputValue[]) {
  const row = prepareBig(`SELECT ${quote(column)} AS v FROM ${quote(table)} WHERE ${where}`).get(
    ...values,
  );
  return row?.v ?? null;
}

/**
 * The table's columns plus a WHERE clause and its values selecting one row by key.
 * Throws if there is no such table or the key is incomplete.
 */
function locateRow(table: string, key: RowKey) {
  const { cols, keyColumns } = requireTableInfo(table);
  if (!keyColumns.length || keyColumns.some((name) => !Object.hasOwn(key ?? {}, name))) {
    throw new Error("Row cannot be identified");
  }
  return {
    cols,
    keyColumns,
    where: keyColumns.map((name) => `${quote(name)} = ?`).join(" AND "),
    values: keyColumns.map((name) => keyValue(key[name])),
  };
}

/** The column named `name` (see sameSqlName); throws if there is none. */
function requireColumn(cols: Column[], name: string) {
  const columnDef = cols.find((column) => sameSqlName(column.name, name));
  if (!columnDef) {
    throw new Error(`Unknown column: ${name}`);
  }
  return columnDef;
}

/**
 * The value to bind for a column, the same for inserts and cell edits.
 * BLOB affinity keeps text as text, so typed numbers become numbers there.
 */
function bindValue(column: Column, value: string | Uint8Array | null) {
  return hasBlobAffinity(column.type) && typeof value === "string"
    ? (parseNumber(value) ?? value)
    : value;
}

/**
 * Inserts a row. Columns missing from `values` get their default value.
 * `rowid` is the new row's rowid, undefined for WITHOUT ROWID tables (which have none).
 */
export function insertRow(table: string, values: Record<string, string | Uint8Array | null>) {
  const info = requireTableInfo(table);
  const cols = info.cols.filter((column) => Object.hasOwn(values, column.name));
  const names = cols.map((column) => column.name);
  const sql = names.length
    ? `INSERT INTO ${quote(table)} (${names.map(quote).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
    : `INSERT INTO ${quote(table)} DEFAULT VALUES`;
  const { lastInsertRowid } = prepareBig(sql).run(
    ...cols.map((column) => bindValue(column, values[column.name])),
  );
  return { rowid: info.withoutRowid ? undefined : lastInsertRowid };
}

/** Deletes exactly one row identified by its key. */
export function deleteRow(table: string, key: RowKey) {
  const { where, values } = locateRow(table, key);
  const { changes } = prepareBig(`DELETE FROM ${quote(table)} WHERE ${where}`).run(...values);
  expectOneRow(changes, "deleted");
}

/** Throws unless exactly one row was affected, e.g. when the row was deleted meanwhile. */
function expectOneRow(changes: number | bigint, verb: string) {
  if (Number(changes) !== 1) {
    throw new Error(`Expected 1 ${verb} row, got ${changes}`);
  }
}
