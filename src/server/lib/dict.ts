/**
 * An empty record without a prototype, for keys that come from users (form fields,
 * query parameters, table names): "constructor" or "__proto__" stay ordinary entries
 * instead of hitting inherited members.
 */
export function dict<T>(): Record<string, T> {
  return Object.create(null);
}
