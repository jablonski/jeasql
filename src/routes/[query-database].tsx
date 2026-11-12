import DataTable from "../components/DataTable.tsx";
import type { RowStats } from "../components/DataTable.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import Layout from "../components/Layout.tsx";
import Pager from "../components/Pager.tsx";
import QuerySummary, { elapsed } from "../components/QuerySummary.tsx";
import { PAGE_SIZE, pageOffset, parsePage, runQuery, schemaMap } from "../server/db.ts";
import { formBody } from "../server/http/request.ts";
import { url } from "../server/http/url.ts";
import { attempt } from "../server/lib/errors.ts";
import { trimmed } from "../server/lib/fields.ts";
import type { RouteProps } from "../types.d.ts";

/**
 * GET shows the editor, POST runs the SQL from the form (queries are never run
 * from a URL, so a link can't trigger one).
 * Read-only results are paged (the pager posts the SQL again with page=N, which
 * runs it again with LIMIT/OFFSET around it); others show only the first rows,
 * so paging never repeats a write.
 */
export default function ({ request }: RouteProps) {
  const fields = formBody(request);
  const sql = trimmed(fields.sql);

  const started = performance.now();
  const requested = parsePage(fields.page);
  // One row past the page, so the table can tell whether there is a next one.
  // runQuery ignores the page for SQL it doesn't page (see `paged`).
  const { value: result, error } = attempt(
    () =>
      sql ? runQuery(sql, { limit: PAGE_SIZE + 1, offset: pageOffset(requested) }) : undefined,
    undefined,
  );
  const pageable = Boolean(result?.paged);
  const page = pageable ? requested : 1;

  const stats: RowStats = { count: 0, truncated: false };

  // Table and column names for code completion in the textarea.
  const { value: schema } = attempt(schemaMap, {});

  return (
    <Layout title="SQL query" description="Run SQL against the database" route="/query-database">
      <h1>SQL query</h1>
      <form method="post" action={url("/query-database")}>
        <textarea
          name="sql"
          rows="6"
          spellcheck="false"
          autofocus
          data-js-sql
          data-schema={JSON.stringify(schema)}
        >
          {sql}
        </textarea>
        <div class="actions">
          <button type="submit">Run</button>
          <small>Ctrl/⌘ + Enter</small>
        </div>
      </form>
      <ErrorMessage error={error} />
      {result &&
        (result.columns.length ? (
          <>
            <DataTable
              columns={result.columns}
              rows={result.rows}
              stats={stats}
              limit={PAGE_SIZE}
            />
            {pageable && (
              <Pager
                page={page}
                stats={stats}
                target={{ action: url("/query-database"), fields: { sql } }}
              />
            )}
            <QuerySummary stats={stats} started={started} pageable={pageable} page={page} />
          </>
        ) : (
          <p class="ok">
            Done. {result.changes} rows changed in {elapsed(started)} ms.
          </p>
        ))}
    </Layout>
  );
}
