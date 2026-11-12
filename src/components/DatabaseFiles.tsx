import { basename, dirname } from "node:path";
import { cx } from "../server/classes.ts";
import { fileInfo } from "../server/files.ts";
import { url } from "../server/url.ts";
import HiddenFields from "./HiddenFields.tsx";

/** Clickable cards, each posting its path to /open-database. */
export default function DatabaseFiles({
  title,
  files,
  current,
}: {
  title: string;
  files: string[];
  current: string;
}) {
  if (!files.length) {
    return null;
  }
  return (
    <section>
      <h2>{title}</h2>
      <div class="db-cards">
        {files.map((file) => (
          <form method="post" action={url("/open-database")}>
            <HiddenFields fields={{ path: file }} />
            <button type="submit" class={cx("db-card", file === current && "current")} title={file}>
              <strong>{basename(file)}</strong>
              <span class="db-card-dir">{dirname(file)}</span>
              <span class="meta">{fileMeta(file, current)}</span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

/** Card subtitle: "Open now", size and date, or a missing-file note. */
function fileMeta(file: string, current: string) {
  if (file === current) {
    return "Open now";
  }
  const info = fileInfo(file);
  return info ? `${formatSize(info.size)} · ${info.mtime.toLocaleDateString()}` : "File not found";
}

/** A file size in readable units, e.g. 1536 → "1.5 KB". */
function formatSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}
