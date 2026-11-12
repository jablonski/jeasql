import { postOnly } from "../server/http/request.ts";
import { url } from "../server/http/url.ts";
import { COOKIE, COOKIE_OPTIONS, revokeSession } from "../server/security/auth.ts";

/** POST /logout – revokes the session and clears its cookie. */
export default postOnly(function ({ request, reply }) {
  revokeSession(request);
  reply.clearCookie(COOKIE, COOKIE_OPTIONS);
  return reply.redirect(url("/login"), 303);
});
