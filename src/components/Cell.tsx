import { blobUrl } from "../server/links.ts";

/** Longer cell texts are cut off; the full text (up to MAX_TITLE_TEXT) goes into the tooltip. */
const MAX_CELL_TEXT = 80;

/**
 * The tooltip is cut off too: the editor already gets the full text (data-value),
 * and a second full copy per cell would double the page size for big TEXT values.
 */
const MAX_TITLE_TEXT = 1000;

/**
 * One table cell, styled by value type. With `table`, `column` and `rowKey`, the
 * cell can be edited (see browser/scripts/cell-editor.ts) and a BLOB links to its download.
 * Also rendered by /update-cell, so a saved cell looks exactly like a loaded one.
 */
export default function Cell({
  value,
  table,
  column,
  rowKey,
}: {
  value: unknown;
  table?: string;
  column?: string;
  rowKey?: Record<string, unknown>;
}) {
  const editable = Boolean(table && column && rowKey);
  const blob = value instanceof Uint8Array;
  const isNull = value === null || value === undefined;
  const text = blob || isNull ? "" : String(value);
  const hint = editable ? (blob ? "Double-click to replace" : "Double-click to edit") : undefined;
  const blobHref = editable && blob ? blobUrl(table!, column!, rowKey!) : undefined;
  return (
    <td
      class={cellClass(value)}
      data-column={editable ? column : undefined}
      data-value={editable && !isNull && !blob ? editText(value, text) : undefined}
      data-blob={editable && blob ? "true" : undefined}
      title={cellTooltip(text, hint)}
    >
      {cellContent(value, text, blobHref)}
    </td>
  );
}

/** Cuts `text` to `max` characters, marking the cut with "…". */
const shorten = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/**
 * What the cell shows: "NULL", a BLOB's size (a download link with `blobHref`;
 * in tables a double-click replaces it), or the text cut to MAX_CELL_TEXT.
 */
function cellContent(value: unknown, text: string, blobHref: string | undefined) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (value instanceof Uint8Array) {
    const label = `BLOB (${value.byteLength} bytes)`;
    return blobHref ? (
      <a href={blobHref} download>
        {label}
      </a>
    ) : (
      label
    );
  }
  return shorten(text, MAX_CELL_TEXT);
}

/** The tooltip: the full text (up to MAX_TITLE_TEXT) of a cut-off cell, then the edit hint. */
function cellTooltip(text: string, hint: string | undefined) {
  if (text.length <= MAX_CELL_TEXT) {
    return hint;
  }
  const tip = shorten(text, MAX_TITLE_TEXT);
  return hint ? `${tip}\n\n${hint}` : tip;
}

/** "muted" for NULL and BLOB (shown greyed out), "num" for numbers. */
function cellClass(value: unknown) {
  if (value === null || value === undefined || value instanceof Uint8Array) {
    return "muted";
  }
  return typeof value === "number" || typeof value === "bigint" ? "num" : undefined;
}

/**
 * The text the editor starts with. Integers are read as BigInt, so a number is a REAL:
 * 1.0 keeps its ".0", or saving it unchanged would store INTEGER 1 in an untyped column.
 */
function editText(value: unknown, text: string) {
  return typeof value === "number" && Number.isInteger(value) ? value.toFixed(1) : text;
}
