import Hero from "../components/Hero.tsx";
import Layout from "../components/Layout.tsx";
import { url } from "../server/http/url.ts";
import type { RouteProps } from "../types.d.ts";

/** Shown for unknown routes. */
export default function ({ request, reply }: RouteProps) {
  reply.status(404);

  return (
    <Layout title="Page not found" description="The requested page does not exist">
      <div class="open-page">
        <Hero
          title="Page not found"
          icon="not-found"
          kicker={<span class="not-found-code">404</span>}
          class="not-found"
        >
          <p>
            There is nothing at <code>{request.path}</code>. It may have been renamed or moved.
          </p>
          <div class="not-found-actions">
            <a href={url("/")} class="button">
              Go to overview
            </a>
          </div>
        </Hero>
      </div>
    </Layout>
  );
}
