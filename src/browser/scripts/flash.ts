// Toasts: clean their params from the URL; hide notices after a few
// seconds, keep errors until dismissed.
// The param names match signFlash in server/flash.ts (not imported: it needs node:crypto).
const toasts = document.querySelectorAll("[data-js-flash]");
if (toasts.length) {
  const url = new URL(location.href);
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.delete("sig");
  history.replaceState(null, "", url);
}
toasts.forEach((el) => {
  const remove = () => {
    const box = el.parentElement;
    el.remove();
    if (box && !box.children.length) {
      box.remove();
    }
  };
  el.querySelector("button")?.addEventListener("click", remove);
  if (el.getAttribute("data-js-flash") !== "sticky") {
    setTimeout(remove, 4000);
  }
});
