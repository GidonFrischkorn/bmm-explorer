// Page script for models/mixture3p.qmd: mixture3p(), the Bays et al. (2009) three-parameter mixture.
import { dmixture3p } from "../models/circular.js";
import { dvonmises } from "../lib/math.js";
import { bindPair, readParams, setParams, fmt, LOG } from "../lib/widget.js";
import { linePlot, el } from "../lib/plot.js";
import { circularPlot, CIRC_X, wrap } from "../lib/circular-plot.js";
import { colourWheel, hue, TAU } from "../lib/wheel.js";
import { weightBars, WEIGHT_COLOR } from "../lib/weights-bar.js";

// kappa has bmm's default prior normal(2, 1) on the log link; its slider spans the mean +- 3 SD.
// thetat = thetant = 0 (the medians of their logistic(0, 1) priors) give weights of 1/3 each, which
// the sliders' step of 0.01 rounds to 0.33.
const KAPPA = [2, 1];
const MAX_N = 8, START_N = 4;
const START = { p_mem: 0.33, p_nt: 0.33, kappa: LOG.fromRange(KAPPA[0]) };
const PAR = ["p_mem", "p_nt", "kappa"];

const $ = id => document.getElementById(id);
const r2 = v => Math.round(v * 100) / 100;
const pairs = {
  p_mem: bindPair("mix3-p_mem", "mix3-p_mem-num", draw),
  p_nt: bindPair("mix3-p_nt", "mix3-p_nt-num", draw),
  kappa: bindPair("mix3-kappa", "mix3-kappa-num", draw, LOG),
  set_size: bindPair("mix3-set-size", "mix3-set-size-num", onSetSize)
};
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

// The non-targets' colours after a drag; null: spread evenly around the wheel. Values are rounded to
// what the page prints, so the bmm code reproduces the curves.
let colours = null, lastN = START_N;
const evenColours = n => Array.from({ length: n - 1 }, (_, i) => r2(wrap(TAU * (i + 1) / n)));
const colourSet = n => [0, ...(colours ?? evenColours(n))];

const guess = p => 1 - p.p_mem - p.p_nt;
const weights = (n, p) => [p.p_mem, ...Array(n - 1).fill(p.p_nt / (n - 1)), guess(p)];

function problems(p) {
  const out = [];
  if (!Number.isInteger(p.set_size) || !inRange(p.set_size, 2, MAX_N)) out.push([["set_size"], "mix3-task-hint", `Set size must be a whole number from 2 to ${MAX_N}.`]);
  const bad = PAR.filter(k => !inRange(p[k], 0, k === "kappa" ? Infinity : 1));
  if (bad.length) out.push([bad, "mix3-par-hint", "p_mem and p_nt must be numbers from 0 to 1, kappa a number ≥ 0."]);
  else if (p.p_mem + p.p_nt > 1 + 1e-9) out.push([["p_mem", "p_nt"], "mix3-par-hint", "p_mem + p_nt cannot exceed 1: guessing gets what remains."]);
  return out;
}

// The sliders cannot leave the limit: each one's upper end is 1 minus the other's value.
function limitSliders(p) {
  const room = other => (inRange(other, 0, 1) ? Math.round((1 - other) * 1e6) / 1e6 : 1);
  pairs.p_mem.setBounds({ max: room(p.p_nt) });
  pairs.p_nt.setBounds({ max: room(p.p_mem) });
}

// A new set size spreads the colours evenly again; an empty or out-of-range one leaves them alone.
function onSetSize() {
  const n = pairs.set_size.value;
  if (Number.isInteger(n) && inRange(n, 2, MAX_N) && n !== lastN) { colours = null; lastN = n; }
  draw();
}

const wheel = colourWheel($("mix3-wheel"), (i, mu) => {
  colours = (colours ?? evenColours(lastN)).slice();
  colours[i - 1] = mu;
  draw();
});

// The components on CIRC_X, stacked in this order: guessing floor, non-targets, target.
function components(mu, p) {
  const nNt = mu.length - 1, floor = guess(p) / TAU;
  const nt = CIRC_X.map(x => mu.slice(1).reduce((s, m) => s + p.p_nt / nNt * Math.exp(dvonmises(x, m, p.kappa)), 0));
  const tgt = CIRC_X.map(x => p.p_mem * Math.exp(dvonmises(x, 0, p.kappa)));
  const base = CIRC_X.map(() => floor), top1 = base.map((f, i) => f + nt[i]);
  return { base, top1, top2: top1.map((v, i) => v + tgt[i]) };
}

function drawDensity(mu, p) {
  const total = q => dmixture3p(CIRC_X, { mu, ...q }).map(Math.exp);
  const c = components(mu, p), zero = CIRC_X.map(() => 0);
  circularPlot($("mix3-density"), {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, ylab: "Density (per radian)",
    series: [{ y: total(START), color: WEIGHT_COLOR.target, dashed: true }, { y: total(p), color: WEIGHT_COLOR.target }],
    areas: [
      { lo: zero, hi: c.base, color: WEIGHT_COLOR.guess, opacity: 0.3 },
      { lo: c.base, hi: c.top1, color: WEIGHT_COLOR.nt, opacity: 0.3 },
      { lo: c.top1, hi: c.top2, color: WEIGHT_COLOR.target, opacity: 0.3 }],
    marks: mu.map((m, i) => ({ at: m, color: hue(m), label: i + 1 }))
  });
}

function drawWeights(n, p) {
  weightBars($("mix3-weights"), [
    { label: "now", weights: weights(n, p), opacity: 1 },
    { label: "start", weights: weights(n, START), opacity: 0.45 }
  ], "M");
  $("mix3-weights-text").textContent = `Now: M ${fmt(p.p_mem)}, non-targets ${fmt(p.p_nt)} ` +
    `(${fmt(p.p_nt / (n - 1))} each), G ${fmt(guess(p))}.`;
}

function drawAcross(p, n) {
  const ns = Array.from({ length: MAX_N - 1 }, (_, i) => i + 2);
  const curves = q => [
    { y: ns.map(() => q.p_mem), color: WEIGHT_COLOR.target, width: 6 },
    { y: ns.map(() => q.p_nt), color: WEIGHT_COLOR.nt, width: 3 },
    { y: ns.map(k => q.p_nt / (k - 1)), color: WEIGHT_COLOR.nt, width: 1.5 },
    { y: ns.map(() => guess(q)), color: WEIGHT_COLOR.guess, width: 3 }
  ].map(s => ({ ...s, x: ns }));
  const series = [...curves(START).map(s => ({ ...s, dashed: true })), ...curves(p)];
  const svg = $("mix3-across");
  const { sx, sy } = linePlot(svg, {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, xlim: [1.7, 8.3], ylim: [0, 1],
    xticks: ns, yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Set size (target + non-targets)", ylab: "Weight", series
  });
  svg.insertBefore(el("line", { x1: sx(n), x2: sx(n), y1: sy(0), y2: sy(1), stroke: "#9aa3ad", "stroke-width": 2, "stroke-dasharray": "3 4" }), svg.querySelector(".series"));
  for (const s of series.slice(4)) {
    const k = ns.indexOf(n);
    el("circle", { cx: sx(n), cy: sy(s.y[k]), r: 7, fill: "#fff", stroke: s.color, "stroke-width": 2.5 }, svg);
  }
  $("mix3-across-now").textContent = `With the current parameters, all non-targets together get ${fmt(p.p_nt)} at every set size, ` +
    `while one non-target gets ${fmt(p.p_nt)} at set size 2 and ${fmt(p.p_nt / (MAX_N - 1))} at set size ${MAX_N}.`;
}

const rvec = v => `c(${v.join(", ")})`;
// log(a / b) for the softmax link, written the way R prints it.
const logRatio = (a, b) => (a === 0 ? "-Inf" : b === 0 ? "Inf" : Math.log(a / b).toFixed(2));

function drawCode(mu, p, atLimit) {
  const nt = mu.length - 1, cols = nt === 1 ? '"nt_col1"' : `paste0("nt_col", 1:${nt})`;
  const g = guess(p);
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("mix3-code").textContent =
`library(bmm)
# density over the response error (radians) for one trial; mu = colours in radians from the target
x <- seq(-pi, pi, length.out = 361)
d <- dmixture3p(x, mu = ${rvec(mu)}, kappa = ${p.kappa},
                p_mem = ${p.p_mem}, p_nt = ${atLimit ? `1 - ${p.p_mem}` : p.p_nt})
plot(x * 180 / pi, d, type = "l", xlab = "response error (degrees)", ylab = "density")

# fit: one row per trial; resp_error and nt_col* (non-target colours) in radians
model <- mixture3p(resp_error = "resp_error",
                   nt_features = ${cols},
                   set_size = ${mu.length})
fit <- bmm(formula = bmf(thetat ~ 1, thetant ~ 1, kappa ~ 1), data = my_data, model = model)
# bmm estimates thetat and thetant on a softmax link with guessing as the reference at 0, and kappa on
# the log scale. The values above are thetat = ${logRatio(p.p_mem, g)}, thetant = ${logRatio(p.p_nt, g)} and log(kappa) = ${p.kappa > 0 ? Math.log(p.kappa).toFixed(2) : "-Inf"}.${g === 0
  ? `
# Guessing has weight 0 here, which no finite thetat and thetant reach.` : ""}`;
}

function draw() {
  const t0 = performance.now();
  const v = readParams(pairs), bad = problems(v);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["mix3-widget", "mix3-code", "mix3-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("mix3-task-hint").textContent = "";
  $("mix3-par-hint").textContent = "kappa: the slider moves in log units. p_mem + p_nt ≤ 1: each slider stops where the other leaves no room.";
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  limitSliders(v);
  if (bad.length) return;
  // 1 - p_mem - p_nt can come out as -5e-17 for values that sum to 1 (0.67 + 0.33), where bmm's
  // dmixture3p() returns NaN; at the limit p_nt is taken as 1 - p_mem, and the code shows that.
  const atLimit = 1 - v.p_mem - v.p_nt < 0;
  const p = { p_mem: v.p_mem, p_nt: atLimit ? 1 - v.p_mem : v.p_nt, kappa: v.kappa }, n = v.set_size, mu = colourSet(n);
  wheel(mu, "drag a dot, or click it + arrows");
  drawDensity(mu, p);
  drawWeights(n, p);
  drawAcross(p, n);
  drawCode(mu, p, atLimit);
  $("mix3-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

$("mix3-spread").addEventListener("click", () => { colours = null; draw(); });
$("mix3-reset").addEventListener("click", () => {
  colours = null;
  lastN = START_N;
  setParams(pairs, { ...START, set_size: START_N });
  draw();
});
$("mix3-copy").addEventListener("click", () => navigator.clipboard?.writeText($("mix3-code").textContent));

for (const k of ["p_mem", "p_nt"]) pairs[k].setBounds({ min: 0, max: 1, step: 0.01 });
pairs.kappa.setBounds({ min: KAPPA[0] - 3 * KAPPA[1], max: KAPPA[0] + 3 * KAPPA[1], step: 0.05, scale: LOG });
pairs.set_size.setBounds({ min: 2, max: MAX_N, step: 1 });
setParams(pairs, { ...START, set_size: START_N });
draw();
