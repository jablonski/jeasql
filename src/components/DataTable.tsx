import { setImmediate as nextTick } from "node:timers/promises";
import { keyJson } from "../server/rowKey.ts";
import { FILTER_PARAM } from "../server/db.ts";
import type { Filters, Row, RowKey, SortDir } from "../server/db.ts";
import { url } from "../server/url.ts";
import Cell from "./Cell.tsx";
import CellEditor from "./CellEditor.tsx";
import HiddenFields from "./HiddenFields.tsx";

/**
 * A filter row under the headers: a GET form to `action` re-sending `fields`
 * (e.g. the table name and sort) with one filter input per column, filled from `values`.
 */
export type FilterForm = { action: string; fields: Record<string, string>; values: Filters };

/** Rows shown, and whether more were left. */
export type RowStats = { count: number; truncated?: boolean };

/**
 * Renders query results. `sortHref` (optional) makes column headers sortable.
 * With `table` and `rowKey` (reads a row's key), cells can be edited (see
 * browser/scripts/cell-editor.ts), except `readOnlyColumns`; `blobColumns` get a file
 * upload in the editor. Editable rows can also be deleted; `back` is the page to return
 * to afterwards. With `filter`, a row of inputs filters by column.
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
  readOnlyColumns = [],
  back,
  stats = { count: 0 },
  limit = Infinity,
  filter,
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
  readOnlyColumns?: string[];
  back?: string;
  filter?: FilterForm;
}) {
  const editable = Boolean(table && rowKey);
  const formId = "table-filter";
  return (
    <div
      class="table-wrap"
      data-js-table={editable ? table : undefined}
      data-blob-columns={editable ? JSON.stringify(blobColumns) : undefined}
      data-update-url={editable ? url("/update-cell") : undefined}
    >
      {editable && <CellEditor />}
      {filter && (
        // The inputs sit in the table and join this form via their form attribute.
        <form id={formId} method="get" action={filter.action} class="filter-form">
          <HiddenFields fields={filter.fields} />
          {/* Enter in any input submits: implicit submission needs a submit button. */}
          <button type="submit" tabindex={-1} aria-hidden="true" />
        </form>
      )}
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
          {filter && (
            <tr class="filter-row" data-js-filter-row>
              {editable && <th class="action" />}
              {columns.map((column) => (
                <th>
                  <input
                    type="search"
                    form={formId}
                    name={FILTER_PARAM + column}
                    value={filter.values[column] ?? ""}
                    placeholder="Filter"
                    aria-label={`Filter ${column}`}
                    title="text: contains · !text: doesn't contain · =, !=, <, <=, >, >= value · NULL · !NULL"
                    autocomplete="off"
                  />
                </th>
              ))}
            </tr>
          )}
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
                        <HiddenFields fields={{ op: "delete", table, key, back }} />
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
                      readOnly={readOnlyColumns.includes(column)}
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
