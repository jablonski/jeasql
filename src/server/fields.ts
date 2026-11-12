// Reading and validating fields of forms, JSON bodies and query strings.
// `field` reads a field as given (e.g. passwords, SQL kept for display); `trimmed`
// normalises user input such as names; `requireText` also insists on a value.

/** Trimmed text of a field value; "" for missing values. */
export const trimmed = (value: unknown) => String(value ?? "").trim();

/** Trimmed text of a field value; throws `message` if it is empty. */
export function requireText(value: unknown, message: string) {
  const text = trimmed(value);
  if (!text) {
    throw new Error(message);
  }
  return text;
}

/** A field as text: "" if missing; JSON values other than strings become text. */
export function field(fields: Record<string, unknown>, name: string) {
  return String(fields[name] ?? "");
}

/** True if a checkbox field was ticked. */
export function checked(fields: Record<string, unknown>, name: string) {
  return fields[name] === "on";
}
