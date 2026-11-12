import { COOKIE, COOKIE_OPTIONS, revokeSession } from "../server/auth.ts";
import { postOnly } from "../server/request.ts";
import { url } from "../server/url.ts";

/** POST /logout – revokes the session and clears its cookie. */
export default postOnly(function ({ request, reply }) {
  revokeSession(request);
  reply.clearCookie(COOKIE, COOKIE_OPTIONS);
  return reply.redirect(url("/login"), 303);
});
