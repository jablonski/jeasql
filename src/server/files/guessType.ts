// Guesses a file type from its bytes, for BLOB downloads.

/** Known file signatures: [offset, bytes, mime type, extension]. */
const SIGNATURES = [
  [0, [0x89, 0x50, 0x4e, 0x47], "image/png", "png"],
  [0, [0xff, 0xd8, 0xff], "image/jpeg", "jpg"],
  [0, [0x47, 0x49, 0x46, 0x38], "image/gif", "gif"],
  [0, [0x42, 0x4d], "image/bmp", "bmp"],
  [0, [0x00, 0x00, 0x01, 0x00], "image/x-icon", "ico"],
  [8, [0x57, 0x45, 0x42, 0x50], "image/webp", "webp"],
  [8, [0x57, 0x41, 0x56, 0x45], "audio/wav", "wav"],
  [8, [0x41, 0x56, 0x49, 0x20], "video/x-msvideo", "avi"],
  [4, [0x66, 0x74, 0x79, 0x70], "video/mp4", "mp4"],
  [0, [0x25, 0x50, 0x44, 0x46], "application/pdf", "pdf"],
  [0, [0x50, 0x4b, 0x03, 0x04], "application/zip", "zip"],
  [0, [0x1f, 0x8b], "application/gzip", "gz"],
  [0, [0x42, 0x5a, 0x68], "application/x-bzip2", "bz2"],
  [0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], "application/x-7z-compressed", "7z"],
  [0, [0x52, 0x61, 0x72, 0x21], "application/vnd.rar", "rar"],
  [0, [0x49, 0x44, 0x33], "audio/mpeg", "mp3"],
  [0, [0x4f, 0x67, 0x67, 0x53], "audio/ogg", "ogg"],
  [0, [0x66, 0x4c, 0x61, 0x43], "audio/flac", "flac"],
  [0, [0x1a, 0x45, 0xdf, 0xa3], "video/webm", "webm"],
  [0, [0x77, 0x4f, 0x46, 0x32], "font/woff2", "woff2"],
  [0, [0x77, 0x4f, 0x46, 0x46], "font/woff", "woff"],
  [0, [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65], "application/vnd.sqlite3", "sqlite"],
] as [number, number[], string, string][];

const BINARY = { type: "application/octet-stream", ext: "bin" };

/**
 * Guesses the file type from magic bytes, falling back to text/JSON/SVG
 * detection for valid UTF-8, else binary.
 */
export function guessType(bytes: Uint8Array) {
  for (const [offset, sig, type, ext] of SIGNATURES) {
    if (sig.every((b, i) => bytes[offset + i] === b)) {
      return { type, ext };
    }
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return BINARY;
  }
  // Control characters other than tab, newline, CR and form feed: valid UTF-8, but not text.
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) {
    return BINARY;
  }
  const start = text.trimStart();
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(start)) {
    return { type: "image/svg+xml", ext: "svg" };
  }
  if (/^<\?xml/i.test(start)) {
    return { type: "application/xml", ext: "xml" };
  }
  if (/^<(!doctype html|html)/i.test(start)) {
    return { type: "text/html; charset=utf-8", ext: "html" };
  }
  if (/^[[{]/.test(start)) {
    try {
      JSON.parse(text);
      return { type: "application/json", ext: "json" };
    } catch {}
  }
  return { type: "text/plain; charset=utf-8", ext: "txt" };
}
