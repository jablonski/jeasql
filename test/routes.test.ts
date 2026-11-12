// Route handlers called directly with a fake request and reply (no server needed).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../src/server/db.ts";
import { tempDatabase } from "./helpers.ts";

// auth.ts reads the credentials when it is loaded, so set them before importing it.
process.env.AUTH_USERNAME = "admin";
process.env.AUTH_PASSWORD = "secret";
const { COOKIE, sessionToken } = await import("../src/server/auth.ts");
const { readFlash } = await import("../src/server/flash.ts");
const guard = (await import("../src/routes/[...guard].ts")).default;
const alterTable = (await import("../src/routes/[alter-table].ts")).default;
const updateRow = (await import("../src/routes/[update-row].ts")).default;
const logout = (await import("../src/routes/[logout].ts")).default;

tempDatabase();

type Fake = { code?: number; location?: string; cookies: string[]; result?: unknown };

/** A request plus a reply that records status, redirect target and cleared cookies. */
function call(
  handler: (this: object, props: any) => unknown,
  {
    method = "GET",
    path = "/",
    body = {},
    headers = {},
    loggedIn = true,
  }: {
    method?: string;
    path?: string;
    body?: Record<string, string>;
    headers?: Record<string, string>;
    loggedIn?: boolean;
  } = {},
) {
  const fake: Fake = { cookies: [] };
  const reply = {
    status(code: number) {
      fake.code = code;
      return reply;
    },
    redirect(location: string, code: number) {
      fake.location = location;
      fake.code = code;
      return reply;
    },
    header: () => reply,
    type: () => reply,
    clearCookie(name: string) {
      fake.cookies.push(name);
      return reply;
    },
  };
  const request = {
    method,
    path,
    url: path,
    headers,
    body,
    query: {},
    cookies: loggedIn ? { [COOKIE]: sessionToken() } : {},
    isMultipart: () => false,
  };
  // The same object the reply writes to, so async handlers fill it in after `await result`.
  return Object.assign(fake, { result: handler.call({}, { request, reply }) });
}

/** The flash message of a redirect target, if its signature is valid. */
const flashOf = (location = "") =>
  readFlash(Object.fromEntries(new URL(location, "http://x").searchParams));

describe("guard", () => {
  test("sends visitors to the login page, remembering where they wanted to go", () => {
    const { code, location } = call(guard, { path: "/show-table", loggedIn: false });
    assert.equal(code, 303);
    assert.equal(location, "/login?next=%2Fshow-table");
  });

  test("answers scripts with 401 JSON instead of a redirect", () => {
    const { code, result } = call(guard, {
      method: "POST",
      path: "/update-cell",
      headers: { accept: "application/json" },
      loggedIn: false,
    });
    assert.equal(code, 401);
    // A string, not an object: Jeasx would merge an object returned by a guard into the props.
    assert.equal(typeof result, "string");
    assert.match(JSON.parse(result as string).error, /Session expired/);
  });

  test("lets public routes and logged-in users through", () => {
    assert.equal(call(guard, { path: "/login", loggedIn: false }).code, undefined);
    assert.equal(call(guard, { path: "/" }).code, undefined);
  });

  test("blocks cross-site POSTs", () => {
    const { code } = call(guard, { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
    assert.equal(code, 403);
  });

  test("answers scripts' cross-site requests with JSON too", () => {
    const { code, result } = call(guard, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", accept: "application/json" },
    });
    assert.equal(code, 403);
    assert.equal(JSON.parse(result as string).error, "Cross-site request blocked");
  });
});

describe("postOnly routes", () => {
  test("refuse GET with 405", () => {
    assert.equal(call(alterTable).code, 405);
    assert.equal(call(logout).code, 405);
  });

  test("logout clears the cookie and goes to the login page", () => {
    const { location, cookies } = call(logout, { method: "POST" });
    assert.equal(location, "/login");
    assert.deepEqual(cookies, [COOKIE]);
  });
});

describe("alter-table", () => {
  test("redirects to the table with a signed notice", () => {
    db().exec("CREATE TABLE r (a, b)");
    const { code, location } = call(alterTable, {
      method: "POST",
      body: { table: "r", op: "drop-column", column: "b" },
    });
    assert.equal(code, 303);
    assert.match(location!, /^\/show-table\?name=r/);
    assert.deepEqual(flashOf(location), { notice: "Column dropped.", error: "" });
  });

  test("shows errors on the table page, or the overview for an unknown table", () => {
    const own = call(alterTable, { method: "POST", body: { table: "r", op: "drop-column" } });
    assert.match(own.location!, /^\/show-table\?name=r/);
    assert.equal(flashOf(own.location).error, "Column is required");
    const unknown = call(alterTable, { method: "POST", body: { table: "nope", op: "drop-table" } });
    assert.match(unknown.location!, /^\/\?/);
    assert.equal(flashOf(unknown.location).error, "Unknown table: nope");
  });

  test("a tampered flash message is not shown", () => {
    const { location } = call(alterTable, {
      method: "POST",
      body: { table: "r", op: "rename-table", name: "r2" },
    });
    assert.deepEqual(flashOf(location!.replace("renamed", "hacked")), { notice: "", error: "" });
  });
});

describe("update-row", () => {
  test("inserts and deletes rows", async () => {
    db().exec("CREATE TABLE ins (a)");
    const added = call(updateRow, {
      method: "POST",
      body: { table: "ins", op: "insert", "v.a": "x" },
    });
    await added.result;
    assert.equal(flashOf(added.location).notice, "Row added (rowid 1).");
    const deleted = call(updateRow, {
      method: "POST",
      body: { table: "ins", op: "delete", key: '{"rowid":1}' },
    });
    await deleted.result;
    assert.equal(flashOf(deleted.location).notice, "Row deleted.");
  });

  test("reports unknown operations", async () => {
    const response = call(updateRow, {
      method: "POST",
      body: { table: "ins", op: "explode" },
    });
    await response.result;
    assert.equal(flashOf(response.location).error, "Unknown operation: explode");
  });
});
