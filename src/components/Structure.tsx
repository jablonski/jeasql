import HiddenFields from "./HiddenFields.tsx";
import TypeSelect from "./TypeSelect.tsx";
import type { Column, TableOp } from "../server/db.ts";
import { url } from "../server/http/url.ts";
import { cx } from "../server/lib/classes.ts";

/** Forms for structural changes (ALTER TABLE / DROP TABLE). */
export default function Structure({ name, cols }: { name: string; cols: Column[] }) {
  const columnSelect = (
    <select name="column" required>
      {cols.map((column) => (
        <option value={column.name}>{column.name}</option>
      ))}
    </select>
  );
  return (
    <>
      <h2>Structure</h2>
      <div class="cards">
        <AlterForm table={name} op="add-column" title="Add column">
          <div class="inline-fields">
            <input name="name" placeholder="name" required />
            <TypeSelect name="type" selected="TEXT" />
          </div>
          <div class="inline-fields">
            <input name="dflt" placeholder="default" />
            <label class="inline">
              <input type="checkbox" name="notnull" /> NOT NULL
            </label>
          </div>
          <button type="submit">Add column</button>
        </AlterForm>

        <AlterForm
          table={name}
          op="rename-column"
          title="Rename column"
          confirm='Rename column "{column}" to "{name}"? Queries and views using the old name may break.'
          confirmOk="Rename"
        >
          <div class="inline-fields">
            {columnSelect}
            <input name="name" placeholder="new name" required />
          </div>
          <button type="submit">Rename</button>
        </AlterForm>

        <AlterForm
          table={name}
          op="rename-table"
          title="Rename table"
          confirm='Rename table "{table}" to "{name}"? Queries using the old name may break.'
          confirmOk="Rename"
        >
          <input name="name" value={name} required />
          <button type="submit">Rename</button>
        </AlterForm>

        <AlterForm
          table={name}
          op="drop-column"
          title="Drop column"
          danger
          confirm='Drop column "{column}" and all its data? This cannot be undone.'
        >
          {columnSelect}
          <button type="submit" class="danger">
            Drop column
          </button>
        </AlterForm>

        <AlterForm
          table={name}
          op="drop-table"
          title="Drop table"
          danger
          confirm='Drop table "{table}" and all its rows? This cannot be undone.'
        >
          <p class="meta">Deletes the table and all its rows.</p>
          <button type="submit" class="danger">
            Drop table
          </button>
        </AlterForm>
      </div>
    </>
  );
}

/**
 * One card posting to /alter-table with the operation `op`.
 * `confirm` asks first (see browser/scripts/confirm.ts); `confirmOk` labels its button.
 */
function AlterForm({
  table,
  op,
  title,
  danger = false,
  confirm,
  confirmOk,
  children,
}: {
  table: string;
  op: TableOp;
  title: string;
  danger?: boolean;
  confirm?: string;
  confirmOk?: string;
  children?: unknown;
}) {
  return (
    <form
      method="post"
      action={url("/alter-table")}
      class={cx("card", danger && "danger")}
      data-js-confirm={confirm}
      data-js-confirm-ok={confirmOk}
    >
      <HiddenFields fields={{ op, table }} />
      <h3>{title}</h3>
      {children}
    </form>
  );
}
