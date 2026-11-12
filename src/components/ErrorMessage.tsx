/** An error paragraph, or nothing when there is no error. */
export default function ErrorMessage({ error = "" }: { error?: string }) {
  return error ? <p class="error">{error}</p> : null;
}
