// Row keys on their way between server and browser: column → value pairs that
// identify one row (see keyColumnsOf in db/rows.ts).
import type { SQLInputValue } from "node:sqlite";

/** Column → value pairs identifying one row. */
export type RowKey = Record<string, unknown>;

/**
 * Serializes a row key for the browser (turned back by parseKey and keyValue).
 * JSON has no BigInt or bytes: safe BigInts become numbers, larger ones {"$big": digits},
 * BLOBs {"$hex": hex}. Tags keep them apart from TEXT keys that merely look alike.
 */
export const keyJson = (key: RowKey) =>
  JSON.stringify(key, (_, v) =>
    typeof v === "bigint"
      ? Number.isSafeInteger(Number(v))
        ? Number(v)
        : { $big: String(v) }
      : v instanceof Uint8Array
        ? { $hex: Buffer.from(v).toString("hex") }
        : v,
  );

/**
 * A row key sent by the browser: an object of column → value, or its JSON text.
 * Missing means {}; anything else that is no object throws. Values stay encoded
 * (see keyValue).
 */
export function parseKey(input: unknown): RowKey {
  const key = typeof input === "string" ? JSON.parse(input || "{}") : (input ?? {});
  if (typeof key !== "object" || key === null || Array.isArray(key)) {
    throw new Error("Invalid row key");
  }
  return key;
}

/** Turns one encoded key value (see keyJson) back into a bindable SQL value. */
export function keyValue(v: unknown): SQLInputValue {
  if (typeof v !== "object" || v === null) {
    return v as SQLInputValue;
  }
  const { $big, $hex } = v as { $big?: unknown; $hex?: unknown };
  if (typeof $big === "string" && /^-?\d+$/.test($big)) {
    return BigInt($big);
  }
  if (typeof $hex === "string" && /^([0-9a-f]{2})*$/i.test($hex)) {
    return new Uint8Array(Buffer.from($hex, "hex"));
  }
  throw new Error("Invalid row key");
}

/**
 * The key values of `columns` as text joined by "-", e.g. for file names
 * (BLOB values as hex). Other properties of the key are ignored. Throws for invalid values.
 */
export function keyLabel(key: RowKey, columns: string[]) {
  return columns
    .map((name) => {
      const value = keyValue(key[name]);
      return value instanceof Uint8Array ? Buffer.from(value).toString("hex") : String(value);
    })
    .join("-");
}
