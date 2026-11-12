import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { closeDatabase, openDatabase } from "../src/server/db.ts";

/** Opens a fresh database file in a temp folder, removed after the tests. */
export function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "jeasql-test-"));
  openDatabase(join(dir, "test.db"), true);
  after(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });
}
