import { deleteRow, insertRow } from "../server/db.ts";
import { errorMessage } from "../server/errors.ts";
import { insertValues } from "../server/forms.ts";
import { pickHandler } from "../server/handlers.ts";
import { redirectHome, redirectTable } from "../server/redirect.ts";
import { postOnly, readForm } from "../server/request.ts";
import { parseKey } from "../server/rowKey.ts";
import { field } from "../server/fields.ts";

/** One handler per operation; each changes the row and returns the notice for the user. */
const ROW_OPS = {
  insert: (table: string, fields: Record<string, string>, files: Record<string, Uint8Array>) => {
    const { rowid } = insertRow(table, insertValues(fields, files));
    return rowid === undefined ? "Row added." : `Row added (rowid ${rowid}).`;
  },
  delete: (table: string, fields: Record<string, string>) => {
    deleteRow(table, parseKey(fields.key));
    return "Row deleted.";
  },
};

/**
 * POST /update-row – insert (op=insert) or delete (op=delete) a row, then go back to the table.
 * The insert form is sent as multipart (for BLOB uploads); see insertValues for its fields.
 */
export default postOnly(async function ({ request, reply }) {
  let form;
  try {
    form = await readForm(request);
  } catch (e) {
    // The table name is part of the form, so there is no table page to go back to.
    return redirectHome(reply, { error: errorMessage(e) });
  }
  const { fields, files } = form;
  const table = field(fields, "table");
  const op = field(fields, "op");

  try {
    const notice = pickHandler(ROW_OPS, op)(table, fields, files);
    return redirectTable(reply, table, { notice });
  } catch (e) {
    return redirectTable(reply, table, { error: errorMessage(e) });
  }
});
