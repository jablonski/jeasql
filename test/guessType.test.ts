import assert from "node:assert/strict";
import { test } from "node:test";
import { guessType } from "../src/server/guessType.ts";

const bytes = (input: string | readonly number[]) =>
  typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);

for (const [name, input, type, ext] of [
  ["PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a], "image/png", "png"],
  ["JPEG", [0xff, 0xd8, 0xff, 0xe0], "image/jpeg", "jpg"],
  [
    "WebP (signature at offset 8)",
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    "image/webp",
    "webp",
  ],
  ["PDF", "%PDF-1.7", "application/pdf", "pdf"],
  [
    "SVG",
    '  <?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>',
    "image/svg+xml",
    "svg",
  ],
  ["XML", '<?xml version="1.0"?><root/>', "application/xml", "xml"],
  ["HTML", "<!DOCTYPE html><p>hi", "text/html; charset=utf-8", "html"],
  ["JSON", '{"a": [1, 2]}', "application/json", "json"],
  ["text that looks like JSON", "{not json", "text/plain; charset=utf-8", "txt"],
  ["plain text", "hello\nworld", "text/plain; charset=utf-8", "txt"],
  ["invalid UTF-8", [0xc3, 0x28], "application/octet-stream", "bin"],
  ["control characters", [0x68, 0x00, 0x69], "application/octet-stream", "bin"],
  ["empty", [], "text/plain; charset=utf-8", "txt"],
] as const) {
  test(`detects ${name}`, () => assert.deepEqual(guessType(bytes(input)), { type, ext }));
}
