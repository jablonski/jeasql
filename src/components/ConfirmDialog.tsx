import Icon from "./Icon.tsx";

/**
 * The modal behind data-js-confirm forms (see browser/scripts/confirm.ts, which fills in
 * the texts and opens it). Both icons are rendered; CSS shows the matching one.
 */
export default function ConfirmDialog() {
  return (
    <dialog
      class="confirm"
      data-js-confirm-dialog
      aria-labelledby="confirm-title"
      aria-describedby="confirm-text"
    >
      <form method="dialog">
        <div class="confirm-body">
          <span class="confirm-icon" aria-hidden="true">
            <Icon name="warning" size={20} class="icon-danger" />
            <Icon name="question" size={20} class="icon-info" />
          </span>
          <div>
            <h2 id="confirm-title" />
            <p id="confirm-text" />
          </div>
        </div>
        <div class="actions">
          <button value="cancel" class="secondary">
            Cancel
          </button>
          <button value="ok">Delete</button>
        </div>
      </form>
    </dialog>
  );
}
