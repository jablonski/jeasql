import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { columnsFromForm, insertValues } from "../src/server/http/forms.ts";

describe("insertValues", () => {
  test("handles column names that clash with Object.prototype", () => {
    assert.deepEqual(
      { ...insertValues({ "v.constructor": "x", "v.toString": "" }) },
      { constructor: "x" },
    );
  });
  const file = new Uint8Array([1, 2]);

  test("takes text values and leaves blank ones to the default", () => {
    assert.deepEqual({ ...insertValues({ table: "t", "v.a": "1", "v.b": "" }) }, { a: "1" });
  });
  test("NULL wins over everything", () => {
    assert.deepEqual(
      { ...insertValues({ "v.a": "x", "e.a": "on", "n.a": "on" }, { "f.a": file }) },
      {
        a: null,
      },
    );
  });
  test("empty string wins over file and text", () => {
    assert.deepEqual({ ...insertValues({ "v.a": "x", "e.a": "on" }, { "f.a": file }) }, { a: "" });
  });
  test("a file wins over text", () => {
    assert.deepEqual({ ...insertValues({ "v.a": "x" }, { "f.a": file }) }, { a: file });
  });
  test("ignores unrelated fields", () => {
    assert.deepEqual({ ...insertValues({ op: "insert", table: "t", "x.a": "1" }) }, {});
  });
  test("keeps column names with dots", () => {
    assert.deepEqual({ ...insertValues({ "v.a.b": "1" }) }, { "a.b": "1" });
  });
});

describe("columnsFromForm", () => {
  test("reads indexed fields and skips rows without a name", () => {
    assert.deepEqual(
      columnsFromForm({
        table: "t",
        "name.0": "id",
        "type.0": "INTEGER",
        "pk.0": "on",
        "name.1": "  ",
        "type.1": "TEXT",
        "name.2": "label",
        "type.2": "TEXT",
        "notnull.2": "on",
        "unique.2": "on",
        "dflt.2": "x",
      }),
      [
        { name: "id", type: "INTEGER", pk: true, notnull: false, unique: false, dflt: undefined },
        { name: "label", type: "TEXT", pk: false, notnull: true, unique: true, dflt: "x" },
      ],
    );
  });
});
