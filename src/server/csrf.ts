// Protection against cross-site request forgery (CSRF).
import type { IncomingHttpHeaders } from "node:http";

/**
 * True if the request was triggered by another site (CSRF). Uses Sec-Fetch-Site
 * where the browser sends it, else compares the Origin header with the Host
 * (`request.host`, which follows X-Forwarded-Host when TRUST_PROXY is set).
 */
export function isCrossSite(request: { headers: IncomingHttpHeaders; host?: string }): boolean {
  const site = request.headers["sec-fetch-site"];
  // "none" means the user typed the URL or used a bookmark.
  if (site) {
    return site !== "same-origin" && site !== "none";
  }
  const origin = request.headers.origin;
  // No Origin: an old browser or a non-browser client (curl). Those can't be
  // tricked into sending the session cookie from another site.
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).host !== (request.host ?? request.headers.host);
  } catch {
    return true;
  }
}

/**
 * True if a request must be refused because another site triggered it: anything
 * but GET, since every change (and every SQL query) is a POST.
 * Plain cross-site links to pages stay allowed.
 */
export function blockCrossSite(request: {
  method: string;
  headers: IncomingHttpHeaders;
  host?: string;
}): boolean {
  return request.method !== "GET" && isCrossSite(request);
}
