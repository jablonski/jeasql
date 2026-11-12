import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  alterTable,
  tableColumns,
  COUNT_LIMIT,
  countRows,
  createTable,
  db,
  findObject,
  hasBlobAffinity,
  listObjects,
  schemaMap,
  tryCount,
} from "../src/server/db.ts";
import { countLabel } from "../src/server/paging.ts";
import { tempDatabase } from "./helpers.ts";

tempDatabase();

const sqlOf = (name: string) => findObject(name)?.sql ?? "";

describe("createTable", () => {
  test("returns the trimmed name and builds column definitions", () => {
    const name = createTable("  people ", [
      { name: "id", type: "INTEGER", pk: true },
      { name: "name", type: "TEXT", notnull: true, unique: true, dflt: "it's" },
      { name: "age", type: "", dflt: "42" },
      { name: "created", type: "TEXT", dflt: "current_timestamp" },
    ]);
    assert.equal(name, "people");
    const sql = sqlOf("people");
    assert.match(sql, /"id" INTEGER PRIMARY KEY/);
    assert.match(sql, /"name" TEXT NOT NULL UNIQUE DEFAULT 'it''s'/);
    assert.match(sql, /"age" DEFAULT 42/);
    assert.match(sql, /"created" TEXT DEFAULT CURRENT_TIMESTAMP/);
  });
  test("rejects a missing name, no columns and unsafe types", () => {
    assert.throws(() => createTable(" ", [{ name: "a" }]), /Table name is required/);
    assert.throws(() => createTable("t", []), /At least one column/);
    assert.throws(() => createTable("t", [{ name: " " }]), /Column name is required/);
    assert.throws(
      () => createTable("t", [{ name: "a", type: "TEXT); DROP" }]),
      /Invalid column type/,
    );
  });
});

describe("alterTable", () => {
  test("adds, renames and drops columns", () => {
    createTable("t1", [{ name: "a" }]);
    assert.deepEqual(
      alterTable("t1", { op: "add-column", name: " b ", type: "TEXT", notnull: true, dflt: "x" }),
      {
        notice: "Column added.",
        table: "t1",
      },
    );
    alterTable("t1", { op: "rename-column", column: "b", name: "c" });
    assert.deepEqual(
      tableColumns("t1").map((c) => c.name),
      ["a", "c"],
    );
    alterTable("t1", { op: "drop-column", column: "c" });
    assert.deepEqual(
      tableColumns("t1").map((c) => c.name),
      ["a"],
    );
  });
  test("renames and drops tables", () => {
    createTable("t2", [{ name: "a" }]);
    assert.equal(alterTable("t2", { op: "rename-table", name: "t3" }).table, "t3");
    assert.equal(findObject("t2"), undefined);
    assert.equal(alterTable("t3", { op: "drop-table" }).table, undefined);
    assert.equal(findObject("t3"), undefined);
  });
  test("rejects unknown tables, operations and empty names", () => {
    createTable("t4", [{ name: "a" }]);
    assert.throws(() => alterTable("nope", { op: "drop-table" }), /Unknown table/);
    assert.throws(() => alterTable("t4", { op: "explode" }), /Unknown operation/);
    assert.throws(() => alterTable("t4", { op: "rename-table", name: " " }), /New table name/);
    assert.throws(() => alterTable("t4", { op: "rename-column", column: "a" }), /New column name/);
  });
});

describe("listObjects / schemaMap", () => {
  test("list tables and views without SQLite internals", () => {
    db().exec(
      "CREATE TABLE auto (id INTEGER PRIMARY KEY AUTOINCREMENT); CREATE VIEW vw AS SELECT id FROM auto;",
    );
    const names = listObjects().map((o) => o.name);
    assert.ok(names.includes("auto") && names.includes("vw"));
    assert.ok(!names.some((n) => n.startsWith("sqlite_")));
    assert.deepEqual(schemaMap().vw, ["id"]);
  });
  test("schemaMap lists the columns of every object in declared order", () => {
    db().exec("CREATE TABLE ordered (z, a, m)");
    const schema = schemaMap();
    assert.deepEqual(schema.ordered, ["z", "a", "m"]);
    assert.deepEqual(Object.keys(schema).toSorted(), listObjects().map((o) => o.name).toSorted());
  });
  test("schemaMap handles tables named like Object.prototype members", () => {
    db().exec('CREATE TABLE "constructor" (a); CREATE TABLE "__proto__" (b)');
    const schema = schemaMap();
    assert.deepEqual(schema.constructor, ["a"]);
    assert.deepEqual(schema["__proto__"], ["b"]);
  });
});

describe("tryCount", () => {
  test("counts exactly, or stops after limit + 1 rows", () => {
    db().exec("CREATE TABLE counted (x); INSERT INTO counted VALUES (1), (2), (3);");
    assert.equal(tryCount("counted"), 3);
    assert.equal(tryCount("counted", 5), 3);
    assert.equal(tryCount("counted", 2), 3); // above the limit: "2+"
    assert.equal(tryCount("counted", 1), 2);
    assert.equal(tryCount("missing"), undefined);
  });
});

describe("findObject", () => {
  test("matches names case-insensitively, like SQLite, returning the declared name", () => {
    db().exec("CREATE TABLE MixedCase (a)");
    assert.equal(findObject("mixedcase")?.name, "MixedCase");
    assert.equal(alterTable("MIXEDCASE", { op: "add-column", name: "b" }).notice, "Column added.");
  });
});

describe("countRows", () => {
  test("counts exactly up to COUNT_LIMIT, then reports a capped count", () => {
    assert.deepEqual(countRows("counted"), { count: 3, capped: false });
    assert.deepEqual(countRows("missing"), { count: undefined, capped: false });
    db().exec(
      `CREATE TABLE big (n); WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n <= ${COUNT_LIMIT}) INSERT INTO big SELECT n FROM s`,
    );
    assert.deepEqual(countRows("big"), { count: COUNT_LIMIT, capped: true });
    assert.equal(countLabel(countRows("big")), `${COUNT_LIMIT}+`);
    assert.equal(countLabel(countRows("missing")), "—");
    assert.deepEqual(countRows("counted", 2), { count: 2, capped: true });
  });
});

describe("hasBlobAffinity", () => {
  test("follows SQLite's affinity order", () => {
    assert.equal(hasBlobAffinity(""), true);
    assert.equal(hasBlobAffinity("BLOB"), true);
    assert.equal(hasBlobAffinity("INTBLOB"), false);
    assert.equal(hasBlobAffinity("TEXT"), false);
  });
});

describe("alterTable column checks", () => {
  test("requires a column for rename and drop", () => {
    db().exec("CREATE TABLE alt (a, b)");
    assert.throws(() => alterTable("alt", { op: "drop-column" }), /Column is required/);
    assert.throws(
      () => alterTable("alt", { op: "rename-column", name: "c" }),
      /Column is required/,
    );
  });
});

describe("createTable keys and defaults", () => {
  test("several primary key columns make one composite key", () => {
    createTable("composite", [
      { name: " a ", type: "TEXT", pk: true },
      { name: "b", type: "INTEGER", pk: true },
      { name: "c" },
    ]);
    assert.deepEqual(
      tableColumns("composite").map((c) => [c.name, c.pk]),
      [["a", 1], ["b", 2], ["c", 0]],
    );
  });

  test("numeric and BLOB defaults are kept as literals", () => {
    createTable("defaults", [
      { name: "e", dflt: "1e5" },
      { name: "p", dflt: "+1" },
      { name: "h", dflt: "0x1F" },
      { name: "x", dflt: "X'00ff'" },
      { name: "t", dflt: "hello" },
    ]);
    assert.deepEqual(
      tableColumns("defaults").map((c) => c.dflt_value),
      ["1e5", "+1", "0x1F", "X'00ff'", "'hello'"],
    );
  });
});

describe("foreign keys", () => {
  test("are enforced", () => {
    assert.equal(Number(db().prepare("PRAGMA foreign_keys").get()!.foreign_keys), 1);
    db().exec("CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (p REFERENCES parent(id))");
    assert.throws(() => db().exec("INSERT INTO child VALUES (42)"), /FOREIGN KEY/);
  });
});
