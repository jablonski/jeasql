import type { FastifyReply, FastifyRequest } from "fastify";
import type { RouteProps, ThisContext } from "../types.d.ts";
import { dict } from "./dict.ts";
import { errorMessage } from "./errors.ts";

// Route convention: a page with a form handles both methods in one route (GET shows
// it, POST handles it and re-renders it with the error, see handlePost: create-table,
// open-database, login, query-database). Pure actions without a page of their own
// are wrapped in postOnly and always redirect or answer JSON.

/** Wraps a route so it only answers POST; other methods get 405 (see errorResponse). */
export function postOnly<T>(handler: (this: ThisContext, props: RouteProps) => T) {
  // `this` is the Jeasx request context, passed on to the handler.
  return function (this: ThisContext, props: RouteProps) {
    if (props.request.method !== "POST") {
      return errorResponse(props, 405, "Method not allowed");
    }
    return handler.call(this, props);
  };
}

/**
 * An error response: JSON {"error": …} for scripts that asked for JSON (see wantsJson),
 * plain text otherwise.
 */
export function errorResponse({ request, reply }: RouteProps, status: number, error: string) {
  if (wantsJson(request)) {
    return jsonError(reply, status, error);
  }
  reply.status(status);
  return error;
}

/** True if the client (a script using fetch) asked for JSON instead of HTML. */
export function wantsJson(request: FastifyRequest) {
  return String(request.headers.accept ?? "").includes("application/json");
}

/**
 * An error response {"error": …} for scripts. Returned as a string with a JSON
 * content type: Jeasx treats an object returned by a guard as props for the next route.
 */
export function jsonError(reply: FastifyReply, status: number, error: string) {
  reply.status(status).type("application/json");
  return JSON.stringify({ error });
}

/** True for a form submission. Pages that both show and handle a form check this. */
export function isPost(request: FastifyRequest) {
  return request.method === "POST";
}

/**
 * Handles a form page's submission (see the route convention above): on POST, runs
 * `action`, which answers with a redirect. Returns that `response`, or the `error`
 * message if `action` throws, for the page to show next to its form. Does nothing on GET.
 */
export function handlePost<T>(
  request: FastifyRequest,
  action: () => T,
): { response?: T; error: string } {
  if (!isPost(request)) {
    return { error: "" };
  }
  try {
    return { response: action(), error: "" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/**
 * The query string parameters of a request, as plain strings: a repeated
 * parameter (?a=1&a=2, which Fastify parses as an array) keeps its last value,
 * like repeated form fields do.
 */
export function queryParams(request: FastifyRequest): Record<string, string> {
  const params = dict<string>();
  for (const [name, value] of Object.entries((request.query ?? {}) as Record<string, unknown>)) {
    params[name] = String((Array.isArray(value) ? value.at(-1) : value) ?? "");
  }
  return params;
}

/**
 * The form fields of a POST form submission (urlencoded, so every value is a string);
 * an empty object for other methods. JSON requests use jsonBody instead.
 */
export function formBody(request: FastifyRequest): Record<string, string> {
  return (isPost(request) ? (request.body ?? {}) : {}) as Record<string, string>;
}

/** The fields of a JSON request body, whose values may be of any JSON type. */
export function jsonBody(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Reads a multipart request: text fields as strings, chosen files as bytes.
 * File inputs left empty (no filename) are skipped.
 */
async function readMultipart(request: FastifyRequest) {
  const fields = dict<string>();
  const files = dict<Uint8Array>();
  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.filename) {
        files[part.fieldname] = new Uint8Array(await part.toBuffer());
      } else {
        // An empty file input: drain the stream (the parser waits for it) without buffering.
        part.file.resume();
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, files };
}

/** Form fields and uploaded files of a POST request, multipart or not. */
export async function readForm(request: FastifyRequest) {
  return request.isMultipart()
    ? readMultipart(request)
    : { fields: formBody(request), files: {} as Record<string, Uint8Array> };
}
