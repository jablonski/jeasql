import querystring from "node:querystring";

const NODE_ENV_IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/** Sent with every response (a route may set its own value instead). */
const SECURITY_HEADERS = {
  // Only own scripts, styles and images.
  "content-security-policy": [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export default {
  /** @type {() => import("esbuild").BuildOptions} */
  ESBUILD_SERVER_OPTIONS: () => ({
    define: { "process.env.BUILD_ID": `"${Date.now().toString(36)}"` },
  }),

  /** @type {(fastify: import("fastify").FastifyInstance) => import("fastify").FastifyInstance} */
  FASTIFY_SERVER: (fastify) =>
    fastify
      // bodyLimit doesn't cover multipart: BLOB uploads have their own limit.
      .register(import("@fastify/multipart"), {
        limits: {
          fileSize: 64 * 1024 * 1024,
          // Field names carry column names ("v.<column>"); the default of 100 bytes cuts long ones off.
          fieldNameSize: 1024,
          // Uploads are buffered in memory: one file per column is plenty.
          files: 100,
          fields: 10_000,
        },
      })
      .register(import("@fastify/cookie"))
      // Errors Fastify raises itself (malformed JSON, too large bodies, …) and uncaught ones,
      // in the app's own format: {"error": …} for scripts (like jsonError), plain text otherwise.
      // Server errors are logged and get a generic message, so no internals leak.
      .setErrorHandler(async (error, request, reply) => {
        const status = error.statusCode >= 400 ? error.statusCode : 500;
        if (status >= 500) {
          request.log.error(error);
        }
        const message = status >= 500 ? "Internal server error" : error.message;
        if (String(request.headers.accept ?? "").includes("application/json")) {
          reply.status(status).type("application/json");
          return JSON.stringify({ error: message });
        }
        reply.status(status).type("text/plain; charset=utf-8");
        return message;
      })
      .addHook("onSend", async (_request, reply) => {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
          if (!reply.hasHeader(name)) {
            reply.header(name, value);
          }
        }
      })
      .addContentTypeParser(
        "application/x-www-form-urlencoded",
        { parseAs: "string" },
        async (_request, body) => querystring.parse(body),
      ),

  /** @type {() => import("fastify").FastifyServerOptions} */
  FASTIFY_SERVER_OPTIONS: () => ({
    logger: { level: NODE_ENV_IS_DEVELOPMENT ? "error" : "info" },
    bodyLimit: 10 * 1024 * 1024,
    // Behind a reverse proxy: trust its X-Forwarded-* headers (host, protocol, client IP).
    trustProxy: process.env.TRUST_PROXY === "true",
  }),

  /** @type {() => import("@fastify/send").SendOptions} */
  FASTIFY_SEND_OPTIONS: () => ({
    immutable: !NODE_ENV_IS_DEVELOPMENT,
    maxAge: NODE_ENV_IS_DEVELOPMENT ? 0 : "365d",
  }),
};
