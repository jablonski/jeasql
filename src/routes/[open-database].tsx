import DatabaseFiles from "../components/DatabaseFiles.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import Hero from "../components/Hero.tsx";
import Layout from "../components/Layout.tsx";
import { dbPath, openDatabase } from "../server/db.ts";
import { findDatabaseFiles } from "../server/files.ts";
import { redirectHome } from "../server/redirect.ts";
import { formBody, handlePost } from "../server/request.ts";
import { checked, field } from "../server/fields.ts";
import { url } from "../server/url.ts";
import type { RouteProps } from "../types.d.ts";

/** GET shows the form, POST switches to another database file. */
export default function ({ request, reply }: RouteProps) {
  const fields = formBody(request);
  const { response, error } = handlePost(request, () => {
    const file = openDatabase(field(fields, "path"), checked(fields, "create"));
    return redirectHome(reply, { notice: `Opened ${file}` });
  });
  if (response) {
    return response;
  }

  const found = findDatabaseFiles();

  return (
    <Layout
      title="Open database"
      description="Open another SQLite database file"
      route="/open-database"
    >
      <div class="open-page">
        <Hero title="Open a database" icon="database">
          {dbPath() ? (
            <form
              method="post"
              action={url("/close-database")}
              class="open-current"
              title={dbPath()}
            >
              <div class="open-current-path">
                <span class="open-current-label">Currently open</span>
                <span class="open-current-file">{dbPath()}</span>
              </div>
              <button type="submit" class="secondary">
                Close
              </button>
            </form>
          ) : (
            <p>Pick a SQLite file to start exploring.</p>
          )}

          <ErrorMessage error={error} />

          <form method="post" action={url("/open-database")} class="open-form">
            <div class="open-input">
              <input
                type="text"
                name="path"
                required
                autofocus
                value={field(fields, "path")}
                placeholder="/path/to/database.db"
                aria-label="Path to database file"
              />
              <button type="submit">Open</button>
            </div>
            <div class="open-options">
              <label class="inline">
                <input type="checkbox" name="create" checked={checked(fields, "create")} />
                Create the file if it doesn't exist
              </label>
              <span class="meta">
                Relative paths start at <code>{process.cwd()}</code>
              </span>
            </div>
          </form>
        </Hero>
        <DatabaseFiles title="In the working directory" files={found} current={dbPath()} />
      </div>
    </Layout>
  );
}
