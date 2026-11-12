import { cx } from "../server/lib/classes.ts";
import Icon from "./Icon.tsx";
import type { IconName } from "./Icon.tsx";

/**
 * Centred card with an optional icon and a heading (open, login, 404 pages).
 * `kicker` is shown above the heading; with `action` the card itself is a POST form.
 */
export default function Hero({
  title,
  icon,
  kicker,
  class: className,
  action,
  children,
}: {
  title: string;
  icon?: IconName;
  kicker?: unknown;
  class?: string;
  action?: string;
  children?: unknown;
}) {
  const content = (
    <>
      {icon && (
        <div class="hero-icon">
          <Icon name={icon} size={28} />
        </div>
      )}
      {kicker}
      <h1>{title}</h1>
      {children}
    </>
  );
  const classes = cx("hero", className);
  return action ? (
    <form method="post" action={action} class={classes}>
      {content}
    </form>
  ) : (
    <section class={classes}>{content}</section>
  );
}
