// Flash messages: a notice or error shown once after a redirect, passed in the URL.
import { safeEqual, sign } from "./auth.ts";

/**
 * Flash message params with a signature, so only the app itself can show
 * notices and errors (no spoofed messages via crafted links).
 */
export function signFlash({ notice = "", error = "" }: { notice?: string; error?: string }) {
  return { notice, error, sig: sign(`flash:${notice}\0${error}`) };
}

/** Returns the flash message of a query if its signature is valid, else nothing. */
export function readFlash(query: Record<string, string>) {
  const notice = String(query.notice ?? "");
  const error = String(query.error ?? "");
  if (!(notice || error) || !safeEqual(String(query.sig ?? ""), signFlash({ notice, error }).sig)) {
    return { notice: "", error: "" };
  }
  return { notice, error };
}
