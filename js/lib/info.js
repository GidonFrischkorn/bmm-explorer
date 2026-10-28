// The (i) after a control's label: a note that opens on click (or Enter, Space) and closes on Escape, an
// outside click, focus moving to another control, another note opening, or its control being hidden. Markup:
// <button class="ex-info" aria-controls="id"> and <div class="ex-info-pop" id="id" hidden>. The note floats by
// its button, inside the window, so opening it moves nothing on the dashboard.
let open = null, ready = false;

// Under the button where the note fits, else over it. A long note that fits on neither side (the simulate
// notes, low in a laptop window) widens first. Where nothing fits (a small window), the larger side, and the
// page scrolls. The fixed navbar is the window's top while it shows.
function place(button, pop) {
  const b = button.getBoundingClientRect(), box = pop.offsetParent.getBoundingClientRect();
  const head = document.getElementById("quarto-header")?.getBoundingClientRect().bottom ?? 0;
  const below = window.innerHeight - 8 - b.bottom - 4, above = b.top - 4 - Math.max(0, head) - 8;
  pop.style.maxWidth = "";
  if (pop.offsetHeight > below && pop.offsetHeight > above) pop.style.maxWidth = "min(40rem, calc(100vw - 16px))";
  const h = pop.offsetHeight, up = h > below && (h <= above || above > below);
  const left = Math.max(8, Math.min(b.left, document.documentElement.clientWidth - pop.offsetWidth - 8));
  pop.style.left = `${left - box.left}px`;
  pop.style.top = `${(up ? b.top - 4 - h : b.bottom + 4) - box.top}px`;
}

function toggle(button, on) {
  const pop = document.getElementById(button.getAttribute("aria-controls"));
  button.setAttribute("aria-expanded", String(on));
  pop.hidden = !on;
  if (on) place(button, pop);
  open = on ? button : null;
}

export function initInfo() {
  if (ready) return;
  ready = true;
  // The button is named after the parameter, the label's text up to its first comma, unless it has a name.
  for (const b of document.querySelectorAll("button.ex-info")) {
    b.setAttribute("aria-expanded", "false");
    const label = b.closest(".ex-label")?.querySelector("label");
    if (!b.hasAttribute("aria-label")) b.setAttribute("aria-label", `About ${label ? label.textContent.split(",")[0].trim() : "this control"}`);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest?.("button.ex-info");
    if (b) {
      const was = open === b;
      if (open) toggle(open, false);
      if (!was) toggle(b, true);
    } else if (open && !e.target.closest?.(".ex-info-pop")) toggle(open, false);
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !open) return;
    const b = open;
    toggle(b, false);
    b.focus();
  });
  // Tab from an open note's button lands on its control, which the note may cover: the note closes.
  document.addEventListener("focusin", e => {
    if (open && e.target !== open && !document.getElementById(open.getAttribute("aria-controls")).contains(e.target)) toggle(open, false);
  });
  // A control can hide its row (a version switch) or move it (a new K); a resize on a phone fires while
  // scrolling. The note follows its button, and closes with it.
  const follow = () => requestAnimationFrame(() => {
    if (!open) return;
    if (open.offsetParent) place(open, document.getElementById(open.getAttribute("aria-controls")));
    else toggle(open, false);
  });
  for (const t of ["input", "change"]) document.addEventListener(t, follow);
  window.addEventListener("resize", follow);
}
