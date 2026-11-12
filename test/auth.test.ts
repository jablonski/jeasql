import assert from "node:assert/strict";
import { describe, test } from "node:test";

// auth.ts reads the credentials when it is loaded.
process.env.AUTH_USERNAME = "admin";
process.env.AUTH_PASSWORD = "secret";
const auth = await import("../src/server/security/auth.ts");
const { safeNext } = await import("../src/server/http/redirect.ts");
const { readFlash, signFlash } = await import("../src/server/http/flash.ts");

const request = (token: string | undefined) =>
  ({ cookies: token === undefined ? {} : { [auth.COOKIE]: token } }) as any;

describe("credentials", () => {
  test("accepts only the configured username and password", () => {
    assert.equal(auth.checkCredentials("admin", "secret"), true);
    assert.equal(auth.checkCredentials("admin", "wrong"), false);
    assert.equal(auth.checkCredentials("other", "secret"), false);
    assert.equal(auth.checkCredentials(), false);
  });
});

describe("sessions", () => {
  test("a fresh token is valid", () => {
    assert.equal(auth.isLoggedIn(request(auth.sessionToken())), true);
  });
  test("missing, garbled and tampered tokens are rejected", () => {
    const token = auth.sessionToken();
    assert.equal(auth.isLoggedIn(request(undefined)), false);
    assert.equal(auth.isLoggedIn(request("nonsense")), false);
    assert.equal(auth.isLoggedIn(request(`${token}x`)), false);
    const [id, , sig] = token.split(".");
    assert.equal(auth.isLoggedIn(request(`${id}.${Date.now() + 1e12}.${sig}`)), false);
  });
  test("a revoked token stops working, others keep working", () => {
    const a = auth.sessionToken();
    const b = auth.sessionToken();
    auth.revokeSession(request(a));
    assert.equal(auth.isLoggedIn(request(a)), false);
    assert.equal(auth.isLoggedIn(request(b)), true);
  });
});

describe("flash messages", () => {
  test("signed messages are shown", () => {
    assert.deepEqual(readFlash(signFlash({ notice: "Saved." })), {
      notice: "Saved.",
      error: "",
    });
  });
  test("changed or unsigned messages are dropped", () => {
    const signed = signFlash({ notice: "Saved." });
    assert.deepEqual(readFlash({ ...signed, notice: "Hacked" }), { notice: "", error: "" });
    assert.deepEqual(readFlash({ error: "Hacked" }), { notice: "", error: "" });
  });
});

describe("safeNext", () => {
  for (const next of ["/", "/show-table?name=x", "/query-database?sql=select%201"]) {
    test(`allows ${next}`, () => assert.equal(safeNext(next), next));
  }
  for (const next of ["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "evil", 5]) {
    test(`rejects ${JSON.stringify(next)}`, () => assert.equal(safeNext(next), "/"));
  }
});

describe("safeEqual", () => {
  test("compares values of any length", () => {
    assert.equal(auth.safeEqual("secret", "secret"), true);
    assert.equal(auth.safeEqual("secret", "secre"), false);
    assert.equal(auth.safeEqual("", "secret"), false);
    assert.equal(auth.safeEqual("", ""), true);
  });
});

describe("login backoff", () => {
  test("blocks a client after too many failures, a success clears it", () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 10; i++) {
      assert.equal(auth.loginBlocked(ip), false);
      auth.recordFailedLogin(ip);
    }
    assert.equal(auth.loginBlocked(ip), true);
    assert.equal(auth.loginBlocked("198.51.100.8"), false);
    auth.clearFailedLogins(ip);
    assert.equal(auth.loginBlocked(ip), false);
  });
});
