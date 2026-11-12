// Redirects after a form submission, with flash messages, and safe redirect targets.
import type { FastifyReply } from "fastify";
import { findObject } from "./db.ts";
import { attempt, errorMessage } from "./errors.ts";
import { tableUrl } from "./links.ts";
import { url } from "./url.ts";
import { signFlash } from "./flash.ts";

/** A flash message shown once on the page redirected to. */
type FlashMessage = { notice?: string; error?: string };

// 303, so the browser follows with GET.

/** Redirects to the overview page with a message. */
export function redirectHome(reply: FastifyReply, message: FlashMessage) {
  return reply.redirect(url("/", signFlash(message)), 303);
}

/**
 * Redirects to a table page with a message, or to the overview if there is no
 * such table or view (e.g. the request named one that was dropped meanwhile).
 */
export function redirectTable(reply: FastifyReply, table: string, message: FlashMessage) {
  if (!attempt(() => Boolean(table && findObject(table)), false).value) {
    return redirectHome(reply, message);
  }
  return reply.redirect(tableUrl(table, signFlash(message)), 303);
}

/**
 * Only allow local redirect targets. Browsers treat "\" like "/" and ignore tabs
 * and newlines, so "/\evil.com" or "/\t/evil.com" would also lead off-site.
 */
export function safeNext(next: unknown): string {
  // Must start with exactly one "/" (not "//" or "/\\", which browsers read as
  // another host), and contain no backslash or whitespace anywhere.
  return typeof next === "string" && /^\/(?![/\\])/.test(next) && !/[\\\s]/.test(next)
    ? next
    : url("/");
}

/**
 * Runs a pure action route's `action`, which answers with a redirect. If it throws,
 * redirects to `table` with the error instead (to the overview without such a table).
 */
export function redirectOnError(reply: FastifyReply, table: string, action: () => FastifyReply) {
  try {
    return action();
  } catch (e) {
    return redirectTable(reply, table, { error: errorMessage(e) });
  }
}
