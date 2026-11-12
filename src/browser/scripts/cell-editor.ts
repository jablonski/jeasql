// Inline cell editing: double-click a cell, Enter saves, Shift+Enter adds a line, Escape cancels.
// "Upload file…" stores a file's bytes as a BLOB.
import { parseJson } from "./json.ts";

document.querySelectorAll("[data-js-table]").forEach((wrap) => {
  if (!(wrap instanceof HTMLElement)) {
    return;
  }
  const table = wrap.dataset.jsTable;
  const blobColumns = parseJson<string[]>(wrap.dataset.blobColumns, []);
  // Built by the server (components/DataTable.tsx), so all app URLs come from url().
  const updateUrl = wrap.dataset.updateUrl ?? "";

  wrap.addEventListener("dblclick", (e) => {
    const td = e.target instanceof Element ? e.target.closest("td[data-column]") : null;
    if (!(td instanceof HTMLTableCellElement) || td.querySelector("form")) {
      return;
    }
    // Double-clicking the download link of a BLOB should not open the editor.
    if (e.target instanceof Element && e.target.closest("a")) {
      return;
    }
    edit(td);
  });

  // The editor markup comes from components/CellEditor.tsx.
  const template = wrap.querySelector("template[data-js-cell-editor]");

  function edit(td: HTMLTableCellElement) {
    if (!(template instanceof HTMLTemplateElement)) {
      return;
    }
    const original = [...td.childNodes];
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const form = fragment.firstElementChild as HTMLFormElement;
    const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
    const output = form.querySelector<HTMLOutputElement>("output")!;
    const file = form.querySelector<HTMLInputElement>("[data-file]")!;
    const upload = form.querySelector<HTMLButtonElement>("[data-upload]")!;
    // Uploads only for BLOB columns, or cells that already hold a BLOB.
    if (blobColumns.includes(td.dataset.column ?? "") || td.dataset.blob) {
      upload.addEventListener("click", () => file.click());
    } else {
      upload.remove();
      file.remove();
    }
    // BLOBs can't be edited as text, so start empty and offer the upload.
    input.value = td.dataset.value ?? "";
    if (td.dataset.blob) {
      input.placeholder = "BLOB – type text or upload a file";
    }
    input.rows = Math.min(8, input.value.split("\n").length);
    td.replaceChildren(form);
    td.classList.add("editing");
    input.focus();
    input.select();

    const close = () => {
      td.classList.remove("editing");
      td.replaceChildren(...original);
    };

    const row = td.closest("tr");
    const key = row?.dataset.key ?? "{}";
    const column = td.dataset.column ?? "";

    // One request at a time: a second one would still carry the old row key.
    let saving = false;
    const save = async (value: string | null | File) => {
      if (saving) {
        return;
      }
      saving = true;
      form.inert = true;
      output.textContent = value instanceof File ? "Uploading…" : "Saving…";
      try {
        const response = await fetch(updateUrl, cellRequest(key, column, value));
        const result = await response.json().catch(() => ({ error: response.statusText }));
        if (!response.ok) {
          throw new Error(result.error ?? response.statusText);
        }
        replaceCell(td, result.html);
        if (row && result.key) {
          updateRowKey(row, result.key);
        }
      } catch (error) {
        output.textContent = String(error instanceof Error ? error.message : error);
      } finally {
        saving = false;
        form.inert = false;
      }
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save(input.value);
    });
    form.querySelector("[data-null]")?.addEventListener("click", () => save(null));
    form.querySelector("[data-cancel]")?.addEventListener("click", close);
    file.addEventListener("change", () => {
      if (file.files?.[0]) {
        save(file.files[0]);
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        close();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }

  /** The /update-cell request: multipart for a file, else JSON. */
  function cellRequest(key: string, column: string, value: string | null | File): RequestInit {
    if (value instanceof File) {
      // Fields go before the file, so the server sees them with it.
      const body = new FormData();
      body.append("table", table ?? "");
      body.append("key", key);
      body.append("column", column);
      body.append("file", value);
      return { method: "POST", headers: { accept: "application/json" }, body };
    }
    return {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ table, key: JSON.parse(key), column, value }),
    };
  }

  /**
   * Stores a row's new key (after a key column was edited) everywhere it is used:
   * the row itself, its delete form and the BLOB download links.
   */
  function updateRowKey(row: HTMLTableRowElement, key: string) {
    if (row.dataset.key === key) {
      return;
    }
    row.dataset.key = key;
    row.querySelectorAll<HTMLInputElement>('input[name="key"]').forEach((input) => {
      input.value = key;
    });
    row.querySelectorAll<HTMLAnchorElement>("a[data-blob-link]").forEach((link) => {
      const href = new URL(link.href);
      href.searchParams.set("key", key);
      link.href = href.toString();
    });
  }

  /** Swaps in the saved cell, rendered by the server (components/Cell.tsx). */
  function replaceCell(td: HTMLTableCellElement, html: string) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const cell = template.content.firstElementChild;
    if (!(cell instanceof HTMLTableCellElement)) {
      throw new Error("Unexpected response");
    }
    td.replaceWith(cell);
    cell.classList.add("saved");
    setTimeout(() => cell.classList.remove("saved"), 1200);
  }
});
