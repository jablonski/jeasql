import TypeSelect from "./TypeSelect.tsx";
import { columnField } from "../server/http/forms.ts";
import type { ColumnField } from "../server/http/forms.ts";
import { checked } from "../server/lib/fields.ts";

/**
 * One column row of the create-table form; fields are named by columnField.
 * `fields` holds the submitted fields, to refill the form after an error;
 * `fresh` marks a form not submitted yet, whose first row is a primary key by default.
 */
export default function NewColumnRow({
  i,
  fields,
  fresh,
}: {
  i: number;
  fields: Record<string, string>;
  fresh: boolean;
}) {
  const type = fields[columnField("type", i)] ?? (i === 0 ? "INTEGER" : "TEXT");
  return (
    <tr>
      <td>
        <input
          name={columnField("name", i)}
          value={fields[columnField("name", i)] ?? (i === 0 ? "id" : "")}
        />
      </td>
      <td>
        <TypeSelect name={columnField("type", i)} selected={type} />
      </td>
      {(["pk", "notnull", "unique"] as ColumnField[]).map((flag) => (
        <td class="check">
          <input
            type="checkbox"
            name={columnField(flag, i)}
            checked={checked(fields, columnField(flag, i)) || (fresh && flag === "pk" && i === 0)}
          />
        </td>
      ))}
      <td>
        <input
          name={columnField("dflt", i)}
          value={fields[columnField("dflt", i)] ?? ""}
          placeholder="—"
        />
      </td>
    </tr>
  );
}
