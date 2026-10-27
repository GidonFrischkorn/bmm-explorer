// Page script for models/imm.qmd: the interference measurement model, imm(version = "full").
import { dimm, immWeights } from "../models/circular.js";
import { integrateExp } from "../lib/math.js";
import { bindPair, readParams, setParams, fmt, LOG } from "../lib/widget.js";
import { linePlot, el, clear } from "../lib/plot.js";
import { circularPlot, CIRC_X, DEG, wrap } from "../lib/circular-plot.js";
import { autoAxis } from "../lib/axis.js";
import { initInfo } from "../lib/info.js";

// bmm's default priors for imm(version = "full"), [mean, sd] on the log link. The sliders span
// mean +- 3 SD; the prior means are the starting values. b has no prior: bmm() fixes it at 1.
const PRIOR = { c: [0, 1], a: [0, 1], s: [0, 1], kappa: [2, 1] };
const B = { min: 0, max: 5, step: 0.05, start: 1 };
const MAX_N = 8, START_N = 4;
const WINDOW = 20 / DEG;
const COLOR = { target: "#0072B2", nt: "#D55E00", guess: "#595959", within: "#009E73" };
const TAU = 2 * Math.PI;
// Square layout: item centres stay within +-EDGE circle radii of the display centre, so a disc never
// crosses the frame; Scatter keeps centres at least MIN_GAP apart, as visual-array displays do.
const EDGE = 1.1, MIN_GAP = 0.55;

const $ = id => document.getElementById(id);
const r2 = v => Math.round(v * 100) / 100;
const clampEdge = v => Math.max(-EDGE, Math.min(EDGE, v));
const pairs = {
  ...Object.fromEntries(Object.keys(PRIOR).map(k => [k, bindPair(`imm-${k}`, `imm-${k}-num`, draw, LOG)])),
  b: bindPair("imm-b", "imm-b-num", draw),
  set_size: bindPair("imm-set-size", "imm-set-size-num", onSetSize),
  spacing: bindPair("imm-spacing", "imm-spacing-num", () => { angles = null; draw(); })
};
const PAR = ["c", "a", "b", "s", "kappa"];
const start = { ...Object.fromEntries(Object.entries(PRIOR).map(([k, [m]]) => [k, LOG.fromRange(m)])), b: B.start };

// The task. On the circle, positions are angles from the target, which sits at the top; angles holds
// the non-targets' angles after a drag (null: multiples of the spacing). In the square, points holds
// every item's [x, y] in circle radii from the display centre, the target first. colours holds the
// non-targets' colours after a drag (null: evenly spread). All values are rounded to what the page
// prints, so the bmm code reproduces the curves.
let mode = "circle", angles = null, points = null, colours = null, lastN = START_N, drag = null, focus = null;
const evenAngles = n => Array.from({ length: n - 1 }, (_, i) => TAU * (i + 1) / n);
const maxSpacing = n => r2(TAU / n);
const onUnit = a => [r2(Math.sin(a)), r2(-Math.cos(a))];

// Circle distances are radians along the circle (0 to pi); square distances are straight lines in
// circle radii, so two close neighbours on the circle are about equally far apart in both layouts.
function layout(n, spacing, cols = colours, how = mode) {
  let xy, dist;
  if (how === "square") {
    xy = points;
    dist = xy.map(([x, y]) => r2(Math.hypot(x - xy[0][0], y - xy[0][1])));
  } else {
    const pos = (how === "preset" ? null : angles) ?? (spacing === maxSpacing(n) ? evenAngles(n) : Array.from({ length: n - 1 }, (_, i) => (i + 1) * spacing));
    xy = [0, ...pos].map(a => [Math.sin(a), -Math.cos(a)]);
    dist = [0, ...pos.map(p => r2(Math.abs(wrap(p))))];
  }
  return { n, xy, dist, mu: [0, ...(cols ?? evenAngles(n).map(a => r2(wrap(a))))] };
}
// The across-set-size panel always uses the circle preset, whatever was dragged.
const preset = n => layout(n, maxSpacing(n), null, "preset");

const pWithin = (lay, p) => integrateExp(x => dimm(x, { mu: lay.mu, dist: lay.dist, ...p }), -WINDOW, WINDOW);
const weights = (lay, p) => immWeights({ dist: lay.dist, ...p });

const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

// What keeps the current values from being drawn, as [fields, hint element id, message].
function problems(p) {
  const out = [];
  if (!Number.isInteger(p.set_size) || !inRange(p.set_size, 1, MAX_N)) out.push([["set_size"], "imm-task-hint", `Set size must be a whole number from 1 to ${MAX_N}.`]);
  else if (mode === "circle" && !angles && p.set_size > 1 && !inRange(p.spacing, 0, maxSpacing(p.set_size)))
    out.push([["spacing"], "imm-task-hint", `Spacing must be from 0 to ${fmt(maxSpacing(p.set_size))} rad at set size ${p.set_size}.`]);
  const bad = PAR.filter(k => !inRange(p[k], 0, Infinity));
  if (bad.length) out.push([bad, "imm-par-hint", "c, a, b, s and kappa must be numbers ≥ 0."]);
  else if (p.c + p.a + p.b <= 0) out.push([["c", "a", "b"], "imm-par-hint", "c, a and b cannot all be 0: nothing would be recalled or guessed."]);
  return out;
}

// A random point in the square at least MIN_GAP from the given ones (the best of 200 tries).
function freePoint(taken) {
  let best = null, bestGap = -1;
  for (let t = 0; t < 200 && bestGap < MIN_GAP; t++) {
    const q = [r2((Math.random() * 2 - 1) * EDGE), r2((Math.random() * 2 - 1) * EDGE)];
    const gap = Math.min(Infinity, ...taken.map(([x, y]) => Math.hypot(q[0] - x, q[1] - y)));
    if (gap > bestGap) [best, bestGap] = [q, gap];
  }
  return best;
}
const scatter = n => { const out = []; while (out.length < n) out.push(freePoint(out)); return out; };

// A new set size spreads the colours evenly again. On the circle it returns to multiples of the
// spacing and keeps the equidistant preset if it was on; in the square it adds or removes items and
// leaves the others where they are. An empty or out-of-range set size leaves everything alone.
function onSetSize() {
  const n = pairs.set_size.value;
  if (Number.isInteger(n) && inRange(n, 1, MAX_N) && n !== lastN) {
    const wasEqui = pairs.spacing.value === maxSpacing(lastN);
    colours = null;
    angles = null;
    pairs.spacing.setBounds({ max: maxSpacing(n) });
    if (wasEqui || pairs.spacing.value > maxSpacing(n)) pairs.spacing.value = maxSpacing(n);
    if (points) {
      points = points.slice(0, n);
      while (points.length < n) points = [...points, freePoint(points)];
    }
    lastN = n;
  }
  draw();
}

// Switching layout keeps the items where they are: the square starts from their places on the
// circle, and the circle takes each item's direction from the centre, relative to the target's.
function setMode(m) {
  if (m === mode) return;
  const lay = layout(lastN, pairs.spacing.value);
  if (m === "square") points = lay.xy.map(([x, y]) => [r2(x), r2(y)]);
  else {
    const dir = ([x, y]) => Math.atan2(x, -y);
    angles = lastN > 1 ? lay.xy.slice(1).map(q => r2(wrap(dir(q) - dir(lay.xy[0])))) : null;
  }
  mode = m;
  for (const r of document.querySelectorAll('input[name="imm-layout"]')) r.checked = r.value === m;
}

const hue = mu => `hsl(${((200 + mu * DEG) % 360 + 360) % 360}, 70%, 50%)`;
// Both drawings share one geometry; angle 0 is at the top and angles grow clockwise.
const G = { cx: 220, cy: 192, R: 110, label: 152, W: 440, H: 384 };
const onCircle = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

// Marks an svg element as a draggable, focusable item for the pointer and keyboard handlers. The
// slider role needs a numeric value and limits; a square position is a pair, so it goes in valuetext.
function draggable(node, i, label, value, [min, max], text) {
  node.dataset.item = i;
  node.setAttribute("class", "imm-drag");
  node.setAttribute("tabindex", 0);
  node.setAttribute("role", "slider");
  node.setAttribute("aria-label", label);
  node.setAttribute("aria-valuemin", min);
  node.setAttribute("aria-valuemax", max);
  node.setAttribute("aria-valuenow", value);
  if (text !== undefined) node.setAttribute("aria-valuetext", text);
}
// Limits of the draggable values: a distance along the circle, a colour, a straight line in the square.
const RANGE = { dist: [0, r2(Math.PI)], mu: [r2(-Math.PI), r2(Math.PI)], square: [0, r2(2 * EDGE * Math.SQRT2)] };

function drawDisplay(lay) {
  const svg = $("imm-display");
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${G.W} ${G.H}`);
  const { cx, cy, R } = G, px = ([x, y]) => [cx + R * x, cy + R * y];
  el("text", { x: cx, y: 18, "text-anchor": "middle", class: "task-note" }, svg).textContent = "display; the frame is the cue";
  if (mode === "square") {
    const h = (EDGE + 0.25) * R;
    el("rect", { x: cx - h, y: cy - h, width: 2 * h, height: 2 * h, fill: "none", stroke: "#c3c8cf", "stroke-width": 2, "stroke-dasharray": "4 6" }, svg);
    if (lay.n > 1) el("line", { x1: px(lay.xy[0])[0], y1: px(lay.xy[0])[1], x2: px(lay.xy[1])[0], y2: px(lay.xy[1])[1], stroke: "#222", "stroke-width": 4 }, svg);
  } else {
    el("circle", { cx, cy, r: R, fill: "none", stroke: "#c3c8cf", "stroke-width": 2, "stroke-dasharray": "4 6" }, svg);
    if (lay.n > 1) {
      // The shorter arc from the target to item 2: the distance the model uses.
      const [x1, y1] = px(lay.xy[0]), [x2, y2] = px(lay.xy[1]);
      el("path", { d: `M${x1},${y1}A${R},${R} 0 0 ${wrap(Math.atan2(lay.xy[1][0], -lay.xy[1][1])) > 0 ? 1 : 0} ${x2},${y2}`, fill: "none", stroke: "#222", "stroke-width": 4 }, svg);
    }
  }
  lay.xy.forEach((q, i) => {
    const [x, y] = px(q);
    const [lx, ly] = mode === "square" ? [x + (i ? 36 : 44), y - (i ? 24 : 34)] : onCircle(cx, cy, G.label, Math.atan2(q[0], -q[1]));
    if (i === 0) el("rect", { x: x - 31, y: y - 31, width: 62, height: 62, fill: "#fff", stroke: "#222", "stroke-width": 4 }, svg);
    const disc = el("circle", { cx: x, cy: y, r: 22, fill: hue(lay.mu[i]), stroke: "#222", "stroke-width": 1.5 }, svg);
    el("text", { x: lx, y: ly + 8, "text-anchor": "middle", class: "task-bin" }, svg).textContent = i + 1;
    // On the circle the target defines angle 0 and stays at the top; in the square every item moves.
    if (mode === "square") draggable(disc, i, `position of item ${i + 1}`, lay.dist[i], RANGE.square, `${q[0]}, ${q[1]}`);
    else if (i > 0) draggable(disc, i, `position of item ${i + 1}`, lay.dist[i], RANGE.dist);
  });
  el("text", { x: cx, y: G.H - 6, "text-anchor": "middle", class: "task-note" }, svg).textContent = lay.n === 1 ? "the target alone"
    : `item 2: ${fmt(lay.dist[1])} ${mode === "square" ? "radii" : "rad"} from the target`;
  if (focus?.svg === "display") svg.querySelector(`[data-item="${focus.item}"]`)?.focus();
}

function drawWheel(lay) {
  const svg = $("imm-wheel");
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${G.W} ${G.H}`);
  const { cx, cy, R } = G;
  el("text", { x: cx, y: 18, "text-anchor": "middle", class: "task-note" }, svg).textContent = "colour wheel; target at 0";
  for (let k = 0; k < 90; k++) {
    const a0 = TAU * (k - 0.5) / 90, a1 = TAU * (k + 0.6) / 90;
    const [x0, y0] = onCircle(cx, cy, R, a0), [x1, y1] = onCircle(cx, cy, R, a1);
    el("path", { d: `M${x0},${y0}A${R},${R} 0 0 1 ${x1},${y1}`, stroke: hue(TAU * k / 90), "stroke-width": 20, fill: "none" }, svg);
  }
  lay.mu.forEach((m, i) => {
    const [x, y] = onCircle(cx, cy, R, m), [lx, ly] = onCircle(cx, cy, G.label, m);
    el("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: i ? "#9aa3ad" : "#222", "stroke-width": i ? 2 : 3 }, svg);
    const dot = el("circle", { cx: x, cy: y, r: i ? 15 : 17, fill: hue(m), stroke: "#222", "stroke-width": i ? 2 : 4 }, svg);
    el("text", { x: lx, y: ly + 8, "text-anchor": "middle", class: "task-bin" }, svg).textContent = i + 1;
    if (i) draggable(dot, i, `colour of item ${i + 1}, radians from the target`, m, RANGE.mu);
  });
  el("text", { x: cx, y: G.H - 6, "text-anchor": "middle", class: "task-note" }, svg).textContent = lay.n > 1
    ? "drag a dot, or click it + arrows" : "no other colours";
  if (focus?.svg === "wheel") svg.querySelector(`[data-item="${focus.item}"]`)?.focus();
}

function setColour(i, mu) {
  colours = (colours ?? preset(lastN).mu.slice(1)).slice();
  colours[i - 1] = r2(wrap(mu));
  draw();
}

// A display item moved to the point [x, y] in circle radii: onto the circle at that direction, or to
// that point within the square.
function setPosition(i, [x, y]) {
  if (mode === "square") {
    points = points.map(q => q.slice());
    points[i] = [r2(clampEdge(x)), r2(clampEdge(y))];
  } else {
    angles = (angles ?? layout(lastN, pairs.spacing.value).xy.slice(1).map(([u, v]) => Math.atan2(u, -v))).map(a => r2(wrap(a)));
    angles[i - 1] = r2(wrap(Math.atan2(x, -y)));
  }
  draw();
}

const densityAxis = autoAxis(draw);
function drawDensity(lay, p, ref) {
  const svg = $("imm-density");
  const y = q => dimm(CIRC_X, { mu: lay.mu, dist: lay.dist, ...q }).map(Math.exp);
  circularPlot(svg, {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, window: WINDOW, ylab: "Density (per radian)", axis: densityAxis,
    series: [{ y: y(ref), color: COLOR.target, dashed: true }, { y: y(p), color: COLOR.target }],
    marks: lay.mu.map((m, i) => ({ at: m, color: hue(m), label: i + 1 }))
  });
}

// Mixture weights as two stacked bars: now and at the prior means, target first, then each
// non-target, then guessing (the background b).
function drawWeights(w, wRef) {
  const svg = $("imm-weights");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 500 64");
  const x0 = 64, W = 422;
  [[w, 4, "now", 1], [wRef, 34, "prior", 0.45]].forEach(([v, y, label, op]) => {
    el("text", { x: x0 - 8, y: y + 20, "text-anchor": "end", class: "tick" }, svg).textContent = label;
    let x = x0;
    v.forEach((vi, i) => {
      const last = i === v.length - 1, width = vi * W;
      const fill = i === 0 ? COLOR.target : last ? COLOR.guess : COLOR.nt;
      el("rect", { x, y, width, height: 26, fill, "fill-opacity": i > 0 && !last && i % 2 === 0 ? op * 0.6 : op,
        stroke: "#fff", "stroke-width": 1.5 }, svg);
      if (width > 26) el("text", { x: x + width / 2, y: y + 19, "text-anchor": "middle", class: "imm-seg" + (op < 1 ? " imm-seg-dim" : "") }, svg)
        .textContent = i === 0 ? "T" : last ? "G" : i + 1;
      x += width;
    });
  });
  const nt = w.slice(1, -1).reduce((s, v) => s + v, 0);
  $("imm-weights-text").textContent = `Now: T ${fmt(w[0])}, non-targets ${fmt(nt)}, G ${fmt(w.at(-1))}.`;
}

function drawAcross(p, ref, n) {
  const ns = Array.from({ length: MAX_N }, (_, i) => i + 1);
  const curve = (q, f) => ns.map(k => f(preset(k), q));
  const tw = (lay, q) => weights(lay, q)[0];
  const series = [
    { x: ns, y: curve(ref, pWithin), color: COLOR.within, dashed: true },
    { x: ns, y: curve(ref, tw), color: COLOR.target, dashed: true },
    { x: ns, y: curve(p, pWithin), color: COLOR.within },
    { x: ns, y: curve(p, tw), color: COLOR.target }
  ];
  const svg = $("imm-across");
  const { sx, sy } = linePlot(svg, {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, xlim: [0.7, 8.3], ylim: [0, 1],
    xticks: ns, yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Set size (equidistant, colours evenly spread)", ylab: "Probability", series
  });
  svg.insertBefore(el("line", { x1: sx(n), x2: sx(n), y1: sy(0), y2: sy(1), stroke: "#9aa3ad", "stroke-width": 2, "stroke-dasharray": "3 4" }), svg.querySelector(".series"));
  for (const s of series.slice(2)) s.y.forEach((v, i) =>
    el("circle", { cx: sx(ns[i]), cy: sy(v), r: ns[i] === n ? 7 : 4, fill: ns[i] === n ? "#fff" : s.color, stroke: s.color, "stroke-width": 2.5 }, svg));
  const [w1, w8] = [series[3].y[0], series[3].y[MAX_N - 1]], [q1, q8] = [series[2].y[0], series[2].y[MAX_N - 1]];
  $("imm-across-now").textContent = `With the current parameters, the target's weight falls from ${fmt(w1)} at set size 1 ` +
    `to ${fmt(w8)} at set size ${MAX_N}, and the probability of a response within ±20° of the target from ${fmt(q1)} to ${fmt(q8)}.`;
}

const rvec = v => (v.length === 1 ? String(v[0]) : `c(${v.join(", ")})`);
const lg = v => (v > 0 ? Math.log(v).toFixed(2) : "-Inf");

function drawCode(lay, p) {
  const nt = lay.n - 1, cols = q => (nt === 1 ? `"${q}1"` : `paste0("${q}", 1:${nt})`);
  const unit = mode === "square" ? "straight-line distances in circle radii" : "distances along the circle in radians";
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("imm-code").textContent =
`library(bmm)
# density over the response error (radians) for one trial with the display above;
# colours mu in radians from the target, dist = ${unit}
x <- seq(-pi, pi, length.out = 361)
d <- dimm(x, mu = ${rvec(lay.mu)}, dist = ${rvec(lay.dist)},
          c = ${p.c}, a = ${p.a}, b = ${p.b}, s = ${p.s}, kappa = ${p.kappa})
plot(x * 180 / pi, d, type = "l", xlab = "response error (degrees)", ylab = "density")
` + (nt === 0
? `
# imm() needs at least one non-target; at set size 1 the model has only target and guessing.`
: `
# fit: one row per trial; resp_error and nt_col* (non-target colours) in radians, nt_dist* (distances)
model <- imm(resp_error = "resp_error",
             nt_features = ${cols("nt_col")},
             nt_distances = ${cols("nt_dist")},
             set_size = ${lay.n},
             version = "full")
fit <- bmm(formula = bmf(c ~ 1, a ~ 1, s ~ 1, kappa ~ 1), data = my_data, model = model)
# bmm() fixes b = 1 (log b = 0) and estimates c, a, s and kappa on the log scale. ${p.b > 0
  ? `Scaled to b = 1, the values
# above are log(c) = ${lg(p.c / p.b)}, log(a) = ${lg(p.a / p.b)}, log(s) = ${lg(p.s)}, log(kappa) = ${lg(p.kappa)} there.`
  : `b = 0 (no guessing) has no
# counterpart there: with b fixed at 1 the guessing weight is never exactly 0.`}`);
}

function draw() {
  const t0 = performance.now();
  const v = readParams(pairs), bad = problems(v);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["imm-widget", "imm-code", "imm-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  const single = v.set_size === 1;
  // Dragged circle positions replace the spacing until Equidistant or a new set size clears them,
  // so the control is off and says so rather than showing a value that enters nothing.
  const moved = mode === "circle" && angles !== null;
  pairs.spacing.range.disabled = pairs.spacing.num.disabled = single || mode === "square" || moved;
  $("imm-spread").disabled = single;
  $("imm-task-hint").textContent = moved ? "items moved: Equidistant or a new set size restores the spacing" : "";
  $("imm-par-hint").textContent = "c, a, s, kappa: sliders move in log units. b: fixed at 1 in bmm(), free here.";
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) return;
  const p = Object.fromEntries(PAR.map(k => [k, v[k]]));
  const lay = layout(v.set_size, single ? 0 : v.spacing);
  drawDisplay(lay);
  drawWheel(lay);
  drawDensity(lay, p, start);
  drawWeights(weights(lay, p), weights(lay, start));
  drawAcross(p, start, v.set_size);
  drawCode(lay, p);
  $("imm-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// Pointer and keyboard moves on both drawings. The svg keeps the pointer while the items are redrawn
// under it; a keyboard move keeps the focus on the moved item.
const itemOf = e => (e.target.dataset?.item === undefined ? null : +e.target.dataset.item);
// Pointer position in circle radii from the drawing's centre. The svg box is letterboxed by its
// max-height, so the pointer goes through the svg's own transform rather than a width ratio.
function unitAt(svg, e) {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  return [(p.x - G.cx) / G.R, (p.y - G.cy) / G.R];
}
// Stale outputs keep the old items on screen; moving them would edit a display that is not drawn.
const stale = () => $("imm-widget").classList.contains("ex-stale");
const MOVES = {
  wheel: { move: (i, q) => setColour(i, Math.atan2(q[0], -q[1])),
    key: (i, node, dx, dy) => setColour(i, +node.getAttribute("aria-valuenow") + 0.05 * (dx || -dy)) },
  display: { move: setPosition,
    key: (i, node, dx, dy) => {
      const q = layout(lastN, pairs.spacing.value).xy[i];
      if (mode === "square") setPosition(i, [q[0] + 0.05 * dx, q[1] + 0.05 * dy]);
      else { const a = Math.atan2(q[0], -q[1]) + 0.05 * (dx || -dy); setPosition(i, [Math.sin(a), -Math.cos(a)]); }
    } }
};
const KEYS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
for (const name of ["wheel", "display"]) {
  const svg = $(`imm-${name}`), mv = MOVES[name];
  svg.addEventListener("pointerdown", e => {
    const i = itemOf(e);
    if (i === null || stale()) return;
    drag = { svg: name, item: i };
    // Cancelling pointerdown also cancels the mousedown that would focus the item, so focus it here
    // and remember it: the redraws during the drag then keep the arrow keys on the moved item.
    focus = drag;
    e.target.focus();
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
  });
  // A hover without a button is never a drag, whichever event ended the last one.
  svg.addEventListener("pointermove", e => { if (drag?.svg === name && e.buttons !== 0) mv.move(drag.item, unitAt(svg, e)); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(t, () => { drag = null; });
  svg.addEventListener("keydown", e => {
    const i = itemOf(e), k = KEYS[e.key];
    if (i === null || !k || stale()) return;
    e.preventDefault();
    focus = { svg: name, item: i };
    mv.key(i, e.target, ...k);
  });
}
document.addEventListener("focusin", e => { if (!e.target.closest?.("#imm-wheel, #imm-display")) focus = null; });

for (const r of document.querySelectorAll('input[name="imm-layout"]')) r.addEventListener("change", () => { setMode(r.value); draw(); });
$("imm-equi").addEventListener("click", () => { setMode("circle"); angles = null; pairs.spacing.value = maxSpacing(lastN); draw(); });
$("imm-scatter").addEventListener("click", () => { setMode("square"); points = scatter(lastN); draw(); });
$("imm-spread").addEventListener("click", () => { colours = null; draw(); });
$("imm-reset").addEventListener("click", () => {
  setParams(pairs, { ...start, set_size: START_N });
  onSetSize();
  setMode("circle");
  colours = angles = points = null;
  pairs.spacing.value = maxSpacing(START_N);
  draw();
});
$("imm-copy").addEventListener("click", () => navigator.clipboard?.writeText($("imm-code").textContent));

for (const [k, [m, sd]] of Object.entries(PRIOR)) pairs[k].setBounds({ min: m - 3 * sd, max: m + 3 * sd, step: 0.05, scale: LOG });
pairs.b.setBounds({ min: B.min, max: B.max, step: B.step });
pairs.set_size.setBounds({ min: 1, max: MAX_N, step: 1 });
pairs.spacing.setBounds({ min: 0, max: maxSpacing(START_N), step: 0.01 });
setParams(pairs, { ...start, set_size: START_N, spacing: maxSpacing(START_N) });
draw();
initInfo();
