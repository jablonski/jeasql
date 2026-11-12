// Paging of tables and query results: page size, page numbers and row counts.
import type { RowCount } from "./schema.ts";

/** Rows per page, for tables and query results. */
export const PAGE_SIZE = 500;

/** Highest page whose offset is still a safe integer (larger ones fail to bind as LIMIT/OFFSET). */
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE);

/** Page number from a query parameter: 1 or more, at most `pages` if given (and MAX_PAGE). */
export function parsePage(value: unknown, pages = Infinity) {
  return Math.min(pages, MAX_PAGE, Math.max(1, Number.parseInt(String(value), 10) || 1));
}

/** A row count as text: "1234", "100000+" when capped, "—" when unknown. */
export function countLabel({ count, capped }: RowCount) {
  return count === undefined ? "—" : capped ? `${count}+` : String(count);
}

/**
 * Number of pages for a row count; undefined when the count is capped (or failed
 * to count), so the total is unknown.
 */
export function pageCount({ count, capped }: RowCount) {
  return capped ? undefined : Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
}

/** Number of rows before the given page. */
export function pageOffset(page: number) {
  return (page - 1) * PAGE_SIZE;
}
