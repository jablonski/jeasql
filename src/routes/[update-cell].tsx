import { jsxToString } from "jsx-async-runtime";
import Cell from "../components/Cell.tsx";
import { updateCell } from "../server/db.ts";
import { keyJson, parseKey } from "../server/rowKey.ts";
import { errorMessage } from "../server/errors.ts";
import { jsonBody, jsonError, postOnly, readForm } from "../server/request.ts";
import { field } from "../server/fields.ts";
import type { FastifyRequest } from "fastify";

/**
 * The cell change of a request: JSON {table, key, column, value}, or multipart
 * with fields table, key (JSON) and column plus the uploaded file as value.
 */
async function readCellUpdate(request: FastifyRequest) {
  if (request.isMultipart()) {
    const { fields, files } = await readForm(request);
    if (!files.file) {
      throw new Error("No file uploaded");
    }
    return {
      table: field(fields, "table"),
      key: parseKey(fields.key),
      column: field(fields, "column"),
      value: files.file,
    };
  }
  // JSON values aren't all strings: `key` may be an object and `value` null.
  const json = jsonBody(request);
  return {
    table: field(json, "table"),
    key: parseKey(json.key),
    column: field(json, "column"),
    value: json.value === null || json.value === undefined ? null : String(json.value),
  };
}

/**
 * POST /update-cell – updates one cell and answers with {html} of the new cell,
 * rendered like the table does, and {key}: the row key as JSON, new if a key
 * column was changed (see readCellUpdate for the request format).
 * Fastify sends the returned objects as JSON.
 */
export default postOnly(async function ({ request, reply }) {
  try {
    const { table, key, column, value } = await readCellUpdate(request);
    const stored = updateCell(table, key, column, value);
    const html = await jsxToString(
      <Cell value={stored.value} table={table} column={stored.column} rowKey={stored.key} />,
    );
    return { html, key: keyJson(stored.key) };
  } catch (e) {
    return jsonError(reply, 400, errorMessage(e));
  }
});
