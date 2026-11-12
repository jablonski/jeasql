// Burger button: shows/hides the side menu on narrow screens.
const toggle = document.querySelector(".nav-toggle");

/** Opens or closes the menu, keeping aria-expanded in sync for screen readers. */
function setOpen(open: boolean) {
  document.body.classList.toggle("nav-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
}

toggle?.addEventListener("click", () => setOpen(!document.body.classList.contains("nav-open")));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setOpen(false);
  }
});

document.addEventListener("click", (e) => {
  const target = e.target as Element;
  if (!target.closest("#nav, .nav-toggle")) {
    setOpen(false);
  }
});
