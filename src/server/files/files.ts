// Files on disk: finding SQLite databases and reading their details.
import { readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

/** File extensions listed as SQLite databases on the open page. */
const DATABASE_EXTENSIONS = [".db", ".sqlite", ".sqlite3", ".db3"];

/** SQLite files (by extension) in the server's working directory. */
export function findDatabaseFiles(dir = process.cwd()) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && DATABASE_EXTENSIONS.includes(extname(entry.name).toLowerCase()),
      )
      .map((entry) => resolve(dir, entry.name))
      .toSorted();
  } catch {
    return [];
  }
}

/** Size and modification time of a file, or undefined if it is gone. */
export function fileInfo(file: string) {
  try {
    const { size, mtime } = statSync(file);
    return { size, mtime };
  } catch {
    return undefined;
  }
}
