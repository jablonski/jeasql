import type { RowStats } from "./DataTable.tsx";
import HiddenFields from "./HiddenFields.tsx";

/** Where page links lead: a URL per page, or a POST form re-sending `fields` with `page`. */
export type PageTarget =
  | { href: (page: number) => string }
  | { action: string; fields: Record<string, string> };

/**
 * Page links. With `pages` the total is known (and "Last" is offered); otherwise
 * a next page exists if the table above (rendered first) was `stats.truncated`.
 */
export default function Pager({
  page,
  pages,
  stats,
  target,
}: {
  page: number;
  pages?: number;
  stats?: RowStats;
  target: PageTarget;
}) {
  const hasNext = pages === undefined ? Boolean(stats?.truncated) : page < pages;
  if (page <= 1 && !hasNext) {
    return null;
  }
  const link = (to: number | undefined, label: string) => (
    <PageLink target={target} page={to} label={label} />
  );
  return (
    <nav class="pager" aria-label="Pages">
      {link(page > 1 ? 1 : undefined, "« First")}
      {link(page > 1 ? page - 1 : undefined, "‹ Prev")}
      <span>
        Page {page}
        {pages !== undefined && ` of ${pages}`}
      </span>
      {link(hasNext ? page + 1 : undefined, "Next ›")}
      {pages !== undefined && link(hasNext ? pages : undefined, "Last »")}
    </nav>
  );
}

/** A link (or POST button) to `page`, or plain text without one. */
function PageLink({ target, page, label }: { target: PageTarget; page?: number; label: string }) {
  if (page === undefined) {
    return <span>{label}</span>;
  }
  if ("href" in target) {
    return <a href={target.href(page)}>{label}</a>;
  }
  return (
    <form method="post" action={target.action}>
      <HiddenFields fields={target.fields} />
      <button type="submit" name="page" value={String(page)} class="link">
        {label}
      </button>
    </form>
  );
}
