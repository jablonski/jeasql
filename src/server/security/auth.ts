// Login: credentials from the environment, signed session cookies, logout and rate limiting.
import type { FastifyRequest } from "fastify";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Name of the session cookie. */
export const COOKIE = "session";

const USERNAME = process.env.AUTH_USERNAME ?? "";
const PASSWORD = process.env.AUTH_PASSWORD ?? "";
// Signing key; changing AUTH_SECRET (or the password) logs everyone out.
// Without AUTH_SECRET a random key is used, so a restart logs everyone out.
// (Kept on globalThis so it survives hot reloads in dev mode.)
const SECRET = process.env.AUTH_SECRET || (globalThis.$authSecret ??= randomBytes(32));

/** How long a login lasts (AUTH_SESSION_HOURS, default 12). */
const SESSION_HOURS = Number(process.env.AUTH_SESSION_HOURS);
const SESSION_SECONDS = Math.round((SESSION_HOURS > 0 ? SESSION_HOURS : 12) * 3600);

/**
 * Logged-out session ids → their expiry (ms), so stolen cookies stop working too.
 * In memory only: with a fixed AUTH_SECRET, a restart makes revoked tokens valid
 * again until they expire (documented in the README).
 */
const revoked = (globalThis.$authRevoked ??= new Map());

/** Failed logins allowed per client within LOGIN_WINDOW_MS before it is refused. */
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Failed logins per client IP: count and start of the window. In memory only. */
const failures = (globalThis.$authFailures ??= new Map());

/** True while a client has failed to log in too often and must wait. */
export function loginBlocked(ip: string) {
  const entry = failures.get(ip);
  return Boolean(
    entry && entry.count >= LOGIN_MAX_FAILURES && Date.now() - entry.since < LOGIN_WINDOW_MS,
  );
}

/** Counts a failed login of a client. */
export function recordFailedLogin(ip: string) {
  const now = Date.now();
  // Windows that are over are dropped here, so the map can't grow forever.
  pruneExpired(failures, ({ since }) => now - since >= LOGIN_WINDOW_MS);
  const entry = failures.get(ip) ?? { count: 0, since: now };
  entry.count++;
  failures.set(ip, entry);
}

/** Forgets the failed logins of a client after it logged in successfully. */
export function clearFailedLogins(ip: string) {
  failures.delete(ip);
}

/** Deletes the entries of `map` whose value `isExpired`. */
function pruneExpired<K, V>(map: Map<K, V>, isExpired: (value: V) => boolean) {
  for (const [key, value] of map) {
    if (isExpired(value)) {
      map.delete(key);
    }
  }
}

/** Options for setting and clearing the session cookie. */
export const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: "auto",
  maxAge: SESSION_SECONDS,
} as const;

/** The app is usable only when both AUTH_USERNAME and AUTH_PASSWORD are set. */
export const authConfigured = () => Boolean(USERNAME && PASSWORD);

/** HMAC signature of a value with the app secret. */
export const sign = (value: string) =>
  createHmac("sha256", SECRET).update(value).digest("base64url");

/**
 * Constant-time string comparison. Compares HMACs, which always have the same
 * length, so not even the length of the expected value leaks through timing
 * (equal HMACs mean equal strings: a collision of SHA-256 is out of reach).
 */
export function safeEqual(a: string, b: string) {
  const digest = (value: string) => createHmac("sha256", SECRET).update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** Checks submitted credentials against the environment. */
export function checkCredentials(username = "", password = "") {
  // Evaluate both to avoid leaking which one was wrong via timing.
  const userOk = safeEqual(String(username), USERNAME);
  const passOk = safeEqual(String(password), PASSWORD);
  return authConfigured() && userOk && passOk;
}

// The password is signed too, so changing it logs everyone out.
const sessionSig = (id: string, expires: number) =>
  sign(`session:${USERNAME}\0${PASSWORD}\0${id}\0${expires}`);

/** New cookie value proving a successful login: "<id>.<expires>.<signature>". */
// The cookie needs no server-side session store: the signature proves the server
// issued it, the expiry is inside the signed part, and the id allows revoking it.
export function sessionToken() {
  const id = randomBytes(16).toString("base64url");
  const expires = Date.now() + SESSION_SECONDS * 1000;
  return `${id}.${expires}.${sessionSig(id, expires)}`;
}

/** Id and expiry of a valid, unexpired, not logged-out session token, else undefined. */
function readSession(token: unknown) {
  // base64url ids and signatures never contain ".", so splitting is unambiguous.
  const [id = "", exp = "", sig = ""] = String(token ?? "").split(".");
  const expires = Number(exp);
  if (
    !authConfigured() ||
    !id ||
    !Number.isSafeInteger(expires) ||
    expires <= Date.now() ||
    revoked.has(id) ||
    !safeEqual(sig, sessionSig(id, expires))
  ) {
    return undefined;
  }
  return { id, expires };
}

/** True if the request carries a valid session cookie. */
export function isLoggedIn(request: FastifyRequest) {
  return Boolean(readSession(request.cookies?.[COOKIE]));
}

/** Makes the request's session token unusable, even if the cookie was copied. */
export function revokeSession(request: FastifyRequest) {
  const session = readSession(request.cookies?.[COOKIE]);
  const now = Date.now();
  // Expired ids are dropped here, so the revoke list can't grow forever:
  // once a token has expired, readSession rejects it anyway.
  pruneExpired(revoked, (expires) => expires <= now);
  if (session) {
    revoked.set(session.id, session.expires);
  }
}
