import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { keyJson, keyLabel, keyValue, parseKey } from "../src/server/db/rowKey.ts";

describe("parseKey", () => {
  test("accepts objects and their JSON text; missing means {}", () => {
    assert.deepEqual(parseKey('{"rowid":1}'), { rowid: 1 });
    assert.deepEqual(parseKey({ a: "x" }), { a: "x" });
    assert.deepEqual(parseKey(""), {});
    assert.deepEqual(parseKey(undefined), {});
  });
  test("rejects anything that is no object", () => {
    for (const bad of ["[1]", "null", "5", '"x"']) {
      assert.throws(() => parseKey(bad), /Invalid row key/, bad);
    }
  });
});

describe("keyValue", () => {
  test("turns keyJson's tags back into BigInt and bytes", () => {
    const key = JSON.parse(keyJson({ big: 2n ** 62n, bytes: new Uint8Array([1, 255]), n: 5n }));
    assert.equal(keyValue(key.big), 2n ** 62n);
    assert.deepEqual(keyValue(key.bytes), new Uint8Array([1, 255]));
    assert.equal(keyValue(key.n), 5);
  });
  test("rejects other objects", () => {
    assert.throws(() => keyValue({}), /Invalid row key/);
    assert.throws(() => keyValue({ $big: "1.5" }), /Invalid row key/);
    assert.throws(() => keyValue({ $hex: "abc" }), /Invalid row key/);
  });
});

describe("keyLabel", () => {
  test("joins the given columns in their order, BLOBs as hex", () => {
    const key = JSON.parse(keyJson({ b: new Uint8Array([10]), a: 2n }));
    assert.equal(keyLabel(key, ["a", "b"]), "2-0a");
  });
  test("ignores other properties of the key, even invalid ones", () => {
    assert.equal(keyLabel({ rowid: 1, x: {} }, ["rowid"]), "1");
  });
});
