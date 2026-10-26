// The colour wheel of a continuous-reproduction task: the target's colour at the top (angle 0) and,
// optionally, draggable non-target colours. Shared by the pages that show where the non-targets sit.
import { el, clear } from "./plot.js";
import { DEG, wrap } from "./circular-plot.js";

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
        dot.setAttribute("aria-label", `colour of item ${i + 1}, radians from the target`);
        dot.setAttribute("aria-valuenow", m);
      }
    });
    el("text", { x: G.cx, y: G.H - 6, "text-anchor": "middle", class: "task-note" }, svg).textContent = note;
    if (focus !== null) svg.querySelector(`[data-item="${focus}"]`)?.focus();
  }

  const itemOf = e => (e.target.dataset?.item === undefined ? null : +e.target.dataset.item);
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    drag = itemOf(e);
    if (drag === null) return;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener("pointermove", e => {
    if (drag === null) return;
    const b = svg.getBoundingClientRect(), k = G.W / b.width;
    onColour(drag, r2(wrap(Math.atan2(((e.clientX - b.left) * k - G.cx) / G.R, -((e.clientY - b.top) * k - G.cy) / G.R))));
  });
  svg.addEventListener("pointerup", () => { drag = null; });
  const KEYS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  svg.addEventListener("keydown", e => {
    const i = itemOf(e);
    if (i === null || !KEYS[e.key]) return;
    e.preventDefault();
    focus = i;
    onColour(i, r2(wrap(+e.target.getAttribute("aria-valuenow") + 0.05 * KEYS[e.key])));
  });
  document.addEventListener("focusin", e => { if (!svg.contains(e.target)) focus = null; });
  return draw;
}
