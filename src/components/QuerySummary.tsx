import { pageOffset } from "../server/db.ts";
import type { RowStats } from "./DataTable.tsx";

/** Milliseconds since `started` (a performance.now() value), as text. */
export const elapsed = (started: number) => (performance.now() - started).toFixed(1);

/**
 * Which rows are shown and how long the query took. Rendered after the result
 * table, so its rows have been counted by then.
 */
export default function QuerySummary({
  stats,
  started,
  pageable,
  page,
}: {
  stats: RowStats;
  started: number;
  pageable: boolean;
  page: number;
}) {
  const time = `${elapsed(started)} ms`;
  if (pageable) {
    const first = pageOffset(page);
    return (
      <p class="meta">
        {stats.count
          ? `Rows ${first + 1}–${first + stats.count} in ${time}`
          : `No rows on page ${page} (${time})`}
      </p>
    );
  }
  return (
    <p class="meta">
      {stats.truncated
        ? `First ${stats.count} rows in ${time} (only SELECT, VALUES and WITH queries without writes are paged)`
        : `${stats.count} rows in ${time}`}
    </p>
  );
}
