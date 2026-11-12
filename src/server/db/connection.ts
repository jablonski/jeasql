// The one open database connection.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requireText } from "../lib/fields.ts";

/** SQLite's name for a fresh in-memory database. */
const MEMORY = ":memory:";

/** Path of the open database file, or "" if none is open yet. */
export function dbPath() {
  return globalThis.$dbPath ?? "";
}

/** The open database. Throws until one is opened via openDatabase(). */
export function db() {
  if (!globalThis.$db) {
    throw new Error("No database open");
  }
  return globalThis.$db;
}

/**
 * True while the open database is inside a transaction the user began (e.g. a
 * lone BEGIN in the SQL editor): every later change joins it until COMMIT or ROLLBACK.
 */
export function inTransaction() {
  return Boolean(globalThis.$db?.isOpen && globalThis.$db.isTransaction);
}

/** Throws while a transaction is open: closing the connection would silently roll it back. */
function assertNoTransaction() {
  if (inTransaction()) {
    throw new Error("A transaction is open: run COMMIT or ROLLBACK in the SQL query first.");
  }
}

/**
 * Switches to another database file. With `create` a missing file is created,
 * otherwise it must exist. The current database stays open if this fails.
 */
export function openDatabase(path: string, create: boolean = false) {
  assertNoTransaction();
  const text = requireText(path, "Path is required");
  // ":memory:" is SQLite's in-memory database, not a file: keep it as is.
  const memory = text === MEMORY;
  const file = memory ? MEMORY : resolve(text);
  if (!memory && !create && !existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
  const next = new DatabaseSync(file);
  try {
    // Fails early if the file is not a SQLite database.
    next.prepare("SELECT count(*) FROM sqlite_schema").get();
    // Enforce the foreign keys the UI shows (SQLite leaves them off by default).
    next.exec("PRAGMA foreign_keys = ON");
  } catch (e) {
    next.close();
    throw e;
  }
  retire(globalThis.$db);
  globalThis.$db = next;
  globalThis.$dbPath = file;
  return file;
}

/** Closes the open database (no-op if none is open). Returns its path. */
export function closeDatabase() {
  assertNoTransaction();
  const file = dbPath();
  retire(globalThis.$db);
  globalThis.$db = undefined;
  globalThis.$dbPath = undefined;
  return file;
}

/** Open cursors per connection, so a switched-away connection closes only once they are done. */
const holds = (globalThis.$dbHolds ??= new Map<DatabaseSync, number>());

/** Closes a connection now, or after its last cursor is done (see holdCursor). */
function retire(connection: DatabaseSync | undefined) {
  if (connection && !holds.has(connection)) {
    connection.close();
  }
}

/**
 * Wraps a cursor of the open database so that switching or closing the database
 * while a page still streams its rows doesn't pull the connection out from under it.
 */
export function holdCursor<T>(rows: Iterable<T>): Iterable<T> {
  const connection = db();
  holds.set(connection, (holds.get(connection) ?? 0) + 1);
  let released = false;
  const token = {};
  const release = () => {
    if (!released) {
      released = true;
      unreadCursors.unregister(token);
      releaseHold(connection);
    }
  };
  const cursor = {
    *[Symbol.iterator]() {
      try {
        yield* rows;
      } finally {
        release();
      }
    },
  };
  // A cursor that is never read (e.g. rendering failed before the table) runs no
  // `finally`; its hold is released once it is garbage collected.
  unreadCursors.register(cursor, connection, token);
  return cursor;
}

/** Releases holds of cursors dropped without being read to the end. */
const unreadCursors = new FinalizationRegistry<DatabaseSync>((connection) =>
  releaseHold(connection),
);

/** Drops one hold; closes the connection if it was the last one and the database was switched. */
function releaseHold(connection: DatabaseSync) {
  const left = (holds.get(connection) ?? 1) - 1;
  if (left > 0) {
    holds.set(connection, left);
    return;
  }
  holds.delete(connection);
  if (connection !== globalThis.$db && connection.isOpen) {
    connection.close();
  }
}
