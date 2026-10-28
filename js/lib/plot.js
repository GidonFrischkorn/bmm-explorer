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

// The opacity for a dashed reference curve: as faint as 0.6 where the colour keeps 3:1 against white (WCAG 1.4.11 for
// graphics), else the lowest opacity that does, up to 1 (Okabe-Ito purple is 3.06:1 at full strength).
const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = hex => [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export function dashOpacity(hex, floor = 3.05) {
  for (let a = 0.6; a < 1; a += 0.02) {
    const mixed = [1, 3, 5].map(i => 255 + a * (parseInt(hex.slice(i, i + 2), 16) - 255)).map(v => lin(v / 255)).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0);
    if (1.05 / (mixed + 0.05) >= floor) return +a.toFixed(2);
  }
  return 1;
}

export function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

// A small shape, the second channel for a coloured series or category (the legends use GLYPH for the same shapes in
// text). The shape is filled with attrs.fill; a plus has no area and takes attrs.stroke.
export const GLYPH = { circle: "●", square: "■", triangle: "▲", diamond: "◆", plus: "✚" };
export function marker(parent, shape, x, y, r, attrs = {}) {
  const f = n => +n.toFixed(2);
  switch (shape) {
    case "square": return el("rect", { x: f(x - r), y: f(y - r), width: f(2 * r), height: f(2 * r), ...attrs }, parent);
    case "triangle": return el("polygon", { points: `${f(x)},${f(y - 1.2 * r)} ${f(x + 1.1 * r)},${f(y + 0.85 * r)} ${f(x - 1.1 * r)},${f(y + 0.85 * r)}`, ...attrs }, parent);
    case "diamond": return el("polygon", { points: `${f(x)},${f(y - 1.3 * r)} ${f(x + 1.3 * r)},${f(y)} ${f(x)},${f(y + 1.3 * r)} ${f(x - 1.3 * r)},${f(y)}`, ...attrs }, parent);
    case "plus": return el("path", { d: `M${f(x - 1.2 * r)},${f(y)}H${f(x + 1.2 * r)}M${f(x)},${f(y - 1.2 * r)}V${f(y + 1.2 * r)}`, "stroke-width": 3, fill: "none", ...attrs }, parent);
    default: return el("circle", { cx: f(x), cy: f(y), r, ...attrs }, parent);
  }
}

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

// spec: { W, H, margin, xlim, ylim, xticks, yticks, xtickLabels?, ytickLabels?, xlab, ylab, series: [{ x, y, color, dashed, width, label, marker }] }
// A series with marker (a shape name for marker()) has that shape at each of its points, in the series' colour.
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
    ...(s.dashed ? { "stroke-dasharray": "8 6", "stroke-opacity": dashOpacity(s.color ?? SERIES[i % SERIES.length]) } : {}),
    ...clipped(svg),
    class: "series"
  }, svg));
  spec.series.forEach((s, i) => {
    if (s.marker) s.x.forEach((x, k) => marker(svg, s.marker, sc.sx(x), sc.sy(s.y[k]), 4.5,
      { fill: s.color ?? SERIES[i % SERIES.length], stroke: s.color ?? SERIES[i % SERIES.length], class: "series-mark", ...clipped(svg) }));
  });
  return { paths, ...sc };
}

// spec: { W, H, margin, ylim, yticks, categories: [label], groups: [{ values, color, label, hatch }], ylab }
// A group with hatch is filled with diagonal stripes of its colour, so two groups differ by more than colour.
export function barPlot(svg, spec) {
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${spec.W} ${spec.H}`);
  const n = spec.categories.length, g = spec.groups.length;
  const xlim = [0, n];
  const sc = scales({ ...spec, xlim });
  axes(svg, { ...spec, xlim, xticks: spec.categories.map((_, i) => i + 0.5), xtickLabels: spec.categories, xlab: spec.xlab }, sc);
  clipArea(svg, spec);
  const slot = (sc.sx(1) - sc.sx(0)) * 0.8 / g, pad = (sc.sx(1) - sc.sx(0)) * 0.1;
  const rects = spec.groups.map((grp, j) => {
    const color = grp.color ?? SERIES[j % SERIES.length];
    let fill = color;
    if (grp.hatch && svg.id) {
      fill = `url(#${svg.id}-hatch-${j})`;
      const pat = el("pattern", { id: `${svg.id}-hatch-${j}`, width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, el("defs", {}, svg));
      el("rect", { width: 8, height: 8, fill: color }, pat);
      el("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "#fff", "stroke-width": 3.5 }, pat);
    }
    return grp.values.map((v, i) => el("rect", {
      x: sc.sx(i) + pad + j * slot, y: sc.sy(v), width: slot * 0.92, height: sc.sy(spec.ylim[0]) - sc.sy(v),
      fill, class: "bar", ...clipped(svg)
    }, svg));
  });
  return { rects, ...sc };
}
