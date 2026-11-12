import "@fastify/cookie";
import "@fastify/multipart";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";

// Request fields Jeasx adds (declared in jeasx/serverless.ts, which can't be
// type-checked from here because it imports untyped files).
declare module "fastify" {
  interface FastifyRequest {
    /** Decoded path without query parameters */
    path: string;
    /** Path to resolved route handler */
    route: string;
  }
}

// State kept on globalThis, so it survives module reloads in dev mode.
declare global {
  /** The open database (server/db/connection.ts). */
  var $db: DatabaseSync | undefined;
  /** Path of the open database file. */
  var $dbPath: string | undefined;
  /** Open cursors per connection (server/db/connection.ts). */
  var $dbHolds: Map<DatabaseSync, number> | undefined;
  /** Random session signing key when AUTH_SECRET is not set (server/security/auth.ts). */
  var $authSecret: Buffer | undefined;
  /** Logged-out session ids → their expiry in ms (server/security/auth.ts). */
  var $authRevoked: Map<string, number> | undefined;
  /** Failed logins per client IP (server/security/auth.ts). */
  var $authFailures: Map<string, { count: number; since: number }> | undefined;
  /** Set once the missing-TRUST_PROXY warning was logged ([...guard].ts). */
  var $proxyWarned: boolean | undefined;
}

type RouteProps = {
  request: FastifyRequest;
  reply: FastifyReply;
};

// Set by [...guard].ts; missing when a component is rendered on its own (e.g. jsxToString).
type ThisContext = Partial<RouteProps>;
