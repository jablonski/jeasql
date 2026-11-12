import { html } from "jsx-async-runtime";
import { dbPath, inTransaction } from "../server/db.ts";
import { readFlash } from "../server/flash.ts";
import { queryParams } from "../server/request.ts";
import { url } from "../server/url.ts";
import type { ThisContext } from "../types.d.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";
import Header from "./Header.tsx";
import Sidebar from "./Sidebar.tsx";

/**
 * Page frame. With `bare`, there is no header or sidebar: no menu, database info or logout
 * (used by the login page, so nothing leaks to visitors who are not logged in).
 * `route` (a path like "/query-database") or `table` (a table or view name) marks the
 * current menu entry; kept apart, so a table named like a route can't light up both.
 */
export default function Layout(
  this: ThisContext,
  {
    title = "",
    description = "",
    route = "",
    table = "",
    bare = false,
    children,
  }: {
    title?: string;
    description?: string;
    route?: string;
    table?: string;
    bare?: boolean;
    children?: unknown;
  },
) {
  const file = dbPath();
  const { notice, error } = readFlash(this.request ? queryParams(this.request) : {});

  return (
    <>
      {html("<!DOCTYPE html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="description" content={description} />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href={url("/favicon.svg")} type="image/svg+xml" />
          <link rel="stylesheet" href={url("/index.css", { v: process.env.BUILD_ID })} />
          <script type="module" src={url("/index.js", { v: process.env.BUILD_ID })} />
          <title>{title ? `${title} | ` : ""}JeasQL</title>
        </head>
        <body>
          {!bare && <Header file={file} route={route} />}
          {bare ? (
            <main class="bare">{children}</main>
          ) : (
            <div class="shell">
              <Sidebar file={file} route={route} table={table} />
              <main>
                {inTransaction() && (
                  <p class="error" role="alert">
                    A transaction is open: changes are not saved until you run COMMIT (or ROLLBACK
                    to discard them) in the SQL query.
                  </p>
                )}
                {children}
              </main>
              <ConfirmDialog />
            </div>
          )}
          <Toasts notice={notice} error={error} />
        </body>
      </html>
    </>
  );
}

/** Flash messages after a redirect: notices fade out, errors stay until dismissed. */
function Toasts({ notice = "", error = "" }: { notice?: string; error?: string }) {
  if (!notice && !error) {
    return null;
  }
  return (
    <div class="toasts">
      {notice && (
        <p class="toast ok" role="status" data-js-flash>
          {notice}
        </p>
      )}
      {error && (
        <p class="toast error" role="alert" data-js-flash="sticky">
          <span>{error}</span>
          <button type="button" class="icon" aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
    </div>
  );
}
