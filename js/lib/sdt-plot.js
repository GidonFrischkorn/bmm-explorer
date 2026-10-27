// Drawings shared by the signal detection pages (models/sdt_*.qmd): evidence densities on one axis with the
// decision boundaries, which can be dragged, and the ROC.
import { linePlot, el } from "./plot.js";
import { linspace } from "./math.js";

// The two kinds of trial, and one colour per evidence distribution where a panel compares them.
export const NOISE = "#0072B2", SIGNAL = "#D55E00";
export const DIST_COLOR = { normal: "#0072B2", logistic: "#CC79A7", gumbel_min: "#009E73", gumbel_max: "#E69F00" };
export const DIST_NAMES = ["normal", "logistic", "gumbel_min", "gumbel_max"];

// spec: { W, H, xlim, xticks, xlab, ymax, curves: [{ f, color, dashed, width, shade: [from, to] }],
//         lines: [{ x, label, color, drag, aria }], notes: [{ x, y, text, color, anchor }] }
// A curve's shade fills the area under it between from and to. A line with drag is a focusable slider
// (data-line holds its index); a line that had the focus before the redraw gets it back. notes are placed in
// data units on x and on y either in pixels from the top (y) or just above a density value (density). Returns
// the scales and xAt(pointer event), the evidence value under the pointer.
export function latentPlot(svg, spec) {
  const had = svg.contains(document.activeElement) ? document.activeElement.dataset.line : undefined;
  const { W = 1000, H = 250, xlim } = spec, margin = { l: 16, r: 16, t: 34, b: 50 };
  const xs = linspace(xlim[0], xlim[1], 401), ys = spec.curves.map(c => xs.map(c.f));
  const ymax = spec.ymax ?? 1.1 * Math.max(...ys.flat().filter(Number.isFinite));
  const { paths, sx, sy } = linePlot(svg, {
    W, H, margin, xlim, ylim: [0, ymax], xticks: spec.xticks, yticks: [], xlab: spec.xlab,
    series: spec.curves.map((c, i) => ({ x: xs, y: ys[i], color: c.color, dashed: c.dashed, width: c.width ?? 3 }))
  });
  el("line", { x1: sx(xlim[0]), x2: sx(xlim[1]), y1: sy(0), y2: sy(0), stroke: "#888", "stroke-width": 1.5 }, svg);
  spec.curves.forEach((c, i) => {
    if (!c.shade) return;
    const keep = xs.map((x, j) => [x, ys[i][j]]).filter(([x]) => x >= c.shade[0] && x <= c.shade[1]);
    if (keep.length < 2) return;
    const d = `M${sx(keep[0][0]).toFixed(1)},${sy(0)}` + keep.map(([x, y]) => `L${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("") +
      `L${sx(keep[keep.length - 1][0]).toFixed(1)},${sy(0)}Z`;
    svg.insertBefore(el("path", { d, fill: c.color, "fill-opacity": 0.18, stroke: "none" }), paths[0]);
  });
  for (const n of spec.notes ?? []) {
    const y = n.density === undefined ? n.y : Math.max(margin.t + 14, sy(n.density) - 10);
    el("text", { x: sx(n.x), y, "text-anchor": n.anchor ?? "middle", class: "sdt-note", fill: n.color ?? "#222" }, svg)
      .textContent = n.text;
  }
  (spec.lines ?? []).forEach((ln, i) => {
    const x = sx(Math.min(xlim[1], Math.max(xlim[0], ln.x)));
    el("line", { x1: x, x2: x, y1: sy(0), y2: margin.t - 6, stroke: ln.color ?? "#222", "stroke-width": ln.width ?? 3,
      ...(ln.dash ? { "stroke-dasharray": ln.dash } : {}) }, svg);
    if (ln.label) el("text", { x, y: margin.t - 12, "text-anchor": "middle", class: "sdt-line-label" }, svg).textContent = ln.label;
    if (!ln.drag) return;
    // A wide transparent band around the line takes the pointer and the focus.
    const band = el("rect", { x: x - 14, y: margin.t - 30, width: 28, height: sy(0) - margin.t + 30, fill: "transparent",
      class: "sdt-drag", tabindex: 0, role: "slider", "aria-label": ln.aria ?? ln.label, "aria-valuenow": ln.x }, svg);
    band.dataset.line = i;
    if (String(i) === had) band.focus();
  });
  return {
    sx, sy,
    // The svg is letterboxed by its max-height, so the pointer goes through the svg's own transform.
    xAt: e => {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return xlim[0] + (p.x - margin.l) / (W - margin.l - margin.r) * (xlim[1] - xlim[0]);
    }
  };
}

// Pointer and arrow-key moves of a latentPlot's draggable lines. The handlers sit on the svg, so they survive
// its redraws. move(i, x) gets the line's index and the evidence value under the pointer, step(i, sign) the
// direction of an arrow key; plot() returns the latest latentPlot result; active() is false while the
// drawing is stale.
export function dragLines(svg, { plot, move, step, active = () => true }) {
  let drag = null;
  const lineOf = e => (e.target.dataset?.line === undefined ? null : +e.target.dataset.line);
  svg.addEventListener("pointerdown", e => {
    const i = lineOf(e);
    if (i === null || !active()) return;
    drag = i;
    e.target.focus();
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => { if (drag !== null && e.buttons !== 0) move(drag, plot().xAt(e)); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(t, () => { drag = null; });
  svg.addEventListener("keydown", e => {
    const i = lineOf(e), sign = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (i === null || !sign || !active()) return;
    e.preventDefault();
    step(i, sign);
  });
}

// A point's label, below right of the point at (x, y): left of it where it would pass right, above it where it
// would reach bottom (the plot's right edge and x axis, in svg units), so it stays clear of the tick labels.
export function pointLabel(svg, x, y, text, { right, bottom }) {
  const t = el("text", { x: x + 10, y: y + 20 > bottom - 4 ? y - 12 : y + 20, class: "sdt-note" }, svg);
  t.textContent = text;
  if (x + 10 + t.getComputedTextLength() > right) {
    t.setAttribute("x", x - 10);
    t.setAttribute("text-anchor", "end");
  }
  return t;
}

// spec: { W, H, curves: [{ pts: [[fa, hit]], color, dashed, dotted, width }], points: [{ fa, hit, label, color }] }
// The chance diagonal is drawn first. Returns the scales.
export function rocPlot(svg, spec) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const { paths, sx, sy } = linePlot(svg, {
    W: spec.W ?? 420, H: spec.H ?? 300, margin: { l: 64, r: 14, t: 12, b: 50 }, xlim: [0, 1], ylim: [0, 1],
    xticks: ticks, yticks: ticks, xlab: "False-alarm rate", ylab: "Hit rate",
    series: [{ x: [0, 1], y: [0, 1], color: "#9aa3ad", width: 1.5 },
      ...spec.curves.map(c => ({ x: c.pts.map(p => p[0]), y: c.pts.map(p => p[1]), color: c.color, dashed: c.dashed, width: c.width ?? 3 }))]
  });
  spec.curves.forEach((c, i) => { if (c.dotted) paths[i + 1].setAttribute("stroke-dasharray", "2 5"); });
  for (const p of spec.points ?? []) {
    el("circle", { cx: sx(p.fa), cy: sy(p.hit), r: p.r ?? 7, fill: p.fill ?? "#fff", stroke: p.color ?? "#222", "stroke-width": 2.5 }, svg);
    if (p.label) pointLabel(svg, sx(p.fa), sy(p.hit), p.label, { right: sx(1), bottom: sy(0) });
  }
  return { sx, sy };
}
