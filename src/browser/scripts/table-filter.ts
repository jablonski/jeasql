// Filter row of data tables: instant clearing and stable column widths.
import { parseJson } from "./json.ts";
import { load, save } from "./storage.ts";

// Filter row of a table (see DataTable): clearing an active filter applies at once.
document.addEventListener("input", (e) => {
  const input = e.target;
  if (
    input instanceof HTMLInputElement &&
    input.closest("[data-js-filter-row]") &&
    input.value === "" &&
    input.defaultValue !== "" // only filters that are applied now, not ones being typed
  ) {
    input.form?.requestSubmit();
  }
});

// Column widths: filtering shows other rows, so an auto-sized table would resize its
// columns. The widths of the unfiltered table are remembered per table (for this tab)
// and fixed while filters are applied: a fixed table layout takes them exactly
// (min-width or width on cells are only hints for automatic layout, which still
// redistributes space by content). Longer content is cut off with an ellipsis.
const filterRow = document.querySelector("[data-js-filter-row]");
const table = filterRow?.closest("table");
if (table) {
  const key = `widths:${new URLSearchParams(location.search).get("name")}`;
  const headers = [...table.querySelectorAll<HTMLElement>("thead tr:first-child th")];
  const filtered = [...filterRow!.querySelectorAll("input")].some((i) => i.defaultValue !== "");
  if (!filtered) {
    save(key, JSON.stringify(headers.map((th) => th.getBoundingClientRect().width)));
  } else {
    // Nothing stored (or storage blocked): columns just size to their content.
    const widths = parseJson<unknown>(load(key) ?? undefined, null);
    if (Array.isArray(widths) && widths.length === headers.length) {
      headers.forEach((th, i) => (th.style.width = `${widths[i]}px`));
      table.style.width = `${widths.reduce((sum: number, w: number) => sum + w, 0)}px`;
      table.classList.add("fixed-widths");
    }
  }
}
