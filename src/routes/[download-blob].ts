import { describeTable, findColumn, readBlob } from "../server/db.ts";
import { attempt } from "../server/errors.ts";
import { field } from "../server/fields.ts";
import { guessType } from "../server/guessType.ts";
import { errorResponse, queryParams } from "../server/request.ts";
import { keyLabel, parseKey } from "../server/rowKey.ts";
import type { RouteProps } from "../types.d.ts";

/** GET /download-blob?table=…&column=…&key={json} – downloads one BLOB cell. */
export default function ({ request, reply }: RouteProps) {
  const query = queryParams(request);
  const table = field(query, "table");
  // An unknown table or column is "not found"; only a malformed key is a bad request.
  const { value: info } = attempt(() => describeTable(table), undefined);
  const column = info && findColumn(info, field(query, "column"));
  if (info?.object.type !== "table" || !column) {
    return errorResponse({ request, reply }, 404, "Not found");
  }
  let blob: Uint8Array | undefined;
  let label: string;
  try {
    const key = parseKey(query.key);
    blob = readBlob(table, key, column);
    label = keyLabel(key, info.keyColumns);
  } catch {
    return errorResponse({ request, reply }, 400, "Invalid request");
  }
  if (!blob) {
    return errorResponse({ request, reply }, 404, "Not found");
  }
  const { type, ext } = guessType(blob);
  const filename = `${info.object.name}-${column}-${label}.${ext}`.replace(/[^\w.-]/g, "_");
  reply.header("content-type", type);
  // HTML or SVG BLOBs must never run scripts, even if opened directly.
  reply.header("content-security-policy", "sandbox; default-src 'none'");
  reply.header("content-disposition", `attachment; filename="${filename}"`);
  return Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
}
