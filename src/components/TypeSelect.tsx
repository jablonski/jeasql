import { TYPES } from "../server/db.ts";

/** Select for a column type ("" is shown as "(none)"). */
export default function TypeSelect({ name, selected }: { name: string; selected: string }) {
  return (
    <select name={name}>
      {TYPES.map((type) => (
        <option value={type} selected={type === selected}>
          {type || "(none)"}
        </option>
      ))}
    </select>
  );
}
