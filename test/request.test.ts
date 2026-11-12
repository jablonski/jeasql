import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { queryParams } from "../src/server/request.ts";

// Plain JavaScript without types; loaded by path so TypeScript doesn't check it.
const configPath: string = "../jeasx.config.js";
const config = (await import(configPath)).default;

describe("queryParams", () => {
  test("keeps the last value of a repeated parameter", () => {
    const params = queryParams({ query: { sort: ["a", "b"], name: "t" } } as any);
    assert.equal(params.sort, "b");
    assert.equal(params.name, "t");
    assert.equal(params.constructor, undefined);
  });
});

describe("TRUST_PROXY", () => {
  const trustProxy = (value: string | undefined) => {
    if (value === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = value;
    }
    return config.FASTIFY_SERVER_OPTIONS().trustProxy;
  };

  test("is on only for true", () => {
    assert.equal(trustProxy("true"), true);
    for (const off of [undefined, "", "1", "TRUE", "yes", "on", "false"]) {
      assert.equal(trustProxy(off), false, String(off));
    }
    delete process.env.TRUST_PROXY;
  });
});
