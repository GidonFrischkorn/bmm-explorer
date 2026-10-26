// Drawings shared by the response-time pages: the evidence path between the boundaries (the task panel),
// a time axis, and the two responses' densities mirrored about zero, upper above and lower below.
import { el, clear, linePlot, scales, pathFor } from "./plot.js";
import { niceAxis } from "./circular-plot.js";
import { linspace } from "./math.js";

export const BLUE = "#0072B2", ORANGE = "#D55E00", GREY = "#595959";

// Standard normal increments from a fixed seed (mulberry32, Box-Muller): the paths keep their noise
// while a slider moves, so a change in drift tilts the same path instead of drawing a new one.
const STEPS = 400, PATHS = 5;
const NOISE = (() => {
  let a = 437;
  const unif = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 2 * PATHS }, () => Array.from({ length: STEPS }, () =>
    Math.sqrt(-2 * Math.log(1 - unif())) * Math.cos(2 * Math.PI * unif())));
})();

// One Euler path of dX = drift dt + s dW from start until it leaves (lo, hi) or the time runs out.
function walk(noise, { start, drift, s = 1, lo, hi, dt }) {
  const x = [start];
  for (let i = 0; i < STEPS; i++) {
    const next = x[i] + drift * dt + s * Math.sqrt(dt) * noise[i];
    if (next >= hi) return { x: [...x, hi], hit: "upper" };
    if (next <= lo) return { x: [...x, lo], hit: "lower" };
    x.push(next);
  }
  return { x, hit: null };
}

// A round time axis from 0 to at least tmax seconds.
export function timeAxis(tmax) {
  const { ylim, yticks } = niceAxis(tmax);
  return { xlim: ylim, xticks: yticks };
}

// spec: { mode: "ddm" | "simple" | "crisk", drift, bound, zr, ndt, xlim, xticks }.
// "ddm": one process between two boundaries, five sample paths. "simple": one accumulator to the correct
// boundary; an error is no boundary of its own. "crisk": two accumulators from the same start, one to each
// boundary; the first to arrive gives the response and stops the other.
export function drawDiffusion(svg, spec) {
  const { mode, drift, bound, zr, ndt, xlim, xticks } = spec;
  clear(svg);
  const W = 1000, H = 250, m = { l: 130, r: 20, t: 12, b: 34 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const top = bound, start = mode === "simple" ? 0 : zr * bound;
  // The evidence axis spans the boundaries: what the drawing compares is the noise against the gap.
  const ylim = mode === "simple" ? [-0.2 * top, 1.05 * top] : [-0.05 * top, 1.05 * top];
  const { sx, sy } = scales({ W, H, margin: m, xlim, ylim });
  const dt = (xlim[1] - ndt) / STEPS;

  xticks.forEach(v => {
    el("line", { x1: sx(v), x2: sx(v), y1: sy(ylim[0]), y2: H - m.b + 6, class: "grid grid-x" }, svg);
    el("text", { x: sx(v), y: H - m.b + 24, "text-anchor": "middle", class: "tick" }, svg).textContent = String(v);
  });
  el("text", { x: m.l - 10, y: H - m.b + 24, "text-anchor": "end", class: "tick" }, svg).textContent = "time (s)";
  el("rect", { x: sx(0), y: sy(ylim[1]), width: Math.max(0, sx(Math.min(ndt, xlim[1])) - sx(0)), height: sy(ylim[0]) - sy(ylim[1]), class: "rt-ndt" }, svg);
  if (ndt < xlim[1]) el("text", { x: sx(Math.min(ndt, xlim[1])) - 6, y: sy(ylim[0]) - 8, "text-anchor": "end", class: "task-note" }, svg).textContent = "ndt";

  const boundary = (y, color, label) => {
    el("line", { x1: sx(ndt), x2: sx(xlim[1]), y1: sy(y), y2: sy(y), stroke: color, "stroke-width": 4 }, svg);
    el("text", { x: m.l - 10, y: sy(y) + 6, "text-anchor": "end", class: "task-note", fill: color }, svg).textContent = label;
  };
  boundary(top, BLUE, "upper (1)");
  // simple has no error boundary: an error stops the accumulator before it arrives.
  if (mode === "simple") el("text", { x: sx(xlim[1]) - 40, y: sy(ylim[0]) - 6, "text-anchor": "end", class: "task-note" }, svg)
    .textContent = "no boundary for errors: an error stops the accumulator (censored)";
  else boundary(0, ORANGE, "lower (0)");

  // Paths are cut, not clamped, at the edge of the region they are drawn in: a clamped path would run
  // along the edge and read as a boundary.
  const defs = el("defs", {}, svg);
  const region = (name, y0, y1) => {
    const cp = el("clipPath", { id: `${svg.id}-${name}` }, defs);
    el("rect", { x: sx(ndt), y: sy(y1), width: sx(xlim[1]) - sx(ndt), height: sy(y0) - sy(y1) }, cp);
    return `url(#${svg.id}-${name})`;
  };
  const t = i => ndt + i * dt;
  const line = (xs, color, width, opacity, clip) => el("path", {
    d: pathFor(xs.map((_, i) => t(i)), xs, sx, sy), fill: "none", stroke: color, "stroke-width": width, "stroke-opacity": opacity,
    "clip-path": clip
  }, svg);
  const colorOf = hit => (hit === "upper" ? BLUE : hit === "lower" ? ORANGE : GREY);
  if (mode === "crisk") {
    // Each accumulator walks its own distance from the start, drift toward the upper boundary and -drift
    // toward the lower one, and is drawn in its own lane: the upper one from the start up, the lower one
    // from the start down. Where it wanders away from its boundary it leaves the lane.
    const upLane = region("up", start, top), downLane = region("down", 0, start);
    for (let k = PATHS - 1; k >= 0; k--) {
      const up = walk(NOISE[2 * k], { start: 0, drift, lo: -Infinity, hi: bound - start, dt });
      const down = walk(NOISE[2 * k + 1], { start: 0, drift: -drift, lo: -Infinity, hi: start, dt });
      const nUp = up.hit ? up.x.length : Infinity, nDown = down.hit ? down.x.length : Infinity;
      const end = Math.min(nUp, nDown, STEPS + 1), w = k ? 1.5 : 3.5, o = k ? 0.3 : 1;
      line(up.x.slice(0, end).map(d => start + d), BLUE, w, nUp <= nDown ? o : o * 0.45, upLane);
      line(down.x.slice(0, end).map(d => start - d), ORANGE, w, nDown < nUp ? o : o * 0.45, downLane);
    }
  } else {
    const all = region("all", ylim[0], ylim[1]);
    for (let k = PATHS - 1; k >= 0; k--) {
      const p = walk(NOISE[k], { start, drift, lo: mode === "simple" ? -Infinity : 0, hi: top, dt });
      line(p.x, colorOf(p.hit), k ? 1.5 : 3.5, k ? 0.3 : 1, all);
    }
  }
  // The mean path: start + drift * time, until it meets a boundary.
  const tEnd = Math.min(xlim[1], ndt + (drift > 0 ? (top - start) / drift : drift < 0 ? (start - (mode === "simple" ? ylim[0] : 0)) / -drift : Infinity));
  el("line", { x1: sx(ndt), y1: sy(start), x2: sx(tEnd), y2: sy(start + drift * (tEnd - ndt)), stroke: "#222", "stroke-width": 2.5,
    "stroke-dasharray": "10 6" }, svg);
  el("circle", { cx: sx(ndt), cy: sy(start), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, svg);
  // The boundary separation, as a bracket at the right end.
  const bx = sx(xlim[1]) - 4, y0 = mode === "simple" ? start : 0;
  el("path", { d: `M${bx - 10},${sy(top)}H${bx}V${sy(y0)}H${bx - 10}`, fill: "none", stroke: "#222", "stroke-width": 2 }, svg);
  el("text", { x: bx - 16, y: (sy(top) + sy(y0)) / 2 + 7, "text-anchor": "end", class: "task-note rt-halo" }, svg).textContent = `bound ${spec.boundLabel ?? bound}`;
  el("text", { x: m.l - 10, y: sy(start) + 6, "text-anchor": "end", class: "task-note" }, svg).textContent = "start";
}

// Densities of the two responses over rt (seconds), upper above zero and lower mirrored below.
// spec: { W, H, margin, xlim, xticks, x, upper: [{ y, color, dashed, width }], lower: [...] }, y on the
// natural scale. The y axis is symmetric and labelled with absolute values.
export function mirroredDensity(svg, spec) {
  const ymax = Math.max(1e-9, ...[...spec.upper, ...spec.lower].flatMap(s => s.y.filter(Number.isFinite)));
  const { ylim, yticks } = niceAxis(ymax * 1.05);
  const ticks = [...yticks.slice(1).reverse().map(v => -v), ...yticks];
  const fin = v => (Number.isFinite(v) ? v : 0);
  const out = linePlot(svg, {
    W: spec.W, H: spec.H, margin: spec.margin, xlim: spec.xlim, ylim: [-ylim[1], ylim[1]], xticks: spec.xticks,
    yticks: ticks, ytickLabels: ticks.map(v => String(Math.abs(v))), xlab: "rt (s)", ylab: spec.ylab ?? "density",
    series: [...spec.upper.map(s => ({ ...s, x: spec.x, y: s.y.map(fin) })),
             ...spec.lower.map(s => ({ ...s, x: spec.x, y: s.y.map(v => -fin(v)) }))]
  });
  el("line", { x1: out.sx(spec.xlim[0]), x2: out.sx(spec.xlim[1]), y1: out.sy(0), y2: out.sy(0), stroke: "#222", "stroke-width": 1.5 }, svg);
  el("text", { x: out.sx(spec.xlim[1]) - 6, y: out.sy(ylim[1]) + 20, "text-anchor": "end", class: "task-note", fill: BLUE }, svg)
    .textContent = spec.upperLabel ?? "upper (1)";
  el("text", { x: out.sx(spec.xlim[1]) - 6, y: out.sy(-ylim[1]) - 8, "text-anchor": "end", class: "task-note", fill: ORANGE }, svg)
    .textContent = spec.lowerLabel ?? "lower (0)";
  return out;
}

export const rtGrid = (xlim, n = 200) => linspace(xlim[0], xlim[1], n + 1).slice(1);
