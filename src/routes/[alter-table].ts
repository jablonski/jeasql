import { alterTable } from "../server/db.ts";
import { errorMessage } from "../server/errors.ts";
import { redirectHome, redirectTable } from "../server/redirect.ts";
import { formBody, postOnly } from "../server/request.ts";
import { checked, field } from "../server/fields.ts";

/** POST /alter-table – structural change on a table (see alterTable in server/db/schema.ts). */
export default postOnly(function ({ request, reply }) {
  const fields = formBody(request);
  const table = field(fields, "table");
  try {
    const { notice, table: next } = alterTable(table, {
      op: field(fields, "op"),
      name: field(fields, "name"),
      column: field(fields, "column"),
      type: field(fields, "type"),
      notnull: checked(fields, "notnull"),
      dflt: field(fields, "dflt"),
    });
    // No table left to show after a drop.
    return next ? redirectTable(reply, next, { notice }) : redirectHome(reply, { notice });
  } catch (e) {
    return redirectTable(reply, table, { error: errorMessage(e) });
  }
});
