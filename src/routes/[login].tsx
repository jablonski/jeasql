import ErrorMessage from "../components/ErrorMessage.tsx";
import Hero from "../components/Hero.tsx";
import HiddenFields from "../components/HiddenFields.tsx";
import Layout from "../components/Layout.tsx";
import Wordmark from "../components/Wordmark.tsx";
import {
  authConfigured,
  checkCredentials,
  COOKIE,
  COOKIE_OPTIONS,
  loginBlocked,
  clearFailedLogins,
  recordFailedLogin,
  sessionToken,
} from "../server/auth.ts";
import { field } from "../server/fields.ts";
import { safeNext } from "../server/redirect.ts";
import { formBody, isPost, queryParams } from "../server/request.ts";
import { url } from "../server/url.ts";
import type { RouteProps } from "../types.d.ts";

/** GET shows the login form, POST checks the credentials and sets the session cookie. */
export default function ({ request, reply }: RouteProps) {
  if (!authConfigured()) {
    reply.status(503);
    return (
      <Layout title="Setup required" description="Login credentials are not configured" bare>
        <div class="login-page">
          <Hero title="Setup required" class="login-form">
            <p>
              Set the environment variables <code>AUTH_USERNAME</code> and{" "}
              <code>AUTH_PASSWORD</code> and restart the server.
            </p>
          </Hero>
        </div>
      </Layout>
    );
  }

  const fields = formBody(request);
  const query = queryParams(request);
  const next = safeNext(fields.next ?? query.next);
  let error = "";

  if (isPost(request)) {
    // Too many failures: refuse without checking, so guessing gets slow.
    if (loginBlocked(request.ip)) {
      error = "Too many failed logins. Please try again later.";
      reply.status(429);
    } else if (checkCredentials(field(fields, "username"), field(fields, "password"))) {
      clearFailedLogins(request.ip);
      reply.setCookie(COOKIE, sessionToken(), COOKIE_OPTIONS);
      return reply.redirect(next, 303);
    } else {
      recordFailedLogin(request.ip);
      error = "Wrong username or password.";
      reply.status(401);
    }
  }

  return (
    <Layout title="Log in" description="Log in to JeasQL" bare>
      <div class="login-page">
        <div class="login-shell">
          <section class="login-intro">
            <span class="login-badge">Powered by Jeasx</span>
            <h2 class="login-brand">
              <Wordmark logoClass="login-logo" />
            </h2>
            <p class="login-tagline">Browse and edit SQLite databases, right in your browser.</p>
            <p class="login-about">
              JeasQL is a showcase for <a href="https://www.jeasx.dev">Jeasx</a>, demonstrating how
              it powers a real-world web application. It also serves as a playground for exploring
              patterns and best practices for building proper Jeasx applications.
            </p>
            <ul class="login-features">
              <li>Browse tables, follow foreign keys, edit inline</li>
              <li>SQL editor with autocompletion</li>
              <li>Server-rendered JSX on Node's built-in node:sqlite</li>
            </ul>
          </section>
          <Hero title="Welcome back" class="login-form" action={url("/login")}>
            <p class="login-hint">Sign in to continue.</p>
            <ErrorMessage error={error} />
            <HiddenFields fields={{ next }} />
            <label>
              Username
              <input
                type="text"
                name="username"
                required
                autofocus
                autocomplete="username"
                value={field(fields, "username")}
              />
            </label>
            <label>
              Password
              <input type="password" name="password" required autocomplete="current-password" />
            </label>
            <button type="submit">Log in</button>
          </Hero>
        </div>
      </div>
    </Layout>
  );
}
