import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isReadOnly, parseNumber, parseSql, SQL_NUMBER } from "../src/server/db/sql.ts";

const statements = (sql: string) => parseSql(sql).statements;

describe("parseSql", () => {
  test("splits at semicolons", () => {
    assert.deepEqual(statements("SELECT 1; SELECT 2"), ["SELECT 1", " SELECT 2"]);
  });

  test("ignores semicolons in strings, quoted names and comments", () => {
    const sql = `SELECT ';', ";", [;], \`;\` -- ;\n/* ; */ FROM t`;
    assert.equal(statements(sql).length, 1);
  });

  test("handles escaped quotes", () => {
    assert.equal(statements("SELECT 'it''s; fine'").length, 1);
  });

  test("drops empty and comment-only parts", () => {
    assert.deepEqual(statements("SELECT 1; -- done\n;  "), ["SELECT 1"]);
  });

  test("flags triggers", () => {
    assert.equal(parseSql("CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; END;").trigger, true);
  });

  test("does not see triggers inside strings or comments", () => {
    assert.equal(parseSql("SELECT 'create trigger'; SELECT 2").trigger, false);
    assert.equal(parseSql("SELECT 1; -- create trigger\nSELECT 2").trigger, false);
  });
});

describe("isReadOnly", () => {
  for (const sql of [
    "SELECT * FROM t",
    "  select 1",
    "WITH x AS (SELECT 1) SELECT * FROM x",
    "VALUES (1), (2)",
    "EXPLAIN QUERY PLAN SELECT 1",
    "SELECT 'drop table t'",
    "/* delete */ SELECT 1",
  ]) {
    test(`allows: ${sql}`, () => assert.equal(isReadOnly(parseSql(sql)), true));
  }

  for (const sql of [
    "DELETE FROM t",
    "WITH x AS (SELECT 1) DELETE FROM t",
    "SELECT 1; DROP TABLE t",
    "INSERT INTO t VALUES (1) RETURNING *",
    "PRAGMA user_version = 3",
    "ATTACH 'x.db' AS x",
    "",
  ]) {
    test(`rejects: ${sql || "(empty)"}`, () => assert.equal(isReadOnly(parseSql(sql)), false));
  }
});

describe("parseNumber / SQL_NUMBER", () => {
  test("parses canonical numbers: integers as BigInt, decimals as numbers", () => {
    assert.equal(parseNumber("-12"), -12n);
    assert.equal(parseNumber("3.5"), 3.5);
    assert.equal(parseNumber("1.5e-7"), 1.5e-7);
    assert.equal(parseNumber("1e+21"), 1e21);
  });
  test("keeps non-canonical or lossy forms as text", () => {
    for (const value of [
      "007",
      "+1",
      ".5",
      "1.",
      "0x1F",
      "1e999",
      "9223372036854775808",
      "",
      "abc",
    ]) {
      assert.equal(parseNumber(value), undefined, value);
    }
  });
  test("SQL_NUMBER accepts every SQL numeric literal", () => {
    for (const value of ["42", "-1.5", ".5", "1.", "1e5", "+3", "0x1F", "007"]) {
      assert.ok(SQL_NUMBER.test(value), value);
    }
    assert.ok(!SQL_NUMBER.test("1e"));
    assert.ok(!SQL_NUMBER.test("0x"));
  });
});
