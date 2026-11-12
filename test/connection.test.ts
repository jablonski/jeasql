// Runs without a shared database: these tests open, close and switch databases themselves.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { closeDatabase, db, dbPath, openDatabase, PAGE_SIZE, parsePage } from "../src/server/db.ts";

process.env.AUTH_USERNAME = "admin";
process.env.AUTH_PASSWORD = "secret";
const { COOKIE, sessionToken } = await import("../src/server/security/auth.ts");
const guard = (await import("../src/routes/[...guard].ts")).default;

const dir = mkdtempSync(join(tmpdir(), "jeasql-test-"));
after(() => {
  if (dbPath()) {
    if (db().isTransaction) {
      db().exec("ROLLBACK");
    }
    closeDatabase();
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("open transactions", () => {
  test("block switching and closing the database, which would roll them back", () => {
    const first = openDatabase(join(dir, "a.db"), true);
    db().exec("CREATE TABLE t (a); BEGIN; INSERT INTO t VALUES (1)");
    assert.throws(() => openDatabase(join(dir, "b.db"), true), /transaction is open/);
    assert.throws(() => closeDatabase(), /transaction is open/);
    assert.equal(dbPath(), first);
    db().exec("COMMIT");
    closeDatabase();
    assert.equal(dbPath(), "");
  });
});

describe("guard without an open database", () => {
  test("answers scripts with 409 JSON instead of redirecting to the open page", () => {
    closeDatabase();
    let status = 0;
    const reply = {
      status(code: number) {
        status = code;
        return reply;
      },
      type: () => reply,
      redirect: () => assert.fail("redirected"),
    };
    const request = {
      method: "POST",
      path: "/update-cell",
      url: "/update-cell",
      headers: { accept: "application/json" },
      cookies: { [COOKIE]: sessionToken() },
    };
    const result = guard.call({}, { request, reply } as any);
    assert.equal(status, 409);
    assert.match(String(result), /"error":"No database open/);
  });
});

describe("parsePage", () => {
  test("clamps to 1, to `pages`, and to pages whose offset can still be bound", () => {
    assert.equal(parsePage("0"), 1);
    assert.equal(parsePage("abc"), 1);
    assert.equal(parsePage("7", 3), 3);
    const max = parsePage("99999999999999999999");
    assert.ok(Number.isSafeInteger((max - 1) * PAGE_SIZE));
  });
});
