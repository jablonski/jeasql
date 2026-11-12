import ErrorMessage from "../components/ErrorMessage.tsx";
import Layout from "../components/Layout.tsx";
import { countLabel, countRows, dbPath, listObjects, OVERVIEW_COUNT_LIMIT } from "../server/db.ts";
import type { SchemaObject } from "../server/db.ts";
import { tableUrl } from "../server/http/links.ts";
import { perRequest } from "../server/http/memo.ts";
import { attempt } from "../server/lib/errors.ts";
import type { ThisContext } from "../types.d.ts";

/** GET / – overview of the open database: its tables and views with (capped) row counts. */
export default function (this: ThisContext) {
  // Listed once per request: the sidebar lists the same objects.
  const { value: objects, error } = attempt<SchemaObject[]>(
    () => perRequest(this.request, listObjects),
    [],
  );

  return (
    <Layout title="Overview" description="Tables and views of the SQLite database">
      <h1>Overview</h1>
      <p>
        Database <code>{dbPath()}</code>
      </p>
      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th class="num">Rows</th>
              </tr>
            </thead>
            <tbody>
              {objects.map(({ name, type }) => (
                <tr>
                  <td>
                    <a href={tableUrl(name)}>{name}</a>
                  </td>
                  <td>{type}</td>
                  <td class="num">{countLabel(countRows(name, OVERVIEW_COUNT_LIMIT))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
