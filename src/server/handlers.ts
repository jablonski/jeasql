/**
 * The handler for `op` from a map of operation handlers; throws for an unknown
 * operation. `op` is user input, so only own keys count (not "constructor" etc.).
 */
export function pickHandler<T extends Record<string, unknown>>(handlers: T, op: string): T[keyof T] {
  if (!Object.hasOwn(handlers, op)) {
    throw new Error(`Unknown operation: ${op}`);
  }
  return handlers[op as keyof T];
}
