// Turns submitted form fields into data for the db functions.
import { checked, trimmed } from "./fields.ts";
import { dict } from "./dict.ts";

/**
 * Field names of the insert form (components/AddRow.tsx), one set per column.
 * Read by insertValues in order of precedence: null, empty, file, value.
 */
export const insertField = {
  /** Text typed for the column. */
  value: (column: string) => `v.${column}`,
  /** Checkbox: store NULL. */
  isNull: (column: string) => `n.${column}`,
  /** Checkbox: store an empty string. */
  isEmpty: (column: string) => `e.${column}`,
  /** File upload, stored as BLOB. */
  file: (column: string) => `f.${column}`,
};

/** The column an insert form field belongs to, or undefined for other fields. */
const insertFieldColumn = (name: string) => (/^[vnef]\./.test(name) ? name.slice(2) : undefined);

/**
 * Values for a new row from the insert form (see insertField): NULL wins over
 * the empty string, which wins over an uploaded file, which wins over the text.
 * Columns with a blank text and nothing else are left out, so they get their default.
 */
export function insertValues(
  fields: Record<string, string>,
  files: Record<string, Uint8Array> = {},
) {
  const values = dict<string | Uint8Array | null>();
  const has = (obj: object, name: string) => Object.hasOwn(obj, name);
  const columns = new Set(
    [...Object.keys(fields), ...Object.keys(files)]
      .map(insertFieldColumn)
      .filter((c) => c !== undefined),
  );
  for (const column of columns) {
    if (has(fields, insertField.isNull(column))) {
      values[column] = null;
    } else if (has(fields, insertField.isEmpty(column))) {
      values[column] = "";
    } else if (has(files, insertField.file(column))) {
      values[column] = files[insertField.file(column)];
    } else if (fields[insertField.value(column)]) {
      values[column] = fields[insertField.value(column)];
    }
  }
  return values;
}

/** The fields of one column row in the create-table form (components/NewColumnRow.tsx). */
export type ColumnField = "name" | "type" | "pk" | "notnull" | "unique" | "dflt";

/** Field name of one column row in the create-table form: columnField("type", 0) → "type.0". */
export const columnField = (field: ColumnField, row: number | string) => `${field}.${row}`;

/** Row numbers of the create-table form that were submitted (have a name field). */
export function columnRows(fields: Record<string, string>) {
  const prefix = columnField("name", "");
  return Object.keys(fields)
    .filter((field) => field.startsWith(prefix))
    .map((field) => field.slice(prefix.length));
}

/** Column definitions from the create-table form (see columnField). Rows without a name are skipped. */
export function columnsFromForm(fields: Record<string, string>) {
  return columnRows(fields)
    .filter((row) => trimmed(fields[columnField("name", row)]))
    .map((row) => ({
      name: fields[columnField("name", row)],
      type: fields[columnField("type", row)],
      pk: checked(fields, columnField("pk", row)),
      notnull: checked(fields, columnField("notnull", row)),
      unique: checked(fields, columnField("unique", row)),
      dflt: fields[columnField("dflt", row)],
    }));
}
