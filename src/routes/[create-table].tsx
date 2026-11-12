import ErrorMessage from "../components/ErrorMessage.tsx";
import Layout from "../components/Layout.tsx";
import NewColumnRow from "../components/NewColumnRow.tsx";
import { createTable } from "../server/db.ts";
import { errorMessage } from "../server/errors.ts";
import { columnRows, columnsFromForm } from "../server/forms.ts";
import { redirectTable } from "../server/redirect.ts";
import { formBody, isPost } from "../server/request.ts";
import { field } from "../server/fields.ts";
import { url } from "../server/url.ts";
import type { RouteProps } from "../types.d.ts";

/**
 * GET shows the form, POST creates the table.
 * Column fields are named by columnField (server/forms.ts).
 */
export default function ({ request, reply }: RouteProps) {
  const fields = formBody(request);
  let error = "";

  if (isPost(request)) {
    try {
      const table = createTable(field(fields, "table"), columnsFromForm(fields));
      return redirectTable(reply, table, {
        notice: "Table created.",
      });
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const rows = Math.max(2, columnRows(fields).length);

  return (
    <Layout title="New table" description="Create a new table" route="/create-table">
      <h1>New table</h1>
      <p>Define the columns. Leave a column name empty to skip that row.</p>
      <ErrorMessage error={error} />

      <form method="post" action={url("/create-table")} class="stack">
        <label class="field">
          <span>Table name</span>
          <input name="table" required value={field(fields, "table")} autofocus />
        </label>

        <div class="table-wrap">
          <table class="form-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Primary key</th>
                <th>Not null</th>
                <th>Unique</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody data-js-columns>
              {Array.from({ length: rows }, (_, i) => (
                <NewColumnRow i={i} fields={fields} fresh={!isPost(request)} />
              ))}
            </tbody>
          </table>
        </div>

        <div class="actions">
          <button type="button" class="secondary" data-js-add-column>
            + Add column
          </button>
          <button type="submit">Create table</button>
        </div>
      </form>
    </Layout>
  );
}
