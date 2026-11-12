// CSS class names for components.

/** Joins the truthy class names: cx("card", danger && "danger") → "card danger". */
export function cx(...names: unknown[]) {
  return names.filter(Boolean).join(" ") || undefined;
}
