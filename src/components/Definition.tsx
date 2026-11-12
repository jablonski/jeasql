/** The SQL that defines a table or view (its CREATE statement). */
export default function Definition({ sql }: { sql: string }) {
  return (
    <>
      <h2>Definition</h2>
      <pre>
        <code>{sql}</code>
      </pre>
    </>
  );
}
