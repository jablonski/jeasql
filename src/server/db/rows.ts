// Reading and changing single rows and cells.
import type { SQLInputValue } from "node:sqlite";
import { db, holdCursor } from "./connection.ts";
import type { Filters } from "./filter.ts";
import type { PageSlice } from "./paging.ts";
import { PAGE_CLAUSE, pageParams } from "./paging.ts";
import { filterClause } from "./filter.ts";
import type { RowKey } from "./rowKey.ts";
import { keyValue } from "./rowKey.ts";
import type { Column, SchemaObject } from "./schema.ts";
import {
  assertTable,
  findObject,
  hasBlobAffinity,
  indexes,
  isGenerated,
  tableColumns,
} from "./schema.ts";
import type { Row } from "./sql.ts";
import { findName, parseNumber, prepareBig, quote, quoteList, sameSqlName } from "./sql.ts";

/** A value to store in a cell: typed text, an uploaded file, or NULL. */
export type CellInput = string | Uint8Array | null;

/** Sort direction of a table page. */
export type SortDir = "asc" | "desc";

/** A table or view with everything the pages and row functions need to know about it. */
export type TableInfo = {
  object: SchemaObject;
  cols: Column[];
  columnNames: string[];
  /** Columns identifying a row (see keyColumnsOf); empty for views. */
  keyColumns: string[];
  withoutRowid: boolean;
  /** The INTEGER PRIMARY KEY column that is an alias for the rowid, if any (see rowidAliasOf). */
  rowidAlias?: string;
  /** Columns with BLOB affinity, which accept file uploads (generated ones excluded). */
  blobColumns: string[];
  /** Generated columns: shown, sorted and filtered like others, but never written. */
  generatedColumns: string[];
};

/** The part of TableInfo that reading and changing single rows needs. */
type RowTarget = Pick<TableInfo, "object" | "cols" | "keyColumns" | "withoutRowid">;

/** A table or view with its columns and row key; undefined if there is none by that name. */
function rowTarget(name: string): RowTarget | undefined {
  const object = findObject(name);
  if (!object) {
    return undefined;
  }
  const cols = tableColumns(object.name);
  const withoutRowid = isWithoutRowid(object);
  return { object, cols, keyColumns: keyColumnsOf(object, cols, withoutRowid), withoutRowid };
}

/** Everything about a table or view in one go; undefined if there is none by that name. */
export function describeTable(name: string): TableInfo | undefined {
  const target = rowTarget(name);
  if (!target) {
    return undefined;
  }
  const { object, cols, withoutRowid } = target;
  const namesOf = (columns: Column[]) => columns.map((column) => column.name);
  return {
    ...target,
    columnNames: namesOf(cols),
    rowidAlias: rowidAliasOf(object, cols, withoutRowid),
    blobColumns: namesOf(
      cols.filter((column) => hasBlobAffinity(column.type) && !isGenerated(column)),
    ),
    generatedColumns: namesOf(cols.filter(isGenerated)),
  };
}

/** The declared name of a column of `info` (see findName); undefined if there is none. */
export function findColumn(info: TableInfo, name: string | undefined) {
  return findName(info.columnNames, name);
}

/**
 * The table `name` for row operations; throws unless it is a table (views can't be
 * changed). Skips what only pages need (e.g. rowidAlias, which costs another PRAGMA).
 */
function requireRowTarget(name: string) {
  const target = rowTarget(name);
  assertTable(target?.object, name);
  return target!;
}

/** True for a table declared WITHOUT ROWID (asks SQLite instead of parsing its SQL). Exported for tests. */
export function isWithoutRowid(object: SchemaObject) {
  if (object.type !== "table") {
    return false;
  }
  const info = db()
    .prepare(`PRAGMA table_list(${quote(object.name)})`)
    .get();
  return Boolean(info?.wr);
}

/**
 * The column SQLite fills in automatically: a single-column INTEGER PRIMARY KEY is
 * the rowid (not in WITHOUT ROWID tables, which have no rowid, nor in composite keys).
 * An "INTEGER PRIMARY KEY DESC" is no alias: SQLite gives it a primary key index
 * (origin "pk"), which a real alias never has.
 */
function rowidAliasOf(object: SchemaObject, cols: Column[], withoutRowid: boolean) {
  const keys = cols.filter((column) => column.pk);
  if (withoutRowid || keys.length !== 1 || keys[0].type.trim().toUpperCase() !== "INTEGER") {
    return undefined;
  }
  return indexes(object.name).some((index) => index.origin === "pk") ? undefined : keys[0].name;
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
 * One page of a table or view as a lazy cursor of rows (arrays in the order of `columnNames`),
 * sorted by `sort` if it is a column and limited to rows matching `filters`. For tables, `rowKey` reads a row's key:
 * the key columns are selected once more after the visible ones, so the hidden
 * rowid is available too.
 */
export function readTablePage(
  { object, columnNames, keyColumns }: TableInfo,
  {
    sort,
    dir,
    limit,
    offset,
    filters,
  }: { sort?: string; dir?: SortDir; filters?: Filters } & PageSlice,
) {
  const sortColumn = findName(columnNames, sort);
  const keySelect = keyColumns.map((name) => `, ${quote(name)}`).join("");
  // Only known column names, column positions and a fixed direction reach the SQL text.
  // Tie-breakers keep rows with equal sort values in one order across pages (otherwise
  // OFFSET paging may repeat or skip them): the key columns, or for views (which have
  // none) all columns by position. Unsorted views get no ORDER BY, so big ones aren't
  // sorted just to show a page.
  const tieBreakers = keyColumns.length
    ? keyColumns.map(quote)
    : sortColumn
      ? columnNames.map((_, i) => String(i + 1))
      : [];
  const terms = [
    ...(sortColumn ? [`${quote(sortColumn)} ${dir === "desc" ? "DESC" : "ASC"}`] : []),
    ...tieBreakers,
  ];
  const { where, params } = filterClause(filters);
  // Tables list their columns explicitly, so values line up with columnNames and the
  // key columns after them whatever SELECT * would return.
  // Views keep *: their PRAGMA names may be renamed duplicates ("id:1").
  const select = object.type === "table" ? quoteList(columnNames) : "*";
  const order = terms.length ? ` ORDER BY ${terms.join(", ")}` : "";
  const statement = prepareBig(
    `SELECT ${select}${keySelect} FROM ${quote(object.name)}${where}${order} ${PAGE_CLAUSE}`,
  );
  statement.setReturnArrays(true);
  const visibleCount = columnNames.length;
  return {
    rows: holdCursor(
      statement.iterate({ ...params, ...pageParams({ limit, offset }) }) as Iterable<unknown>,
    ) as Iterable<Row>,
    rowKey: keyColumns.length
      ? (row: Row) => toRowKey(keyColumns, row.slice(visibleCount))
      : undefined,
  };
}

/** Pairs key columns with their values (in the same order) into a row key. */
function toRowKey(keyColumns: string[], values: unknown[]): RowKey {
  return Object.fromEntries(keyColumns.map((name, i) => [name, values[i]]));
}

/**
 * Updates one cell and returns the stored value plus the row's key afterwards,
 * which differs from `key` when a key column was changed (e.g. an INTEGER
 * PRIMARY KEY, which is the rowid).
 * `key`: column/value pairs identifying the row
 */
export function updateCell(table: string, key: RowKey, name: string, value: CellInput) {
  const { cols, keyColumns, where, values } = locateRow(table, key);
  const columnDef = requireColumn(cols, name);
  const column = columnDef.name;
  if (isGenerated(columnDef)) {
    throw new Error(`Column ${column} is generated and can't be changed`);
  }
  const bound = bindValue(columnDef, value);
  // RETURNING reads the row as stored, by its new key if that changed.
  // Rows as arrays, so a key column can't clash with the value's alias.
  const statement = prepareBig(
    `UPDATE ${quote(table)} SET ${quote(column)} = ? WHERE ${where} RETURNING ${quote(column)}, ${quoteList(keyColumns)}`,
  );
  statement.setReturnArrays(true);
  const rows = statement.all(bound, ...values) as unknown as unknown[][];
  expectOneRow(rows.length, "changed");
  const [stored, ...keyValues] = rows[0];
  return {
    column,
    value: stored ?? null,
    key: toRowKey(keyColumns, keyValues),
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
  const { cols, keyColumns } = requireRowTarget(table);
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

/** The column named `name` (see findName); throws if there is none. */
function requireColumn(cols: Column[], name: string) {
  const declared = findName(
    cols.map((column) => column.name),
    name,
  );
  const columnDef = cols.find((column) => column.name === declared);
  if (!columnDef) {
    throw new Error(`Unknown column: ${name}`);
  }
  return columnDef;
}

/**
 * The value to bind for a column, the same for inserts and cell edits.
 * BLOB affinity keeps text as text, so typed numbers become numbers there.
 */
function bindValue(column: Column, value: CellInput) {
  return hasBlobAffinity(column.type) && typeof value === "string"
    ? (parseNumber(value) ?? value)
    : value;
}

/**
 * Inserts a row. Columns missing from `values` get their default value.
 * `rowid` is the new row's rowid, undefined for WITHOUT ROWID tables (which have none).
 */
export function insertRow(table: string, values: Record<string, CellInput>) {
  const info = requireRowTarget(table);
  const cols = info.cols.filter((column) => Object.hasOwn(values, column.name));
  const names = cols.map((column) => column.name);
  const sql = names.length
    ? `INSERT INTO ${quote(table)} (${quoteList(names)}) VALUES (${names.map(() => "?").join(", ")})`
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
