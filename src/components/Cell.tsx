import { cx } from "../server/classes.ts";
import { blobUrl } from "../server/links.ts";

/** Longer cell texts are cut off; the full text (up to MAX_TITLE_TEXT) goes into the tooltip. */
const MAX_CELL_TEXT = 80;

/**
 * The tooltip is cut off too: the editor already gets the full text (data-value),
 * and a second full copy per cell would double the page size for big TEXT values.
 */
const MAX_TITLE_TEXT = 1000;

/**
 * One table cell, styled by value type. With `table`, `column` and `rowKey`, a BLOB
 * links to its download and, unless `readOnly` (e.g. a generated column), the cell can
 * be edited (see browser/scripts/cell-editor.ts).
 * Also rendered by /update-cell, so a saved cell looks exactly like a loaded one.
 */
export default function Cell({
  value,
  table,
  column,
  rowKey,
  readOnly = false,
}: {
  value: unknown;
  table?: string;
  column?: string;
  rowKey?: Record<string, unknown>;
  readOnly?: boolean;
}) {
  const located = Boolean(table && column && rowKey);
  const editable = located && !readOnly;
  // Read-only in a table whose other cells can be edited: marked, so it doesn't look editable.
  const locked = located && readOnly;
  const kind = kindOf(value);
  const blob = kind === "blob";
  const isNull = kind === "null";
  const text = blob || isNull ? "" : String(value);
  const hint = editable
    ? blob
      ? "Double-click to replace"
      : "Double-click to edit"
    : locked
      ? "Computed by SQLite – can't be edited"
      : undefined;
  const blobHref = located && blob ? blobUrl(table!, column!, rowKey!) : undefined;
  return (
    <td
      class={cx(CELL_CLASS[kind], locked && "readonly")}
      data-column={editable ? column : undefined}
      data-value={editable && !isNull && !blob ? editText(value, text) : undefined}
      data-blob={editable && blob ? "true" : undefined}
      title={cellTooltip(text, hint)}
    >
      {cellContent(kind, value, text, blobHref)}
    </td>
  );
}

/** Cuts `text` to `max` characters, marking the cut with "…". */
const shorten = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** What kind of value a cell holds; decides how it is shown and styled. */
type Kind = "null" | "blob" | "num" | "text";

function kindOf(value: unknown): Kind {
  if (value === null || value === undefined) {
    return "null";
  }
  if (value instanceof Uint8Array) {
    return "blob";
  }
  return typeof value === "number" || typeof value === "bigint" ? "num" : "text";
}

/** "muted" for NULL and BLOB (shown greyed out), "num" for numbers. */
const CELL_CLASS: Record<Kind, string | undefined> = {
  null: "muted",
  blob: "muted",
  num: "num",
  text: undefined,
};

/**
 * What the cell shows: "NULL", a BLOB's size (a download link with `blobHref`;
 * in tables a double-click replaces it), or the text cut to MAX_CELL_TEXT.
 */
function cellContent(kind: Kind, value: unknown, text: string, blobHref: string | undefined) {
  if (kind === "null") {
    return "NULL";
  }
  if (value instanceof Uint8Array) {
    const label = `BLOB (${value.byteLength} bytes)`;
    return blobHref ? (
      <a href={blobHref} download data-blob-link>
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

/**
 * The text the editor starts with. Integers are read as BigInt, so a number is a REAL:
 * 1.0 keeps its ".0", or saving it unchanged would store INTEGER 1 in an untyped column.
 */
function editText(value: unknown, text: string) {
  return typeof value === "number" && Number.isInteger(value) ? value.toFixed(1) : text;
}
