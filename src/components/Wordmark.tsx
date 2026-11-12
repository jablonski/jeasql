import { url } from "../server/url.ts";

/** The logo with the "JeasQL" name; `logoClass` sizes the logo. */
export default function Wordmark({ logoClass }: { logoClass: string }) {
  return (
    <>
      <img src={url("/favicon.svg")} alt="" class={logoClass} />
      <span>
        Jeas<span class="brand-accent">QL</span>
      </span>
    </>
  );
}
