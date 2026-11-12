import DataTable from "../components/DataTable.tsx";
import Definition from "../components/Definition.tsx";
import Layout from "../components/Layout.tsx";
import Pager from "../components/Pager.tsx";
import AddRow from "../components/AddRow.tsx";
import ColumnList from "../components/ColumnList.tsx";
import Relations from "../components/Relations.tsx";
import Structure from "../components/Structure.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import HiddenFields from "../components/HiddenFields.tsx";
import { attempt } from "../server/errors.ts";
import {
  countRows,
  describeTable,
  findColumn,
  findObject,
  parseFilters,
  quote,
  readTablePage,
} from "../server/db.ts";
import { field } from "../server/fields.ts";
import { tableUrl } from "../server/links.ts";
import { countLabel, PAGE_SIZE, pageCount, pageOffset, parsePage } from "../server/paging.ts";
import { queryParams } from "../server/request.ts";
import { url } from "../server/url.ts";
import type { Filters, SortDir } from "../server/db.ts";
import type { RowStats } from "../components/DataTable.tsx";
import type { RouteProps } from "../types.d.ts";

/**
 * GET /show-table?name=…&sort=…&dir=…&page=…&f.<column>=… – one page of a table or view, plus
 * forms to insert rows (tables only), its columns, relations, structure and definition.
 */
export default function ({ request }: RouteProps) {
  const query = queryParams(request);
  const requested = field(query, "name");
  // Everything that asks the database before rendering, in one attempt: e.g. a view
  // whose tables were dropped can't even list its columns. Such objects show their error.
  const { value: loaded, error } = attempt(() => loadTable(requested, query), undefined);
  if (error) {
    return <BrokenObject name={requested} error={error} />;
  }
  if (!loaded) {
    return; // falls through to [404].tsx
  }
  const { info, sort, dir, filters, total, pages, page, rows, rowKey } = loaded;
  const { object, cols, columnNames, rowidAlias, blobColumns } = info;
  const { name, type, sql } = object;
  const isTable = type === "table";
  const stats: RowStats = { count: 0 };
  const filtered = Object.keys(filters).length > 0;
  const pageHref = (p: number) => tableUrl(name, { sort, dir, filters, page: p });

  return (
    <Layout title={name} description={`${type} ${name}`} table={name}>
      <h1>{name}</h1>
      {/* A div, not a p: a <form> inside a <p> makes the parser close the p early. */}
      <div class="lead">
        {type} · {countLabel(total)}
        {filtered ? " matching" : ""} rows ·{" "}
        {filtered && (
          <>
            <a href={tableUrl(name, { sort, dir })}>clear filters</a> ·{" "}
          </>
        )}
        <form method="post" action={url("/query-database")} class="inline-form">
          <HiddenFields fields={{ sql: `SELECT * FROM ${quote(name)}` }} />
          <button type="submit" class="link">
            open in SQL query
          </button>
        </form>
        {isTable && " · double-click a cell to edit"}
      </div>

      {isTable && (
        <AddRow name={name} cols={cols} rowidAlias={rowidAlias} blobColumns={blobColumns} />
      )}

      <DataTable
        columns={columnNames}
        rows={rows}
        sort={sort}
        dir={dir}
        table={name}
        rowKey={rowKey}
        blobColumns={blobColumns}
        stats={stats}
        limit={PAGE_SIZE}
        sortHref={(column) =>
          tableUrl(name, { sort: column, dir: toggledDir(sort, dir, column), filters })
        }
        filter={{
          action: url("/show-table"),
          fields: { name, ...(sort ? { sort, dir } : {}) },
          values: filters,
        }}
      />
      <Pager page={page} pages={pages} stats={stats} target={{ href: pageHref }} />

      <ColumnList cols={cols} />

      {isTable && <Relations name={name} />}

      {isTable && <Structure name={name} cols={cols} />}

      <Definition sql={sql} />
    </Layout>
  );
}

/** Direction for a click on `column`'s header: flips the current sort, else ascending. */
function toggledDir(sort: string | undefined, dir: SortDir, column: string): SortDir {
  return sort === column && dir === "asc" ? "desc" : "asc";
}

/**
 * The table or view `name` with the requested sort, filters and page, its row count and a lazy
 * cursor over that page; undefined if there is no such object.
 */
function loadTable(name: string, query: Record<string, string>) {
  const info = describeTable(name);
  if (!info) {
    return undefined;
  }
  const sort = findColumn(info, query.sort);
  const dir: SortDir = query.dir === "desc" ? "desc" : "asc";
  const filters: Filters = parseFilters(info.columnNames, query);
  // Counting is capped (see countRows): beyond that the number of pages is unknown,
  // and the pager offers "Next" as long as the table read one row past the page.
  const total = countRows(info.object.name, undefined, filters);
  const pages = pageCount(total);
  const page = parsePage(query.page, pages);
  // Read lazily while the page streams; one row past the page tells whether there is a next one.
  const { rows, rowKey } = readTablePage(info, {
    sort,
    dir,
    limit: PAGE_SIZE + 1,
    offset: pageOffset(page),
    filters,
  });
  return { info, sort, dir, filters, total, pages, page, rows, rowKey };
}

/** A table or view that can't be read (e.g. a view on a dropped table): the error and its definition. */
function BrokenObject({ name, error }: { name: string; error: string }) {
  const { value: object } = attempt(() => findObject(name), undefined);
  return (
    <Layout title={name} description={`${object?.type ?? "object"} ${name}`} table={name}>
      <h1>{name}</h1>
      <ErrorMessage error={error} />
      {object && <Definition sql={object.sql} />}
    </Layout>
  );
}
