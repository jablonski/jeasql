import { closeDatabase } from "../server/db.ts";
import { errorMessage } from "../server/errors.ts";
import { redirectHome } from "../server/redirect.ts";
import { postOnly } from "../server/request.ts";

/** POST /close-database – closes the open database connection. */
export default postOnly(function ({ reply }) {
  try {
    const file = closeDatabase();
    return redirectHome(reply, {
      notice: file ? `Closed ${file}` : "No database open.",
    });
  } catch (e) {
    return redirectHome(reply, { error: errorMessage(e) });
  }
});
