// Links between the app's pages.
import type { SortDir } from "./db.ts";
import { keyJson } from "./rowKey.ts";
import { url } from "./url.ts";

/** Link that downloads one BLOB cell. */
export const blobUrl = (table: string, column: string, key: Record<string, unknown>) =>
  url("/download-blob", { table, column, key: keyJson(key) });

/**
 * Link to a table or view page. Page 1 and the direction without a sort are left out;
 * other `params` (e.g. flash messages) are passed on.
 */
export const tableUrl = (
  name: string,
  {
    sort,
    dir,
    page,
    ...params
  }: { sort?: string; dir?: SortDir; page?: number } & Record<string, unknown> = {},
) =>
  url("/show-table", {
    name,
    sort,
    dir: sort ? dir : undefined,
    page: page && page > 1 ? page : undefined,
    ...params,
  });
