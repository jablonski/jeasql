// Per-request memoization, for lookups several components of one page repeat.
import { listObjects } from "./db.ts";
import type { SchemaObject } from "./db.ts";
import { attempt } from "./errors.ts";
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

/**
 * listObjects, queried once per request (the overview and the sidebar both list them).
 * Never throws: on failure the value is [] and `error` says why (see attempt).
 */
export const memoListObjects = (context: ThisContext | undefined) =>
  attempt<SchemaObject[]>(() => perRequest(context, "listObjects", listObjects), []);
