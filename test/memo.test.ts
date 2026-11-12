import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { perRequest } from "../src/server/http/memo.ts";
import type { FastifyRequest } from "fastify";

describe("perRequest", () => {
  test("computes once per request and function", () => {
    const request = {} as FastifyRequest;
    let calls = 0;
    const fn = () => ++calls;
    const other = () => ++calls;
    assert.equal(perRequest(request, fn), 1);
    assert.equal(perRequest(request, fn), 1);
    assert.equal(perRequest(request, other), 2);
    assert.equal(perRequest({} as FastifyRequest, fn), 3);
  });
  test("an explicit key overrides the function as key", () => {
    const request = {} as FastifyRequest;
    let calls = 0;
    const fn = () => ++calls;
    assert.equal(perRequest(request, fn, "a"), 1);
    assert.equal(perRequest(request, fn, "a"), 1);
    assert.equal(perRequest(request, fn, "b"), 2);
  });
  test("runs every time without a request, and does not store errors", () => {
    let calls = 0;
    const fn = () => ++calls;
    assert.equal(perRequest(undefined, fn), 1);
    assert.equal(perRequest(undefined, fn), 2);
    const request = {} as FastifyRequest;
    assert.throws(() =>
      perRequest(
        request,
        () => {
          throw new Error("x");
        },
        "e",
      ),
    );
    assert.equal(
      perRequest(request, () => "ok", "e"),
      "ok",
    );
  });
});
