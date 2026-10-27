// Minimal SVG plotting: one line plot and one bar plot with axes, no dependencies.
// Colour order is Okabe-Ito; the CSS variables in css/explorer.css carry the same values.
export const SERIES = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#56B4E9", "#E69F00"];
const NS = "http://www.w3.org/2000/svg";

export function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

// Scales from a spec { W, H, margin: {l, r, t, b}, xlim, ylim }
export function scales({ W, H, margin: m, xlim, ylim }) {
  const sx = x => m.l + (x - xlim[0]) / (xlim[1] - xlim[0]) * (W - m.l - m.r);
  const sy = y => H - m.b - (y - ylim[0]) / (ylim[1] - ylim[0]) * (H - m.t - m.b);
  return { sx, sy };
}

function axes(svg, spec, { sx, sy }) {
  const { W, H, margin: m, xticks, yticks, xlab, ylab, xtickLabels, ytickLabels } = spec;
  yticks.forEach((v, i) => {
    el("line", { x1: sx(spec.xlim[0]), x2: sx(spec.xlim[1]), y1: sy(v), y2: sy(v), class: "grid" }, svg);
    el("text", { x: m.l - 8, y: sy(v) + 5, "text-anchor": "end", class: "tick" }, svg).textContent = ytickLabels ? ytickLabels[i] : String(v);
  });
  xticks.forEach((v, i) => {
    el("line", { x1: sx(v), x2: sx(v), y1: sy(spec.ylim[0]), y2: sy(spec.ylim[1]), class: "grid grid-x" }, svg);
    el("text", { x: sx(v), y: H - m.b + 22, "text-anchor": "middle", class: "tick" }, svg).textContent = xtickLabels ? xtickLabels[i] : String(v);
  });
  if (xlab) el("text", { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle", class: "axis-label" }, svg).textContent = xlab;
  if (ylab) el("text", { x: 16, y: (m.t + H - m.b) / 2, "text-anchor": "middle", class: "axis-label", transform: `rotate(-90 16 ${(m.t + H - m.b) / 2})` }, svg).textContent = ylab;
}

// The plot area plus a stroke's width, as a clipPath on the svg: an axis that eases to a new limit (axis.js) is
// still below the data for a few frames. clipped(svg) is the attribute that clips an element to it.
function clipArea(svg, { W, H, margin: m }) {
  if (!svg.id) return;
  const pad = 6;
  el("rect", { x: m.l - pad, y: m.t - pad, width: W - m.l - m.r + 2 * pad, height: H - m.t - m.b + 2 * pad },
    el("clipPath", { id: `${svg.id}-clip` }, el("defs", {}, svg)));
}
export const clipped = svg => (svg.id ? { "clip-path": `url(#${svg.id}-clip)` } : {});

export const pathFor = (xs, ys, sx, sy) => xs.map((x, i) => (i ? "L" : "M") + sx(x).toFixed(1) + "," + sy(ys[i]).toFixed(1)).join("");

// spec: { W, H, margin, xlim, ylim, xticks, yticks, xtickLabels?, ytickLabels?, xlab, ylab, series: [{ x, y, color, dashed, width, label }] }
// Returns the <path> elements so a page can update "d" on input without rebuilding the axes.
export function linePlot(svg, spec) {
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${spec.W} ${spec.H}`);
  const sc = scales(spec);
  axes(svg, spec, sc);
  clipArea(svg, spec);
  const paths = spec.series.map((s, i) => el("path", {
    d: pathFor(s.x, s.y, sc.sx, sc.sy), fill: "none",
    stroke: s.color ?? SERIES[i % SERIES.length], "stroke-width": s.width ?? 3,
    ...(s.dashed ? { "stroke-dasharray": "8 6", "stroke-opacity": 0.6 } : {}),
    ...clipped(svg),
    class: "series"
  }, svg));
  return { paths, ...sc };
}

// spec: { W, H, margin, ylim, yticks, categories: [label], groups: [{ values, color, label }], ylab }
export function barPlot(svg, spec) {
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${spec.W} ${spec.H}`);
  const n = spec.categories.length, g = spec.groups.length;
  const xlim = [0, n];
  const sc = scales({ ...spec, xlim });
  axes(svg, { ...spec, xlim, xticks: spec.categories.map((_, i) => i + 0.5), xtickLabels: spec.categories, xlab: spec.xlab }, sc);
  clipArea(svg, spec);
  const slot = (sc.sx(1) - sc.sx(0)) * 0.8 / g, pad = (sc.sx(1) - sc.sx(0)) * 0.1;
  const rects = spec.groups.map((grp, j) => grp.values.map((v, i) => el("rect", {
    x: sc.sx(i) + pad + j * slot, y: sc.sy(v), width: slot * 0.92, height: sc.sy(spec.ylim[0]) - sc.sy(v),
    fill: grp.color ?? SERIES[j % SERIES.length], class: "bar", ...clipped(svg)
  }, svg)));
  return { rects, ...sc };
}
