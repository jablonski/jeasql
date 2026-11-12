import { setImmediate as nextTick } from "node:timers/promises";
import { keyJson } from "../server/rowKey.ts";
import type { Row, RowKey, SortDir } from "../server/db.ts";
import { url } from "../server/url.ts";
import Cell from "./Cell.tsx";
import CellEditor from "./CellEditor.tsx";

/** Rows shown, and whether more were left. */
export type RowStats = { count: number; truncated?: boolean };

/**
 * Renders query results. `sortHref` (optional) makes column headers sortable.
 * With `table` and `rowKey` (reads a row's key), cells can be edited (see
 * browser/scripts/cell-editor.ts); `blobColumns` get a file upload in the editor.
 * Editable rows can also be deleted.
 * `rows` are arrays whose first values match `columns` (more may follow, e.g. key
 * values for `rowKey`). They are read lazily (e.g. a SQLite cursor), so the page
 * streams while rows load; `stats.count` holds the number of rows once the table
 * has been rendered; with `limit`, at most that many rows are shown and
 * `stats.truncated` tells whether more were left (one row past `limit` is read for that).
 */
export default function DataTable({
  columns,
  rows,
  sort,
  dir,
  sortHref,
  table,
  rowKey,
  blobColumns = [],
  stats = { count: 0 },
  limit = Infinity,
}: {
  columns: string[];
  rows: Iterable<Row>;
  stats?: RowStats;
  limit?: number;
  sort?: string;
  dir?: SortDir;
  sortHref?: (column: string) => string;
  table?: string;
  rowKey?: (row: Row) => RowKey;
  blobColumns?: string[];
}) {
  const editable = Boolean(table && rowKey);
  return (
    <div
      class="table-wrap"
      data-js-table={editable ? table : undefined}
      data-blob-columns={editable ? JSON.stringify(blobColumns) : undefined}
      data-update-url={editable ? url("/update-cell") : undefined}
    >
      {editable && <CellEditor />}
      <table>
        <thead>
          <tr>
            {editable && <th class="action" />}
            {columns.map((column) => (
              <th>
                {sortHref ? (
                  <a href={sortHref(column)}>
                    {column}
                    {sort === column ? (dir === "desc" ? " ▼" : " ▲") : ""}
                  </a>
                ) : (
                  column
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <LazyRows
            rows={rows}
            stats={stats}
            limit={limit}
            colspan={columns.length + (editable ? 1 : 0) || 1}
            render={(row: Row) => {
              const keyValues = editable ? rowKey!(row) : undefined;
              const key = keyValues ? keyJson(keyValues) : undefined;
              return (
                <tr data-key={key}>
                  {editable && (
                    <td class="action">
                      <form
                        method="post"
                        action={url("/update-row")}
                        data-js-confirm="Delete this row?"
                      >
                        <input type="hidden" name="op" value="delete" />
                        <input type="hidden" name="table" value={table} />
                        <input type="hidden" name="key" value={key} />
                        <button
                          type="submit"
                          class="icon"
                          title="Delete row"
                          aria-label="Delete row"
                        >
                          ×
                        </button>
                      </form>
                    </td>
                  )}
                  {columns.map((column, i) => (
                    <Cell
                      value={row[i]}
                      table={editable ? table : undefined}
                      column={column}
                      rowKey={keyValues}
                    />
                  ))}
                </tr>
              );
            }}
          />
        </tbody>
      </table>
    </div>
  );
}

/** Rows rendered before giving the event loop a turn, so other requests aren't blocked. */
const BATCH = 500;

/**
 * Renders rows one by one as they come from the cursor. Jeasx streams the markup
 * in chunks while this runs; a cancelled request stops the generator and closes the cursor.
 */
async function* LazyRows({
  rows,
  render,
  stats,
  colspan,
  limit,
}: {
  rows: Iterable<Row>;
  render: (row: Row) => JSX.Element;
  stats: RowStats;
  colspan: number;
  limit: number;
}) {
  // One row past `limit` is read only to find out whether there is a next page.
  let n = 0;
  for (const row of rows) {
    if (n >= limit) {
      // Leaving the loop closes the cursor.
      stats.truncated = true;
      break;
    }
    yield render(row);
    if (++n % BATCH === 0) {
      await nextTick();
    }
  }
  stats.count = n;
  if (!n) {
    yield (
      <tr>
        <td colspan={colspan} class="empty">
          No rows
        </td>
      </tr>
    );
  }
}
