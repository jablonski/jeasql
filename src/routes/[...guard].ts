import type { FastifyRequest } from "fastify";
import { dbPath } from "../server/db.ts";
import { errorResponse, jsonError, wantsJson } from "../server/http/request.ts";
import { url } from "../server/http/url.ts";
import { isLoggedIn } from "../server/security/auth.ts";
import { blockCrossSite } from "../server/security/csrf.ts";
import type { RouteProps, ThisContext } from "../types.d.ts";

/** Routes that work without logging in. */
const PUBLIC_ROUTES = [
  url("/login"),
  url("/health"),
  url("/index.js"),
  url("/index.css"),
  url("/favicon.svg"),
  url("/robots.txt"),
];

/** Routes that work without an open database. */
const OPEN_ROUTES = [
  ...PUBLIC_ROUTES,
  url("/logout"),
  url("/open-database"),
  url("/close-database"),
];

/**
 * Behind a proxy without TRUST_PROXY, every client has the proxy's IP, so failed
 * logins of one client would lock out all of them. Logs a warning once.
 */
function warnOnceIfProxyUntrusted(request: FastifyRequest) {
  if (
    request.headers["x-forwarded-for"] &&
    // Same check as trustProxy in jeasx.config.js.
    process.env.TRUST_PROXY !== "true" &&
    !globalThis.$proxyWarned
  ) {
    globalThis.$proxyWarned = true;
    request.log.warn(
      "X-Forwarded-For received but TRUST_PROXY is not set: all clients share the proxy's IP for login rate limiting.",
    );
  }
}

/**
 * Redirects to the login page while not logged in (the login page explains a missing AUTH_USERNAME / AUTH_PASSWORD setup),
 * and to the open page while no database is open.
 * Also shares the request with all components via `this` (Layout reads flash messages from it).
 */
export default function (this: ThisContext, { request, reply }: RouteProps) {
  this.request = request;
  this.reply = reply;

  warnOnceIfProxyUntrusted(request);

  if (blockCrossSite(request)) {
    return errorResponse(request, reply, 403, "Cross-site request blocked");
  }

  if (!PUBLIC_ROUTES.includes(request.path) && !isLoggedIn(request)) {
    // Scripts (fetch with JSON) get an error they can show instead of the login page's HTML.
    if (wantsJson(request)) {
      return jsonError(reply, 401, "Session expired – reload the page to log in again.");
    }
    const next = request.method === "GET" ? request.url : undefined;
    return reply.redirect(url("/login", { next }), 303);
  }

  if (!dbPath() && !OPEN_ROUTES.includes(request.path)) {
    if (wantsJson(request)) {
      return jsonError(reply, 409, "No database open – reload the page to open one.");
    }
    return reply.redirect(url("/open-database"), 303);
  }
}
