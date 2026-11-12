import HiddenFields from "./HiddenFields.tsx";
import { isGenerated } from "../server/db.ts";
import type { Column } from "../server/db.ts";
import { insertField } from "../server/http/forms.ts";
import { url } from "../server/http/url.ts";

/**
 * Collapsible form to insert a row. Blank fields get the column default; generated
 * columns get no field. `rowidAlias`: the column SQLite fills in automatically;
 * `blobColumns` accept file uploads (see TableInfo). `back`: the table page to
 * return to (with its sort, filters and page).
 */
export default function AddRow({
  name,
  cols,
  rowidAlias,
  blobColumns,
  back,
}: {
  name: string;
  cols: Column[];
  rowidAlias?: string;
  blobColumns: string[];
  back?: string;
}) {
  return (
    <details class="panel">
      <summary>+ Add row</summary>
      <form method="post" action={url("/update-row")} enctype="multipart/form-data" class="stack">
        <HiddenFields fields={{ op: "insert", table: name, back }} />
        <div class="grid">
          {cols
            .filter((column) => !isGenerated(column))
            .map((column) => (
              <label class="field">
                <span>
                  {column.name} <small>{columnFlags(column)}</small>
                </span>
                <input
                  name={insertField.value(column.name)}
                  placeholder={defaultPlaceholder(column, rowidAlias)}
                />
                {blobColumns.includes(column.name) && (
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
function defaultPlaceholder(column: Column, rowidAlias: string | undefined) {
  if (column.dflt_value != null) {
    return `default ${column.dflt_value}`;
  }
  return column.name === rowidAlias ? "auto" : "default";
}
