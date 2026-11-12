import { listObjects } from "../server/db.ts";
import type { SchemaObject } from "../server/db.ts";
import { attempt } from "../server/lib/errors.ts";
import { cx } from "../server/lib/classes.ts";
import { tableUrl } from "../server/http/links.ts";
import { perRequest } from "../server/http/memo.ts";
import { url } from "../server/http/url.ts";
import type { ThisContext } from "../types.d.ts";
import ErrorMessage from "./ErrorMessage.tsx";

/** Side menu: SQL query, new table, and the tables and views of the open database. */
export default function Sidebar(
  this: ThisContext,
  {
    file,
    route,
    table,
  }: {
    file: string;
    route: string;
    table: string;
  },
) {
  // Without an open database there is nothing to list, and no error to show.
  // Listed once per request: the overview page lists the same objects.
  const { value: objects, error } = file
    ? attempt<SchemaObject[]>(() => perRequest(this.request, listObjects), [])
    : { value: [], error: "" };

  /** A menu link; disabled while no database is open. */
  const link = (path: string, label: string) => (
    <a
      href={file ? url(path) : undefined}
      aria-disabled={file ? undefined : "true"}
      class={cx(route === path && "active")}
    >
      {label}
    </a>
  );

  return (
    <nav id="nav">
      {link("/query-database", "▶ SQL query")}
      {link("/create-table", "+ New table")}
      <ErrorMessage error={error} />
      {["table", "view"].map((type) => {
        const items = objects.filter((object) => object.type === type);
        return items.length ? (
          <>
            <h6>{type}s</h6>
            {items.map(({ name }) => (
              <a href={tableUrl(name)} class={cx(table === name && "active")}>
                {name}
              </a>
            ))}
          </>
        ) : null;
      })}
    </nav>
  );
}
