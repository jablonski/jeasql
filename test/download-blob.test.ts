import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../src/server/db.ts";
import downloadBlob from "../src/routes/[download-blob].ts";
import { tempDatabase } from "./helpers.ts";

tempDatabase();
db().exec("CREATE TABLE files (data BLOB); INSERT INTO files VALUES (x'89504e47')");

/** Calls the route with a query; returns status, headers and body. */
function download(query: Record<string, string>) {
  const out = { status: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  const reply = {
    status(code: number) {
      out.status = code;
      return reply;
    },
    header(name: string, value: string) {
      out.headers[name] = value;
      return reply;
    },
    type(value: string) {
      out.headers["content-type"] = value;
      return reply;
    },
  };
  out.body = downloadBlob({ request: { query, headers: {} }, reply } as any);
  return out;
}

describe("download-blob", () => {
  test("names the file after the key columns and guesses its type", () => {
    const { status, headers } = download({ table: "files", column: "data", key: '{"rowid":1}' });
    assert.equal(status, 200);
    assert.equal(headers["content-type"], "image/png");
    assert.equal(headers["content-disposition"], 'attachment; filename="files-data-1.png"');
  });
  test("ignores extra properties of the key instead of failing", () => {
    const { status, headers } = download({
      table: "files",
      column: "data",
      key: '{"rowid":1,"x":{}}',
    });
    assert.equal(status, 200);
    assert.equal(headers["content-disposition"], 'attachment; filename="files-data-1.png"');
  });
  test("answers 400 for a malformed key and 404 for unknown tables or rows", () => {
    assert.equal(download({ table: "files", column: "data", key: "[1]" }).status, 400);
    assert.equal(download({ table: "nope", column: "data", key: '{"rowid":1}' }).status, 404);
    assert.equal(download({ table: "files", column: "data", key: '{"rowid":9}' }).status, 404);
  });
});
