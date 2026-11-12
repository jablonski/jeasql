import { closeDatabase } from "../server/db.ts";
import { redirectHome, redirectOnError } from "../server/redirect.ts";
import { postOnly } from "../server/request.ts";

/** POST /close-database – closes the open database connection. */
export default postOnly(function ({ reply }) {
  // No table: an error goes to the overview.
  return redirectOnError(reply, "", () => {
    const file = closeDatabase();
    return redirectHome(reply, {
      notice: file ? `Closed ${file}` : "No database open.",
    });
  });
});
