// Per-request memoization, for lookups several components of one page repeat.
import type { FastifyRequest } from "fastify";
import type { SchemaObject } from "../db.ts";
import { listObjects } from "../db.ts";
import { attempt } from "../lib/errors.ts";

const caches = new WeakMap<object, Map<string, unknown>>();

/**
 * The value of `fn` for this request, computed once; later calls with the same
 * `key` in the same request get the stored value. Errors are not stored. Without a
 * request (e.g. a component rendered on its own by jsxToString) `fn` just runs.
 * Only for reads whose result can't change during the request's rendering.
 */
export function perRequest<T>(request: FastifyRequest | undefined, key: string, fn: () => T): T {
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
export const memoListObjects = (request: FastifyRequest | undefined) =>
  attempt<SchemaObject[]>(() => perRequest(request, "listObjects", listObjects), []);
