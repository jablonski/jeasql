// Submit the SQL form with Ctrl/Cmd + Enter.
// The SQL is kept per tab, so it survives switching to other pages.
document.querySelectorAll("textarea[data-js-sql]").forEach((el) => {
  if (el instanceof HTMLTextAreaElement) {
    const KEY = "jeasql:sql";
    try {
      if (el.value.trim()) {
        sessionStorage.setItem(KEY, el.value);
      } else {
        el.value = sessionStorage.getItem(KEY) ?? "";
      }
    } catch {}
    el.addEventListener("input", () => {
      try {
        sessionStorage.setItem(KEY, el.value);
      } catch {}
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        el.form?.requestSubmit();
      }
    });
  }
});
