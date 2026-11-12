import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  alterTable,
  closeDatabase,
  db,
  findObject,
  isWithoutRowid,
  openDatabase,
  deleteRow,
  insertRow,
  readBlob,
  describeTable,
  readTablePage,
  updateCell,
  countRows,
  parseFilters,
} from "../src/server/db.ts";
import { keyJson } from "../src/server/rowKey.ts";
import { tempDatabase } from "./helpers.ts";

tempDatabase();
db().exec(`
  CREATE TABLE plain (a, b TEXT);
  CREATE TABLE norowid (x TEXT, y INTEGER, v, PRIMARY KEY (y, x)) WITHOUT ROWID;
  CREATE TABLE shadow (rowid TEXT PRIMARY KEY, v);
  CREATE VIEW v AS SELECT * FROM plain;
  CREATE TABLE hidden (ROWID TEXT, v);
  CREATE TABLE allhidden (rowid, _rowid_, oid);
`);

describe("keyJson", () => {
  test("turns safe BigInts into numbers and tags large ones and BLOBs", () => {
    assert.equal(
      keyJson({ a: 5n, b: 2n ** 62n, c: new Uint8Array([1, 255]) }),
      `{"a":5,"b":{"$big":"${2n ** 62n}"},"c":{"$hex":"01ff"}}`,
    );
  });
});

describe("keyColumns", () => {
  test("uses rowid for normal tables", () => {
    assert.deepEqual(describeTable("plain")!.keyColumns, ["rowid"]);
  });
  test("uses the primary key in order for WITHOUT ROWID tables", () => {
    assert.deepEqual(describeTable("norowid")!.keyColumns, ["y", "x"]);
  });
  test("uses the primary key when a column hides rowid", () => {
    assert.deepEqual(describeTable("shadow")!.keyColumns, ["rowid"]);
  });
  test("falls back to another rowid alias when a column hides rowid without a primary key", () => {
    assert.deepEqual(describeTable("hidden")!.keyColumns, ["_rowid_"]);
    db().exec("INSERT INTO hidden VALUES ('x', 1)");
    const { rows, rowKey } = readTablePage(describeTable("hidden")!, { limit: 10, offset: 0 });
    const key = rowKey!([...rows][0]);
    assert.deepEqual(updateCell("hidden", key, "v", "2"), { column: "v", value: 2n, key });
  });
  test("returns nothing when all rowid aliases are hidden and there is no primary key", () => {
    assert.deepEqual(describeTable("allhidden")!.keyColumns, []);
  });
  test("returns nothing for views", () => {
    assert.deepEqual(describeTable("v")!.keyColumns, []);
  });
});

describe("updateCell", () => {
  const { rowid } = insertRow("plain", { a: "1", b: "x" });
  const key = { rowid: Number(rowid) };

  test("stores numbers typed into untyped columns as numbers", () => {
    // Read back as BigInt (prepareBig), which proves it is stored as INTEGER, not REAL.
    assert.equal(updateCell("plain", key, "a", "42").value, 42n);
    assert.equal(updateCell("plain", key, "a", "3.5").value, 3.5);
  });
  test("stores REALs in exponent notation as numbers, as the editor shows them", () => {
    assert.equal(updateCell("plain", key, "a", "1.5e-7").value, 1.5e-7);
    assert.equal(updateCell("plain", key, "a", "1e+21").value, 1e21);
  });
  test("folds only ASCII case, like SQLite: Ä and ä are different columns", () => {
    db().exec(
      `CREATE TABLE umlaut ("Ä" TEXT, "ä" TEXT); INSERT INTO umlaut VALUES ('upper', 'lower')`,
    );
    assert.equal(updateCell("umlaut", { rowid: 1 }, "ä", "changed").column, "ä");
    assert.deepEqual(
      { ...db().prepare("SELECT * FROM umlaut").get() },
      { Ä: "upper", ä: "changed" },
    );
  });
  test("matches column names case-insensitively and returns the declared name", () => {
    const stored = updateCell("plain", key, "A", "7");
    assert.equal(stored.column, "a");
    assert.equal(stored.value, 7n);
  });
  test("keeps text that only looks like a number", () => {
    assert.equal(updateCell("plain", key, "a", "007").value, "007");
  });
  test("stores large integers exactly", () => {
    assert.equal(updateCell("plain", key, "a", "9223372036854775807").value, 9223372036854775807n);
  });
  test("leaves typed columns to SQLite", () => {
    assert.equal(updateCell("plain", key, "b", "5").value, "5");
  });
  test("stores and reads BLOBs", () => {
    updateCell("plain", key, "a", new Uint8Array([1, 2, 3]));
    assert.deepEqual([...(readBlob("plain", key, "a") ?? [])], [1, 2, 3]);
  });
  test("accepts a large rowid sent as a string", () => {
    const big = 2n ** 60n;
    insertRow("plain", { a: "big" });
    db().exec(`UPDATE plain SET rowid = ${big} WHERE a = 'big'`);
    assert.equal(updateCell("plain", { rowid: String(big) }, "a", "ok").value, "ok");
  });
  test("accepts a large rowid sent tagged", () => {
    const big = 2n ** 59n + 7n;
    insertRow("plain", { a: "big2" });
    db().exec(`UPDATE plain SET rowid = ${big} WHERE a = 'big2'`);
    const key = JSON.parse(keyJson({ rowid: big }));
    assert.deepEqual(updateCell("plain", key, "a", "ok"), {
      column: "a",
      value: "ok",
      key: { rowid: big },
    });
  });
  test("returns the new key when an INTEGER PRIMARY KEY (the rowid) is edited", () => {
    db().exec("CREATE TABLE ipk (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO ipk VALUES (1, 'a')");
    assert.deepEqual(updateCell("ipk", { rowid: 1 }, "id", "5"), {
      column: "id",
      value: 5n,
      key: { rowid: 5n },
    });
    assert.equal(updateCell("ipk", { rowid: 5 }, "v", "b").value, "b");
  });
  test("returns the new key when a WITHOUT ROWID key column is edited", () => {
    insertRow("norowid", { x: "old", y: "9", v: "a" });
    assert.deepEqual(updateCell("norowid", { y: 9, x: "old" }, "x", "new"), {
      column: "x",
      value: "new",
      key: { y: 9n, x: "new" },
    });
  });
  test("finds rows by a BLOB key", () => {
    db().exec(
      "CREATE TABLE bkey (k BLOB PRIMARY KEY, v) WITHOUT ROWID; INSERT INTO bkey VALUES (x'01ff', 'a')",
    );
    const key = JSON.parse(keyJson({ k: new Uint8Array([1, 255]) }));
    assert.equal(updateCell("bkey", key, "v", "b").value, "b");
  });
  test("keeps integers beyond 64 bits as text", () => {
    assert.equal(
      updateCell("plain", key, "a", "99999999999999999999").value,
      "99999999999999999999",
    );
  });
  test("does not take inherited properties for key columns", () => {
    db().exec("CREATE TABLE proto (constructor TEXT PRIMARY KEY, v) WITHOUT ROWID");
    assert.throws(() => updateCell("proto", {}, "v", "1"), /cannot be identified/);
  });
  test("rejects unknown tables, columns, views and incomplete keys", () => {
    assert.throws(() => updateCell("nope", key, "a", "1"), /Unknown table/);
    assert.throws(() => updateCell("plain", key, "nope", "1"), /Unknown column/);
    assert.throws(() => updateCell("v", key, "a", "1"), /Unknown table/);
    assert.throws(() => updateCell("norowid", { x: "a" }, "v", "1"), /cannot be identified/);
  });
});

describe("insertRow / deleteRow", () => {
  test("keep working after a rowid beyond Number.MAX_SAFE_INTEGER", () => {
    db().exec(`INSERT INTO plain (rowid, a) VALUES (${2n ** 61n}, 'huge')`);
    const { rowid } = insertRow("plain", { a: "next" });
    assert.equal(rowid, 2n ** 61n + 1n);
    deleteRow("plain", { rowid: String(2n ** 61n) });
  });

  test("deletes exactly one row by composite key", () => {
    insertRow("norowid", { x: "k", y: "1", v: "a" });
    deleteRow("norowid", { y: 1, x: "k" });
    assert.throws(() => deleteRow("norowid", { y: 1, x: "k" }), /Expected 1 deleted row/);
  });
  test("inserts defaults when no values are given", () => {
    assert.ok(insertRow("plain", {}).rowid);
  });

  test("stores typed numbers like a cell edit does", () => {
    const { rowid } = insertRow("plain", { a: "42", b: "42" });
    const row = db()
      .prepare("SELECT typeof(a) AS a, typeof(b) AS b FROM plain WHERE rowid = ?")
      .get(rowid!);
    // a has BLOB affinity: number, like updateCell; b is TEXT: SQLite keeps text.
    assert.deepEqual({ ...row }, { a: "integer", b: "text" });
  });
});

describe("alterTable", () => {
  test("returns the message and the table to show next", () => {
    db().exec("CREATE TABLE alt (a)");
    assert.deepEqual(alterTable("alt", { op: "add-column", name: "b" }), {
      notice: "Column added.",
      table: "alt",
    });
    assert.deepEqual(alterTable("alt", { op: "rename-table", name: " alt2 " }), {
      notice: "Table renamed.",
      table: "alt2",
    });
    assert.deepEqual(alterTable("alt2", { op: "drop-table" }), { notice: "Table alt2 dropped." });
    assert.throws(() => alterTable("alt2", { op: "drop-table" }), /Unknown table/);
  });
  test("names the table as declared, not as typed", () => {
    db().exec("CREATE TABLE MixedCase (a)");
    assert.deepEqual(alterTable("mixedcase", { op: "add-column", name: "b" }), {
      notice: "Column added.",
      table: "MixedCase",
    });
    assert.deepEqual(alterTable("MIXEDCASE", { op: "drop-table" }), {
      notice: "Table MixedCase dropped.",
    });
  });
});

describe("readTablePage", () => {
  test("selects the key after the columns, sorts and pages", () => {
    db().exec("CREATE TABLE paged (n INTEGER); INSERT INTO paged VALUES (3), (1), (2);");
    const { rows, rowKey } = readTablePage(describeTable("paged")!, {
      sort: "n",
      dir: "desc",
      limit: 2,
      offset: 1,
    });
    const list = [...rows];
    assert.deepEqual(
      list.map((r) => Number(r[0])),
      [2, 1],
    );
    assert.deepEqual(Object.keys(rowKey!(list[0])), ["rowid"]);
  });
  test("breaks ties by the row key, so pages neither repeat nor skip rows", () => {
    db().exec("CREATE TABLE ties (n INTEGER); INSERT INTO ties VALUES (1), (1), (1), (1);");
    const info = describeTable("ties")!;
    const page = (offset: number) =>
      [...readTablePage(info, { sort: "n", dir: "desc", limit: 2, offset }).rows].map((r) =>
        Number(r[1]),
      );
    assert.deepEqual([...page(0), ...page(2)], [1, 2, 3, 4]);
  });
  test("breaks ties in sorted views by the other columns, as views have no key", () => {
    db().exec(`
      CREATE TABLE viewties (n INTEGER, s TEXT);
      INSERT INTO viewties VALUES (1, 'b'), (1, 'a'), (1, 'c');
      CREATE VIEW vties AS SELECT * FROM viewties;
    `);
    const info = describeTable("vties")!;
    const page = (offset: number) =>
      [...readTablePage(info, { sort: "n", limit: 2, offset }).rows].map((r) => r[1]);
    assert.deepEqual([...page(0), ...page(2)], ["a", "b", "c"]);
  });
  test("ignores unknown sort columns and has no row key for views", () => {
    const { rows, rowKey } = readTablePage(describeTable("v")!, {
      sort: "x; DROP",
      limit: 10,
      offset: 0,
    });
    [...rows];
    assert.equal(rowKey, undefined);
  });
});

describe("isWithoutRowid", () => {
  test("asks SQLite instead of matching the SQL text", () => {
    db().exec("CREATE TABLE fake (a TEXT DEFAULT 'WITHOUT ROWID')");
    db().exec("CREATE TABLE real (a PRIMARY KEY) WITHOUT ROWID");
    assert.equal(isWithoutRowid(findObject("fake")!), false);
    assert.equal(isWithoutRowid(findObject("real")!), true);
  });
});

describe("describeTable", () => {
  test("collects key, BLOB columns and WITHOUT ROWID at once", () => {
    const info = describeTable("real")!;
    assert.deepEqual(info.keyColumns, ["a"]);
    assert.deepEqual(info.blobColumns, ["a"]);
    assert.equal(info.withoutRowid, true);
    assert.equal(describeTable("nope"), undefined);
  });

  test("names the rowid alias only for a single INTEGER PRIMARY KEY in a rowid table", () => {
    db().exec(`
      CREATE TABLE alias_ipk (id integer PRIMARY KEY, v);
      CREATE TABLE alias_textpk (id TEXT PRIMARY KEY);
      CREATE TABLE alias_twopk (a INTEGER, b INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE alias_norowid (id INTEGER PRIMARY KEY) WITHOUT ROWID;
    `);
    assert.equal(describeTable("alias_ipk")!.rowidAlias, "id");
    assert.equal(describeTable("alias_textpk")!.rowidAlias, undefined);
    assert.equal(describeTable("alias_twopk")!.rowidAlias, undefined);
    assert.equal(describeTable("alias_norowid")!.rowidAlias, undefined);
    assert.equal(describeTable("plain")!.rowidAlias, undefined);
  });
});

describe("holdCursor", () => {
  test("a streaming cursor survives switching the database", () => {
    db().exec("CREATE TABLE many (n); INSERT INTO many VALUES (1), (2), (3)");
    const file = db().location()!;
    const rows = readTablePage(describeTable("many")!, { limit: 10, offset: 0 }).rows[
      Symbol.iterator
    ]();
    assert.equal(Number(rows.next().value![0]), 1);
    closeDatabase();
    assert.equal(Number(rows.next().value![0]), 2);
    rows.return?.();
    openDatabase(file);
  });

  test("a cursor that is never read doesn't keep a switched-away connection open", async () => {
    db().exec("CREATE TABLE unread (n); INSERT INTO unread VALUES (1)");
    const file = db().location()!;
    const old = db();
    readTablePage(describeTable("unread")!, { limit: 10, offset: 0 });
    openDatabase(file);
    assert.equal(old.isOpen, true);
    for (let i = 0; i < 20 && old.isOpen; i++) {
      globalThis.gc?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (globalThis.gc) {
      assert.equal(old.isOpen, false);
    }
  });
});

describe("filters", () => {
  db().exec(`
    CREATE TABLE people (name TEXT, age INTEGER);
    INSERT INTO people VALUES ('Ann', 30), ('Bob', 42), ('anna_b', NULL), ('100%', 7);
  `);
  const names = (filters: Record<string, string>) =>
    [...readTablePage(describeTable("people")!, { limit: 10, offset: 0, filters }).rows].map(
      (row) => row[0],
    );

  test("matches text case-insensitively, wildcards literally", () => {
    assert.deepEqual(names({ name: "ann" }), ["Ann", "anna_b"]);
    assert.deepEqual(names({ name: "a_" }), ["anna_b"]);
    assert.deepEqual(names({ name: "%" }), ["100%"]);
  });
  test("negates text, keeping NULLs", () => {
    assert.deepEqual(names({ name: "!ann" }), ["Bob", "100%"]);
    assert.deepEqual(names({ age: "!3" }), ["Bob", "anna_b", "100%"]);
  });
  test("compares numbers and NULL", () => {
    assert.deepEqual(names({ age: ">=30" }), ["Ann", "Bob"]);
    assert.deepEqual(names({ age: "<>42" }), ["Ann", "100%"]);
    assert.deepEqual(names({ age: "NULL" }), ["anna_b"]);
    assert.deepEqual(names({ age: "!null", name: "=Bob" }), ["Bob"]);
  });
  test("counts only matching rows", () => {
    assert.deepEqual(countRows("people", undefined, { age: ">10" }), { count: 2, capped: false });
  });
  test("parseFilters keeps known columns with their declared names", () => {
    assert.deepEqual(
      parseFilters(["name", "age"], { "f.AGE": ">1", "f.x": "1", "f.name": " ", sort: "a" }),
      { age: ">1" },
    );
  });
  test("parseFilters keeps a column named __proto__", () => {
    const filters = parseFilters(["__proto__"], { "f.__proto__": "x" });
    assert.ok(Object.hasOwn(filters, "__proto__"));
    assert.equal(filters["__proto__"], "x");
  });
  test("parseFilters tells apart names that differ only in non-ASCII case", () => {
    assert.deepEqual(Object.keys(parseFilters(["Ä", "ä"], { "f.ä": "1" })), ["ä"]);
  });
});

describe("generated columns", () => {
  test("values line up with columns and keys stay the rowid", () => {
    db().exec(`
      CREATE TABLE gen (a INTEGER, g INTEGER GENERATED ALWAYS AS (a * 100) VIRTUAL, c INTEGER);
      INSERT INTO gen (a, c) VALUES (1, 2), (2, 1);
    `);
    const info = describeTable("gen")!;
    const { rows, rowKey } = readTablePage(info, { limit: 10, offset: 0 });
    const read = [...rows];
    assert.deepEqual(info.columnNames, ["a", "g", "c"]);
    assert.deepEqual(
      read.map((r) => r.slice(0, 3)),
      [
        [1n, 100n, 2n],
        [2n, 200n, 1n],
      ],
    );
    assert.deepEqual(
      read.map((r) => rowKey!(r)),
      [{ rowid: 1n }, { rowid: 2n }],
    );
  });
  test("are listed as generated, sortable and filterable, but can't be written", () => {
    db().exec("CREATE TABLE genblob (a, g GENERATED ALWAYS AS (a) STORED)");
    const info = describeTable("gen")!;
    assert.deepEqual(info.generatedColumns, ["g"]);
    assert.deepEqual(describeTable("genblob")!.blobColumns, ["a"]);
    assert.deepEqual(
      describeTable("genblob")!.cols.map((c) => c.hidden),
      [0, 3],
    );
    const sorted = readTablePage(info, {
      sort: "g",
      dir: "desc",
      filters: { g: ">=100" },
      limit: 10,
      offset: 0,
    });
    assert.deepEqual(
      [...sorted.rows].map((r) => r[1]),
      [200n, 100n],
    );
    assert.throws(() => updateCell("gen", { rowid: 1 }, "g", "5"), /generated/);
  });
});

describe("rowidAlias", () => {
  test("INTEGER PRIMARY KEY DESC is no rowid alias", () => {
    db().exec(`
      CREATE TABLE alias_desc (id INTEGER PRIMARY KEY DESC, v);
      CREATE TABLE alias_lower (id integer primary key, v);
    `);
    assert.equal(describeTable("alias_desc")!.rowidAlias, undefined);
    assert.equal(describeTable("alias_lower")!.rowidAlias, "id");
  });
});
