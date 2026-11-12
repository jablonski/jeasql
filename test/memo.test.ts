import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { perRequest } from "../src/server/memo.ts";
import type { FastifyRequest } from "fastify";

describe("perRequest", () => {
  test("computes once per request and key", () => {
    const request = {} as FastifyRequest;
    let calls = 0;
    const fn = () => ++calls;
    assert.equal(perRequest({ request }, "k", fn), 1);
    assert.equal(perRequest({ request }, "k", fn), 1);
    assert.equal(perRequest({ request }, "other", fn), 2);
    assert.equal(perRequest({ request: {} as FastifyRequest }, "k", fn), 3);
  });
  test("runs every time without a request, and does not store errors", () => {
    let calls = 0;
    assert.equal(
      perRequest({}, "k", () => ++calls),
      1,
    );
    assert.equal(
      perRequest(undefined, "k", () => ++calls),
      2,
    );
    const request = {} as FastifyRequest;
    assert.throws(() =>
      perRequest({ request }, "e", () => {
        throw new Error("x");
      }),
    );
    assert.equal(
      perRequest({ request }, "e", () => "ok"),
      "ok",
    );
  });
});
