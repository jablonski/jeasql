// Flash messages: a notice or error shown once after a redirect, passed in the URL.
// The params notice, error and sig are removed from the URL again by browser/scripts/flash.ts.
import { field } from "../lib/fields.ts";
import { safeEqual, sign } from "../security/auth.ts";

/**
 * Flash message params with a signature, so only the app itself can show
 * notices and errors (no spoofed messages via crafted links).
 */
export function signFlash({ notice = "", error = "" }: { notice?: string; error?: string }) {
  return { notice, error, sig: sign(`flash:${notice}\0${error}`) };
}

/** Returns the flash message of a query if its signature is valid, else nothing. */
export function readFlash(query: Record<string, string>) {
  const notice = field(query, "notice");
  const error = field(query, "error");
  if (!(notice || error) || !safeEqual(field(query, "sig"), signFlash({ notice, error }).sig)) {
    return { notice: "", error: "" };
  }
  return { notice, error };
}
