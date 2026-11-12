/**
 * Template for the inline cell editor (see browser/scripts/cell-editor.ts, which copies it
 * into a cell on double-click). The upload controls are removed for non-BLOB cells.
 */
export default function CellEditor() {
  return (
    <template data-js-cell-editor>
      <form class="cell-editor">
        <textarea rows="1" />
        <div>
          <button type="submit">Save</button>
          <button type="button" data-null>
            NULL
          </button>
          <button type="button" data-upload>
            Upload file…
          </button>
          <input type="file" hidden data-file />
          <button type="button" data-cancel>
            Cancel
          </button>
        </div>
        <output />
      </form>
    </template>
  );
}
