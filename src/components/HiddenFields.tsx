/** Hidden inputs re-sending `fields` with a form; undefined values are left out. */
export default function HiddenFields({ fields }: { fields: Record<string, string | undefined> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) =>
        value === undefined ? null : <input type="hidden" name={name} value={value} />,
      )}
    </>
  );
}
