// Density over a circular response error, drawn on an unrolled axis in degrees (-180..180). The models
// work in radians; only the axis labels are in degrees. Shared by every continuous-reproduction page.
import { linePlot, el } from "./plot.js";
import { linspace } from "./math.js";

export const DEG = 180 / Math.PI;
export const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
// One point per degree; -180 and 180 are the same response, so the curve's two ends meet.
export const CIRC_X = linspace(-Math.PI, Math.PI, 361);

const signed = v => String(v).replace("-", "−");

// A round upper limit and 3 to 5 ticks for a density axis starting at 0.
export function niceAxis(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const n = Math.ceil(max / step - 1e-9);
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / mag === 2.5 ? 1 : 0));
  return { ylim: [0, n * step], yticks: Array.from({ length: n + 1 }, (_, i) => +(i * step).toFixed(digits)) };
}

// spec: { W, H, margin, series: [{ y, color, dashed, width }] on CIRC_X, window (half-width in radians,
// shaded around 0), marks: [{ at (radians), color, label }] under the axis, ylab, xlab }.
// Returns the paths and scales so a page can add to the plot.
export function circularPlot(svg, spec) {
  const ymax = Math.max(...spec.series.flatMap(s => s.y).filter(Number.isFinite));
  const xs = CIRC_X.map(x => x * DEG);
  const out = linePlot(svg, {
    W: spec.W, H: spec.H, margin: spec.margin, xlim: [-180, 180], ...niceAxis(ymax * 1.05),
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
  for (const m of spec.marks ?? []) {
    const x = sx(wrap(m.at) * DEG);
    el("path", { d: `M${x.toFixed(1)},${(y0 - 2).toFixed(1)}l-7,-12h14z`, fill: m.color, stroke: "#222", "stroke-width": 1 }, svg);
    if (m.label) el("text", { x, y: y0 - 18, "text-anchor": "middle", class: "circ-mark" }, svg).textContent = m.label;
  }
  return out;
}
