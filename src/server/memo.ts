// Per-request memoization, for lookups several components of one page repeat.
import { listObjects } from "./db.ts";
import type { ThisContext } from "../types.d.ts";

const caches = new WeakMap<object, Map<string, unknown>>();

/**
 * The value of `fn` for this request, computed once; later calls with the same
 * `key` in the same request get the stored value. Errors are not stored. Without a
 * request (e.g. a component rendered on its own by jsxToString) `fn` just runs.
 * Only for reads whose result can't change during the request's rendering.
 */
export function perRequest<T>(context: ThisContext | undefined, key: string, fn: () => T): T {
  const request = context?.request;
  if (!request) {
    return fn();
  }
  let cache = caches.get(request);
  if (!cache) {
    caches.set(request, (cache = new Map()));
  }
  if (!cache.has(key)) {
    cache.set(key, fn());
  }
  return cache.get(key) as T;
}

/** listObjects, queried once per request (the overview and the sidebar both list them). */
export const memoListObjects = (context: ThisContext | undefined) =>
  perRequest(context, "listObjects", listObjects);
