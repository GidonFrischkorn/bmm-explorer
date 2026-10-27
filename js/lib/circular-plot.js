// Density over a circular response error, drawn on an unrolled axis in degrees (-180..180). The models
// work in radians; only the axis labels are in degrees. Shared by every continuous-reproduction page.
import { linePlot, el, clipped } from "./plot.js";
import { linspace } from "./math.js";
import { niceAxis } from "./axis.js";

export const DEG = 180 / Math.PI;
export const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
// One point per degree; -180 and 180 are the same response, so the curve's two ends meet.
export const CIRC_X = linspace(-Math.PI, Math.PI, 361);

const signed = v => String(v).replace("-", "−");

// spec: { W, H, margin, series: [{ y, color, dashed, width }] on CIRC_X, window (half-width in radians,
// shaded around 0), areas: [{ lo, hi, color, opacity }] stacked components on CIRC_X, marks: [{ at
// (radians), color, label }] under the axis, ylab, xlab, axis (an autoAxis that holds the y limit) }.
// Returns the paths and scales so a page can add to the plot.
export function circularPlot(svg, spec) {
  const ymax = Math.max(...spec.series.flatMap(s => s.y).filter(Number.isFinite));
  const xs = CIRC_X.map(x => x * DEG);
  const out = linePlot(svg, {
    W: spec.W, H: spec.H, margin: spec.margin, xlim: [-180, 180], ...(spec.axis ? spec.axis.next(ymax) : niceAxis(ymax * 1.05)),
    xticks: [-180, -90, 0, 90, 180], xtickLabels: [-180, -90, 0, 90, 180].map(v => signed(v) + "°"),
    xlab: spec.xlab ?? "Response error", ylab: spec.ylab ?? "Density",
    series: spec.series.map(s => ({ ...s, x: xs }))
  });
  const { sx, sy, paths } = out;
  const y0 = sy(0);
  if (spec.window) {
    const w = spec.window * DEG;
    svg.insertBefore(el("rect", { x: sx(-w), width: sx(w) - sx(-w), y: spec.margin.t, height: y0 - spec.margin.t,
      class: "circ-window" }), paths[0]);
  }
  // Stacked components: each area fills between lo and hi (values on CIRC_X), under the curves.
  for (const a of spec.areas ?? []) {
    const up = CIRC_X.map((_, i) => `${i ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(a.hi[i]).toFixed(1)}`).join("");
    const down = CIRC_X.map((_, i) => `L${sx(xs[CIRC_X.length - 1 - i]).toFixed(1)},${sy(a.lo[CIRC_X.length - 1 - i]).toFixed(1)}`).join("");
    svg.insertBefore(el("path", { d: `${up}${down}Z`, fill: a.color, "fill-opacity": a.opacity ?? 0.35, stroke: "none",
      ...clipped(svg) }), paths[0]);
  }
  for (const m of spec.marks ?? []) {
    const x = sx(wrap(m.at) * DEG);
    el("path", { d: `M${x.toFixed(1)},${(y0 - 2).toFixed(1)}l-7,-12h14z`, fill: m.color, stroke: "#222", "stroke-width": 1 }, svg);
    if (m.label) el("text", { x, y: y0 - 18, "text-anchor": "middle", class: "circ-mark" }, svg).textContent = m.label;
  }
  return out;
}
