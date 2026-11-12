import { alterTable } from "../server/db.ts";
import { checked, field } from "../server/lib/fields.ts";
import { redirectHome, redirectOnError, redirectTable } from "../server/http/redirect.ts";
import { formBody, postOnly } from "../server/http/request.ts";

/** POST /alter-table – structural change on a table (see alterTable in server/db/schema.ts). */
export default postOnly(function ({ request, reply }) {
  const fields = formBody(request);
  const table = field(fields, "table");
  return redirectOnError(reply, table, () => {
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
  });
});
