import { hasBlobAffinity } from "../server/db.ts";
import { insertField } from "../server/forms.ts";
import { url } from "../server/url.ts";
import type { Column } from "../server/db.ts";

/**
 * Collapsible form to insert a row. Blank fields get the column default.
 * `withoutRowid`: a WITHOUT ROWID table, where no key is assigned automatically.
 */
export default function AddRow({
  name,
  cols,
  withoutRowid = false,
}: {
  name: string;
  cols: Column[];
  withoutRowid?: boolean;
}) {
  return (
    <details class="panel">
      <summary>+ Add row</summary>
      <form method="post" action={url("/update-row")} enctype="multipart/form-data" class="stack">
        <input type="hidden" name="op" value="insert" />
        <input type="hidden" name="table" value={name} />
        <div class="grid">
          {cols.map((column) => (
            <label class="field">
              <span>
                {column.name} <small>{columnFlags(column)}</small>
              </span>
              <input
                name={insertField.value(column.name)}
                placeholder={defaultPlaceholder(column, cols, withoutRowid)}
              />
              {hasBlobAffinity(column.type) && (
                <input
                  type="file"
                  name={insertField.file(column.name)}
                  aria-label={`Upload file for ${column.name}`}
                  title="A chosen file is stored as BLOB instead of the text above"
                />
              )}
              <label class="inline">
                <input type="checkbox" name={insertField.isNull(column.name)} /> NULL
              </label>
              <label class="inline">
                <input type="checkbox" name={insertField.isEmpty(column.name)} /> Empty
              </label>
            </label>
          ))}
        </div>
        <div class="actions">
          <button type="submit">Insert row</button>
          <small>Blank fields use the column default; tick "Empty" for an empty string.</small>
        </div>
      </form>
    </details>
  );
}

/** Type and constraints of a column, e.g. "INTEGER · PK · NOT NULL". */
function columnFlags(column: Column) {
  return [column.type, column.pk && "PK", column.notnull && "NOT NULL"].filter(Boolean).join(" · ");
}

/** What a blank field inserts: the declared default, an auto rowid, or SQLite's default. */
function defaultPlaceholder(column: Column, cols: Column[], withoutRowid: boolean) {
  if (column.dflt_value != null) {
    return `default ${column.dflt_value}`;
  }
  // A single-column INTEGER PRIMARY KEY is the rowid, which SQLite assigns automatically
  // (not in WITHOUT ROWID tables, which have no rowid, nor in composite keys).
  const rowidAlias =
    !withoutRowid &&
    column.pk &&
    column.type.toUpperCase() === "INTEGER" &&
    cols.filter((c) => c.pk).length === 1;
  return rowidAlias ? "auto" : "default";
}
