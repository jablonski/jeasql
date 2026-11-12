import type { Column } from "../server/db.ts";

/** Column definitions of a table or view. */
export default function ColumnList({ cols }: { cols: Column[] }) {
  return (
    <>
      <h2>Columns</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Not null</th>
              <th>Default</th>
              <th>Primary key</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((column) => (
              <tr>
                <td>{column.name}</td>
                <td>{column.type || "—"}</td>
                <td>{column.notnull ? "yes" : ""}</td>
                <td>{column.dflt_value ?? ""}</td>
                <td>{column.pk ? "yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
