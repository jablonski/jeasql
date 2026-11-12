// Submit the SQL form with Ctrl/Cmd + Enter.
// The SQL is kept per tab, so it survives switching to other pages.
import { load, save } from "./storage.ts";

document.querySelectorAll("textarea[data-js-sql]").forEach((el) => {
  if (el instanceof HTMLTextAreaElement) {
    const KEY = "sql";
    if (el.value.trim()) {
      save(KEY, el.value);
    } else {
      el.value = load(KEY) ?? "";
    }
    el.addEventListener("input", () => save(KEY, el.value));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        el.form?.requestSubmit();
      }
    });
  }
});
