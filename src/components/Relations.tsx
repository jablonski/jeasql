import { foreignKeys, indexes } from "../server/db.ts";
import { tableUrl } from "../server/http/links.ts";

/** Foreign keys and indexes of a table. */
export default function Relations({ name }: { name: string }) {
  const keys = foreignKeys(name);
  const idx = indexes(name);
  return (
    <>
      {keys.length > 0 && (
        <>
          <h2>Foreign keys</h2>
          <ul>
            {keys.map((key) => (
              <li>
                <code>{key.from}</code> → <a href={tableUrl(key.table)}>{key.table}</a>
                {key.to ? <code>.{key.to}</code> : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {idx.length > 0 && (
        <>
          <h2>Indexes</h2>
          <ul>
            {idx.map((index) => (
              <li>
                <code>{index.name}</code> {index.unique ? "(unique)" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
