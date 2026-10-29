// The colour wheel of a continuous-reproduction task: the target's colour at the top (angle 0) and,
// optionally, draggable non-target colours. Shared by the pages that show where the non-targets sit.
import { el, clear } from "./plot.js";
import { DEG, wrap } from "./circular-plot.js";
import { sliderAria } from "./a11y.js";
import { colourText } from "./summaries.js";

export const TAU = 2 * Math.PI;
// Colour at angle mu (radians from the target) on the wheel; the density marks use the same colours.
export const hue = mu => `hsl(${((200 + mu * DEG) % 360 + 360) % 360}, 70%, 50%)`;
const G = { cx: 220, cy: 192, R: 110, label: 152, W: 440, H: 384 };
const onCircle = (r, a) => [G.cx + r * Math.sin(a), G.cy - r * Math.cos(a)];
const r2 = v => Math.round(v * 100) / 100;

// Draws into svg and calls onColour(i, mu) when the dot of item i (1 = first non-target) is dragged
// or moved with the arrow keys. Returns draw(mu, note), mu being [0, ...non-target colours]. Values
// are rounded to what the page prints so the bmm code reproduces the curves.
export function colourWheel(svg, onColour) {
  let focus = null;

  function draw(mu, note) {
    // A redraw started outside the wheel (a button, a slider) must not pull focus back to a dot:
    // browsers that do not focus a clicked button or range fire no focusin to clear the memory.
    const refocus = focus !== null && svg.contains(document.activeElement);
    clear(svg);
    svg.setAttribute("viewBox", `0 0 ${G.W} ${G.H}`);
    el("text", { x: G.cx, y: 18, "text-anchor": "middle", class: "task-note" }, svg).textContent = "colour wheel; target at 0";
    for (let k = 0; k < 90; k++) {
      const [x0, y0] = onCircle(G.R, TAU * (k - 0.5) / 90), [x1, y1] = onCircle(G.R, TAU * (k + 0.6) / 90);
      el("path", { d: `M${x0},${y0}A${G.R},${G.R} 0 0 1 ${x1},${y1}`, stroke: hue(TAU * k / 90), "stroke-width": 20, fill: "none" }, svg);
    }
    mu.forEach((m, i) => {
      const [x, y] = onCircle(G.R, m), [lx, ly] = onCircle(G.label, m);
      el("line", { x1: G.cx, y1: G.cy, x2: x, y2: y, stroke: i ? "#9aa3ad" : "#222", "stroke-width": i ? 2 : 3 }, svg);
      const dot = el("circle", { cx: x, cy: y, r: i ? 15 : 17, fill: hue(m), stroke: "#222", "stroke-width": i ? 2 : 4 }, svg);
      el("text", { x: lx, y: ly + 8, "text-anchor": "middle", class: "task-bin" }, svg).textContent = i + 1;
      if (i) {
        dot.dataset.item = i;
        dot.setAttribute("class", "ex-drag");
        dot.setAttribute("tabindex", 0);
        dot.setAttribute("role", "slider");
        dot.setAttribute("aria-label", `colour of item ${i + 1}`);
        // The value stays in radians because the arrow keys step from it; the spoken text gives degrees.
        for (const [k, v] of Object.entries(sliderAria(m, -Math.PI, Math.PI, colourText(m)))) dot.setAttribute(k, v);
      }
    });
    el("text", { x: G.cx, y: G.H - 6, "text-anchor": "middle", class: "task-note" }, svg).textContent = note;
    if (refocus) svg.querySelector(`[data-item="${focus}"]`)?.focus({ preventScroll: true });
  }

  const itemOf = e => (e.target.dataset?.item === undefined ? null : +e.target.dataset.item);
  // Stale outputs keep the old colours on screen; moving them would edit a wheel that is not drawn.
  const stale = () => svg.closest(".ex-stale") !== null;
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    drag = stale() ? null : itemOf(e);
    if (drag === null) return;
    // Cancelling pointerdown also cancels the mousedown that would focus the dot, so focus it here
    // and remember it: the redraws during the drag then keep the arrow keys on the moved dot.
    focus = drag;
    e.target.focus({ preventScroll: true });
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
  });
  // The svg box is letterboxed by its max-height, so the pointer goes through the svg's own
  // transform rather than a width ratio. A hover without a button is never a drag, whichever event
  // ended the last one.
  svg.addEventListener("pointermove", e => {
    if (drag === null || e.buttons === 0) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    onColour(drag, r2(wrap(Math.atan2(p.x - G.cx, G.cy - p.y))));
  });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(t, () => { drag = null; });
  const KEYS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  svg.addEventListener("keydown", e => {
    const i = itemOf(e);
    if (i === null || !KEYS[e.key]) return;
    // A stale wheel still swallows the arrow keys, so the page does not scroll under a focused dot.
    e.preventDefault();
    if (stale()) return;
    focus = i;
    onColour(i, r2(wrap(+e.target.getAttribute("aria-valuenow") + 0.05 * KEYS[e.key])));
  });
  for (const t of ["pointerdown", "focusin"]) document.addEventListener(t, e => { if (!svg.contains(e.target)) focus = null; }, true);
  return draw;
}
