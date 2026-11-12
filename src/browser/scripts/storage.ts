// Per-tab storage (sessionStorage) under the "jeasql:" prefix. Storage may be blocked
// (privacy settings, sandboxed frames): then nothing is kept and reads return null.

const PREFIX = "jeasql:";

/** The stored text for `key`, or null if there is none or storage is blocked. */
export function load(key: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Stores `value` for `key`; does nothing if storage is blocked. */
export function save(key: string, value: string) {
  try {
    sessionStorage.setItem(PREFIX + key, value);
  } catch {}
}
