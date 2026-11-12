import { attempt } from "../server/errors.ts";
import { tableUrl } from "../server/links.ts";
import { memoListObjects } from "../server/memo.ts";
import { url } from "../server/url.ts";
import type { ThisContext } from "../types.d.ts";
import ErrorMessage from "./ErrorMessage.tsx";
import type { SchemaObject } from "../server/db.ts";

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
  const { value: objects, error } = attempt<SchemaObject[]>(
    () => (file ? memoListObjects(this) : []),
    [],
  );

  /** A menu link; disabled while no database is open. */
  const link = (path: string, label: string) => (
    <a
      href={file ? url(path) : undefined}
      aria-disabled={file ? undefined : "true"}
      class={route === path ? "active" : undefined}
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
              <a href={tableUrl(name)} class={table === name ? "active" : undefined}>
                {name}
              </a>
            ))}
          </>
        ) : null;
      })}
    </nav>
  );
}
