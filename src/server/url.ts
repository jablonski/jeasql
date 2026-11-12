/**
 * Builds an app link: url("/show-table", { name }) → "/show-table?name=…".
 * Params that are undefined, null or "" are left out.
 * `path`: path starting with "/"
 * `params`: query parameters
 */
export function url(path: string = "", params: Record<string, unknown> = {}) {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return `${path}${query ? `?${query}` : ""}`;
}
