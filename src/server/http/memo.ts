// Per-request memoization, for lookups several components of one page repeat.
import type { FastifyRequest } from "fastify";

const caches = new WeakMap<object, Map<unknown, unknown>>();

/**
 * The value of `fn` for this request, computed once; later calls with the same
 * `key` in the same request get the stored value. The key is `fn` itself unless
 * given, so pass a module-level function (perRequest(request, listObjects)), not
 * an inline closure, which is new on every call. Errors are not stored. Without a
 * request (e.g. a component rendered on its own by jsxToString) `fn` just runs.
 * Only for reads whose result can't change during the request's rendering.
 */
export function perRequest<T>(
  request: FastifyRequest | undefined,
  fn: () => T,
  key: unknown = fn,
): T {
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
