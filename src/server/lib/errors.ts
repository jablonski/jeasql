/**
 * Runs `fn` and returns its value, or `fallback` plus the error message if it throws.
 * For pages that show an error instead of failing.
 */
export function attempt<T>(fn: () => T, fallback: T): { value: T; error: string } {
  try {
    return { value: fn(), error: "" };
  } catch (e) {
    return { value: fallback, error: errorMessage(e) };
  }
}

/** The message of a thrown value, whatever was thrown. */
export function errorMessage(e: unknown): string {
  return String((e as { message?: unknown } | null)?.message ?? e);
}
