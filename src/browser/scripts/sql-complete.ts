// SQL completion: suggests keywords, tables and columns while typing.
// Tab/Enter accepts, arrows move, Escape closes, Ctrl+Space opens on demand.
import { parseJson } from "./json.ts";

/** SQL keywords and common functions offered for completion. */
const KEYWORDS = (
  "SELECT FROM WHERE AND OR NOT NULL IS IN LIKE GLOB BETWEEN EXISTS AS " +
  "DISTINCT ORDER BY GROUP HAVING LIMIT OFFSET ASC DESC JOIN LEFT INNER " +
  "CROSS ON USING UNION ALL INTERSECT EXCEPT CASE WHEN THEN ELSE END " +
  "INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW INDEX DROP ALTER " +
  "ADD COLUMN RENAME TO PRIMARY KEY DEFAULT UNIQUE CHECK REFERENCES WITH " +
  "RECURSIVE PRAGMA EXPLAIN QUERY PLAN BEGIN COMMIT ROLLBACK VACUUM " +
  "COUNT SUM AVG MIN MAX COALESCE IFNULL LENGTH LOWER UPPER SUBSTR " +
  "REPLACE TRIM ROUND ABS CAST DATE TIME DATETIME STRFTIME JSON_EXTRACT"
).split(" ");

document.querySelectorAll("textarea[data-js-sql]").forEach((node) => {
  if (!(node instanceof HTMLTextAreaElement)) {
    return;
  }
  const el = node; // const keeps the narrowed type inside nested functions
  const schema = parseJson<Record<string, string[]>>(el.dataset.schema, {});
  const tables = Object.keys(schema);
  const allColumns = [...new Set(Object.values(schema).flat())];

  const list = document.createElement("ul");
  list.className = "sql-complete";
  list.hidden = true;
  document.body.append(list);
  type Item = { label: string; kind: string };
  let items: Item[] = [];
  let selected = 0;
  let start = 0;

  /** Word before the cursor, plus an optional "table." qualifier. */
  function context() {
    const before = el.value.slice(0, el.selectionStart);
    // At the end of the text: an optional `table.` (maybe quoted: "t". or `t`.),
    // then the word being typed. E.g. "SELECT u.na" → table "u", word "na".
    // (`\1` repeats the opening quote; for "[" it doesn't match "]", so [t]. isn't qualified.)
    const match = /(?:(["`[]?)([\w$]+)\1?\.)?([\w$]*)$/.exec(before);
    return {
      table: match?.[2] ?? "",
      word: match?.[3] ?? "",
      before: before.slice(0, before.length - (match?.[0].length ?? 0)),
    };
  }

  /** Tables mentioned in the statement, to rank their columns first. */
  function usedTables() {
    const text = el.value.toLowerCase();
    return tables.filter((name) => text.includes(name.toLowerCase()));
  }

  /** Suggestions for `word`, optionally qualified by `table.`; `before` is the text before both. */
  function candidates(table: string, word: string, before: string): Item[] {
    const lower = word.toLowerCase();
    const matches = (s: string) => {
      const name = s.toLowerCase();
      return name.startsWith(lower) && name !== lower;
    };

    const qualified = tables.find((name) => name.toLowerCase() === table.toLowerCase());
    if (table) {
      // "alias.col" with an unknown table/alias: no guesses.
      return qualified
        ? schema[qualified].filter(matches).map((label) => ({ label, kind: "column" }))
        : [];
    }
    // After FROM/JOIN/INTO/UPDATE/TABLE only tables make sense.
    const wantsTable = /\b(from|join|into|update|table)\s+$/i.test(before);
    // Columns of tables already in the statement first; the Set below removes duplicates.
    const ranked = [...usedTables().flatMap((name) => schema[name]), ...allColumns];
    return [
      ...tables.filter(matches).map((label) => ({ label, kind: "table" })),
      ...(wantsTable
        ? []
        : [
            ...[...new Set(ranked)].filter(matches).map((label) => ({ label, kind: "column" })),
            ...KEYWORDS.filter(matches).map((label) => ({ label, kind: "keyword" })),
          ]),
    ];
  }

  function update(force = false) {
    if (el.selectionStart !== el.selectionEnd) {
      return hide();
    }
    const { table, word, before } = context();
    if (!force && !word && !table) {
      return hide();
    }
    items = candidates(table, word, before).slice(0, 50);
    if (!items.length) {
      return hide();
    }
    start = el.selectionStart - word.length;
    selected = 0;
    render();
  }

  function render() {
    list.replaceChildren(
      ...items.map((item, i) => {
        const li = document.createElement("li");
        li.className = i === selected ? "selected" : "";
        li.dataset.kind = item.kind;
        li.textContent = item.label;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selected = i;
          accept();
        });
        return li;
      }),
    );
    const { top, left, height } = caret();
    const box = el.getBoundingClientRect();
    list.style.top = `${window.scrollY + box.top + top + height - el.scrollTop}px`;
    list.style.left = `${window.scrollX + box.left + Math.min(left, box.width - 200)}px`;
    list.hidden = false;
    list.children[selected]?.scrollIntoView({ block: "nearest" });
  }

  function hide() {
    list.hidden = true;
    items = [];
  }

  function accept() {
    const item = items[selected];
    if (!item) {
      return;
    }
    const needsQuotes = item.kind !== "keyword" && !/^[a-z_][\w$]*$/i.test(item.label);
    const text = needsQuotes ? `"${item.label.replaceAll('"', '""')}"` : item.label;
    el.setRangeText(text, start, el.selectionStart, "end");
    el.dispatchEvent(new Event("input"));
    hide();
  }

  /**
   * Caret position inside the textarea, measured with a mirror element.
   * Textareas don't expose the caret's pixel position, so an invisible div copies
   * the textarea's size and font, gets the text up to the caret plus a marker span,
   * and the marker's offset is where the caret is.
   */
  function caret() {
    const style = getComputedStyle(el);
    const mirror = document.createElement("div");
    for (const prop of [
      "box-sizing",
      "width",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "tab-size",
    ]) {
      mirror.style.setProperty(prop, style.getPropertyValue(prop));
    }
    Object.assign(mirror.style, {
      position: "absolute",
      visibility: "hidden",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      top: "0",
      left: "0",
    });
    mirror.textContent = el.value.slice(0, el.selectionStart);
    const marker = document.createElement("span");
    marker.textContent = "​";
    mirror.append(marker);
    document.body.append(mirror);
    const result = {
      top: marker.offsetTop,
      left: marker.offsetLeft,
      height: parseFloat(style.lineHeight) || marker.offsetHeight,
    };
    mirror.remove();
    return result;
  }

  el.addEventListener("input", (e) => {
    // Only react to typing, not to programmatic changes.
    if (e instanceof InputEvent) {
      update();
    }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      update(true);
      return;
    }
    if (list.hidden) {
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      selected = (selected + step + items.length) % items.length;
      render();
    } else if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey) || e.key === "Tab") {
      // sql-editor.ts only handles Ctrl/⌘ + Enter, which is excluded above.
      e.preventDefault();
      accept();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  });
  el.addEventListener("blur", hide);
  el.addEventListener("click", hide);
  el.addEventListener("scroll", hide);
  window.addEventListener("resize", hide);
});
