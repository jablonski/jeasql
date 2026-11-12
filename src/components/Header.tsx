import { basename } from "node:path";
import { cx } from "../server/lib/classes.ts";
import { url } from "../server/http/url.ts";
import Icon from "./Icon.tsx";
import Wordmark from "./Wordmark.tsx";

/** Top bar: menu button, brand, database switcher and logout. */
export default function Header({ file, route }: { file: string; route: string }) {
  return (
    <header>
      <button
        type="button"
        class="nav-toggle"
        data-js-nav-toggle
        aria-label="Menu"
        aria-controls="nav"
        aria-expanded="false"
      >
        <Icon name="menu" size={18} />
      </button>
      <Brand />
      <a
        href={url("/open-database")}
        class={cx("dbpath", route === "/open-database" && "active")}
        title={file ? `${file}\nClick to open another database` : "Open a database"}
      >
        <Icon name="folder" class="dbpath-icon" />
        <span class="dbpath-name">{file ? basename(file) : "No database open"}</span>
        <span class="badge">{file ? "Switch" : "Open"}</span>
      </a>
      <form method="post" action={url("/logout")} class="logout-form">
        <button type="submit" class="secondary logout-button" title="Log out" aria-label="Log out">
          <Icon name="logout" />
        </button>
      </form>
    </header>
  );
}

/** Logo and name, linking to the overview. */
function Brand() {
  return (
    <a href={url("/")} class="brand">
      <Wordmark logoClass="brand-logo" />
    </a>
  );
}
