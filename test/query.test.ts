// runQuery against a real database (sql.test.ts covers parsing without one).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db, findObject, isPageable, parseSql, runQuery } from "../src/server/db.ts";
import { tempDatabase } from "./helpers.ts";

tempDatabase();

const count = (table: string) => Number(db().prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n);

describe("runQuery", () => {
  test("keeps columns that share a name apart", () => {
    const { columns, rows } = runQuery("SELECT 1 AS id, 2 AS id");
    assert.deepEqual(columns, ["id", "id"]);
    assert.deepEqual(
      [...rows].map((r) => r.map(Number)),
      [[1, 2]],
    );
  });

  test("runs several statements all or nothing", () => {
    db().exec("CREATE TABLE atom (a INTEGER)");
    assert.throws(() => runQuery("INSERT INTO atom VALUES (1); INSERT INTO nope VALUES (2)"));
    assert.equal(count("atom"), 0);
    assert.equal(db().isTransaction, false);
  });

  test("leaves explicit transactions and triggers to the SQL", () => {
    runQuery("BEGIN; INSERT INTO atom VALUES (1); COMMIT");
    runQuery(
      "CREATE TRIGGER trg AFTER INSERT ON atom BEGIN SELECT 1; END; INSERT INTO atom VALUES (2)",
    );
    assert.equal(count("atom"), 2);
  });

  test("runs a batch with VACUUM, which fails inside a transaction", () => {
    runQuery("INSERT INTO atom VALUES (3); VACUUM");
    assert.equal(count("atom"), 3);
    assert.equal(db().isTransaction, false);
  });

  test("a batch with CASE … END still runs all or nothing", () => {
    db().exec("CREATE TABLE atomic (a)");
    assert.throws(() =>
      runQuery("INSERT INTO atomic VALUES (CASE WHEN 1 THEN 1 END); INSERT INTO nope VALUES (1)"),
    );
    assert.equal(count("atomic"), 0);
  });

  test("a trigger with CASE … END in its body counts as no transaction", () => {
    db().exec("CREATE TABLE trig (a)");
    assert.throws(() =>
      runQuery(
        "CREATE TRIGGER tr AFTER INSERT ON trig BEGIN SELECT CASE WHEN 1 THEN 1 END; END; INSERT INTO nope VALUES (1)",
      ),
    );
    assert.equal(findObject("tr"), undefined);
    assert.equal(db().prepare("SELECT 1 FROM sqlite_schema WHERE name = 'tr'").get(), undefined);
  });
});

describe("runQuery paging", () => {
  test("pages read-only queries inside SQL, keeping duplicate column names", () => {
    db().exec("CREATE TABLE nums (n); INSERT INTO nums VALUES (1), (2), (3), (4)");
    const result = runQuery("SELECT n AS x, n * 10 AS x FROM nums ORDER BY n -- comment", {
      limit: 2,
      offset: 1,
    });
    assert.equal(result.paged, true);
    assert.deepEqual(result.columns, ["x", "x"]);
    assert.deepEqual(
      [...result.rows].map((r) => r.map(Number)),
      [
        [2, 20],
        [3, 30],
      ],
    );
  });

  test("keeps the query's own ORDER BY when paged (also DESC)", () => {
    const result = runQuery("SELECT n FROM nums ORDER BY n DESC", { limit: 2, offset: 1 });
    assert.equal(result.paged, true);
    assert.deepEqual([...result.rows].map((r) => Number(r[0])), [3, 2]);
  });

  test("leaves EXPLAIN and writes unpaged", () => {
    assert.equal(runQuery("EXPLAIN SELECT 1", { limit: 1, offset: 5 }).paged, false);
    assert.equal(isPageable(parseSql("DELETE FROM nums RETURNING n")), false);
  });

  test("a ? placeholder stays NULL when paged, as it does unpaged", () => {
    const paged = runQuery("SELECT ? AS a", { limit: 10, offset: 0 });
    assert.equal(paged.paged, true);
    assert.deepEqual([...paged.rows], [[null]]);
    assert.deepEqual([...runQuery("SELECT ? AS a").rows], [[null]]);
  });
});
