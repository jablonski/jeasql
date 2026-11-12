// "Add column" on the create-table page: clone the last row with the next index.
document.querySelectorAll("[data-js-add-column]").forEach((button) => {
  button.addEventListener("click", () => {
    const body = document.querySelector("[data-js-columns]");
    const last = body?.lastElementChild;
    if (!body || !last) {
      return;
    }
    const index = body.children.length;
    const row = last.cloneNode(true) as HTMLElement;
    row.querySelectorAll("input, select").forEach((field) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
        return;
      }
      // "name.3" → "name.4": the server pairs fields by this index (see columnsFromForm).
      field.name = field.name.replace(/\.\d+$/, `.${index}`);
      if (field instanceof HTMLInputElement) {
        field.value = "";
        field.checked = false;
      }
    });
    body.append(row);
    row.querySelector("input")?.focus();
  });
});
