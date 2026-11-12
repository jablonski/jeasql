/** Parses JSON from a data attribute; `fallback` if it is missing or invalid. */
export function parseJson<T>(text: string | undefined, fallback: T): T {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}
