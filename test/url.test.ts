import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { url } from "../src/server/url.ts";

describe("url", () => {
  test("builds paths with encoded params", () => {
    assert.equal(url("/show-table", { name: "a b&c" }), "/show-table?name=a+b%26c");
  });
  test("leaves out undefined, null and empty params", () => {
    assert.equal(url("/x", { a: undefined, b: null, c: "", d: 0 }), "/x?d=0");
  });
  test("works without params", () => {
    assert.equal(url("/"), "/");
  });
});
