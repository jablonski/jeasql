// Ask before destructive form submits (delete row, drop column/table).
// Forms opt in with data-js-confirm="Question?"; the answer comes from a modal dialog.
// {field} in the question is replaced with that form field's value (in one pass, so a
// value that itself contains "{name}" is shown as typed).
// data-js-confirm-ok="Rename" sets a non-destructive button label (default: Delete/Drop in red).
// The dialog markup comes from components/ConfirmDialog.tsx (pages without it skip all this).
const dialog = document.querySelector("[data-js-confirm-dialog]");
if (dialog instanceof HTMLDialogElement) {
  setup(dialog);
}

function setup(dialog: HTMLDialogElement) {
  const title = dialog.querySelector<HTMLHeadingElement>("h2")!;
  const message = dialog.querySelector<HTMLParagraphElement>("p")!;
  const ok = dialog.querySelector<HTMLButtonElement>('[value="ok"]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[value="cancel"]')!;

  let pending: HTMLFormElement | null = null;

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.jsConfirm) {
      return;
    }
    e.preventDefault();
    pending = form;
    const data = new FormData(form);
    const text = form.dataset.jsConfirm.replace(/\{(\w+)\}/g, (match, field) =>
      data.has(field) ? String(data.get(field)).trim() : match,
    );
    // The question up to the first "? " is the title, the rest explains it.
    const split = text.indexOf("? ");
    title.textContent = split < 0 ? text : text.slice(0, split + 1);
    message.textContent = split < 0 ? "" : text.slice(split + 2);
    const label = form.dataset.jsConfirmOk;
    const danger = !label;
    // "Drop …" questions get a matching button label.
    ok.textContent = label ?? (/^drop\b/i.test(form.dataset.jsConfirm) ? "Drop" : "Delete");
    ok.className = danger ? "danger" : "";
    dialog.classList.toggle("danger", danger);
    dialog.returnValue = "";
    dialog.showModal();
    // Safer default: Enter cancels unless the user moves to the red button.
    cancel.focus();
  });

  // Clicking the dimmed backdrop cancels.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      dialog.close("cancel");
    }
  });

  dialog.addEventListener("close", () => {
    // form.submit() skips the submit event, so the dialog doesn't open again.
    if (dialog.returnValue === "ok") {
      pending?.submit();
    }
    pending = null;
  });
}
