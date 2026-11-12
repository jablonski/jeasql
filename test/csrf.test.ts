import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blockCrossSite, isCrossSite } from "../src/server/security/csrf.ts";

const req = (headers: Record<string, string>, method = "GET") => ({
  method,
  headers: { host: "app.example", ...headers },
});

describe("isCrossSite", () => {
  test("trusts Sec-Fetch-Site when the browser sends it", () => {
    assert.equal(isCrossSite(req({ "sec-fetch-site": "same-origin" })), false);
    assert.equal(isCrossSite(req({ "sec-fetch-site": "none" })), false); // typed URL, bookmark
    assert.equal(isCrossSite(req({ "sec-fetch-site": "same-site" })), true); // sibling subdomain
    assert.equal(isCrossSite(req({ "sec-fetch-site": "cross-site" })), true);
  });
  test("Sec-Fetch-Site wins over a matching Origin", () => {
    assert.equal(
      isCrossSite(req({ "sec-fetch-site": "cross-site", origin: "https://app.example" })),
      true,
    );
  });
  test("falls back to comparing Origin with Host", () => {
    assert.equal(isCrossSite(req({ origin: "https://app.example" })), false);
    assert.equal(isCrossSite(req({ origin: "https://evil.example" })), true);
    assert.equal(isCrossSite(req({ origin: "https://app.example:8443" })), true);
  });
  test("treats an invalid Origin as cross-site", () => {
    assert.equal(isCrossSite(req({ origin: "null" })), true);
  });
  test("allows requests without either header (old browsers, curl)", () => {
    assert.equal(isCrossSite(req({})), false);
  });
});

describe("blockCrossSite", () => {
  const evil = { "sec-fetch-site": "cross-site" };
  test("blocks cross-site POSTs", () => {
    assert.equal(blockCrossSite(req(evil, "POST")), true);
  });
  test("allows cross-site links to pages", () => {
    assert.equal(blockCrossSite(req(evil, "GET")), false);
  });
  test("allows everything from the same origin", () => {
    const same = { "sec-fetch-site": "same-origin" };
    assert.equal(blockCrossSite(req(same, "POST")), false);
  });
});

describe("isCrossSite behind a proxy", () => {
  test("compares Origin with request.host (proxy-aware) when given", () => {
    const headers = { host: "internal:3000", origin: "https://app.example" };
    assert.equal(isCrossSite({ headers }), true);
    assert.equal(isCrossSite({ headers, host: "app.example" }), false);
  });
});
