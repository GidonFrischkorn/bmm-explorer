// Page script for models/mixture2p.qmd: mixture2p(), the Zhang and Luck (2008) two-parameter mixture.
import { dmixture2p } from "../models/circular.js";
import { integrateExp } from "../lib/math.js";
import { bindPair, readParams, setParams, fmt, LOG } from "../lib/widget.js";
import { circularPlot, CIRC_X, DEG } from "../lib/circular-plot.js";
import { autoAxis } from "../lib/axis.js";
import { colourWheel, hue } from "../lib/wheel.js";
import { weightBars, WEIGHT_COLOR } from "../lib/weights-bar.js";
import { initInfo } from "../lib/info.js";

// kappa has bmm's default prior normal(2, 1) on the log link; its slider spans the mean +- 3 SD.
// p_mem has the whole probability range; its start is the median of the logistic(0, 1) prior on thetat.
const KAPPA = [2, 1];
const START = { p_mem: 0.5, kappa: LOG.fromRange(KAPPA[0]) };
const WINDOW = 20 / DEG;

const $ = id => document.getElementById(id);
const pairs = { p_mem: bindPair("mix2-p_mem", "mix2-p_mem-num", draw), kappa: bindPair("mix2-kappa", "mix2-kappa-num", draw, LOG) };
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

const floor = p => (1 - p.p_mem) / (2 * Math.PI);
const within = p => integrateExp(x => dmixture2p(x, p), -WINDOW, WINDOW);
const inf = v => (v === Infinity ? "Inf" : v === -Infinity ? "-Inf" : v.toFixed(2));

function problems(p) {
  const out = [];
  if (!inRange(p.p_mem, 0, 1)) out.push([["p_mem"], "p_mem must be a number from 0 to 1."]);
  if (!inRange(p.kappa, 0, Infinity)) out.push([["kappa"], "kappa must be a number ≥ 0."]);
  return out;
}

const wheel = colourWheel($("mix2-wheel"), () => {});

const densityAxis = autoAxis(draw);
function drawDensity(p) {
  const total = q => dmixture2p(CIRC_X, q).map(Math.exp);
  const now = total(p), fl = CIRC_X.map(() => floor(p));
  circularPlot($("mix2-density"), {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, window: WINDOW, ylab: "Density (per radian)", axis: densityAxis,
    series: [{ y: total(START), color: WEIGHT_COLOR.target, dashed: true }, { y: now, color: WEIGHT_COLOR.target }],
    areas: [{ lo: CIRC_X.map(() => 0), hi: fl, color: WEIGHT_COLOR.guess, opacity: 0.3 }, { lo: fl, hi: now, color: WEIGHT_COLOR.target, opacity: 0.3 }],
    marks: [{ at: 0, color: hue(0), label: 1 }]
  });
}

function drawWeights(p) {
  weightBars($("mix2-weights"), [
    { label: "now", weights: [p.p_mem, 1 - p.p_mem], opacity: 1 },
    { label: "start", weights: [START.p_mem, 1 - START.p_mem], opacity: 0.45 }
  ], "M");
  $("mix2-readout").textContent = `Now: M ${fmt(p.p_mem)}, G ${fmt(1 - p.p_mem)}. ` +
    `Share of responses within ±20° of the target: ${fmt(within(p))} (start: ${fmt(within(START))}).`;
}

function drawCode(p) {
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("mix2-code").textContent =
`library(bmm)
# density over the response error (radians); bmm fixes mu1, the location, at 0 unless the formula includes mu1
x <- seq(-pi, pi, length.out = 361)
d <- dmixture2p(x, mu = 0, kappa = ${p.kappa}, p_mem = ${p.p_mem})
plot(x * 180 / pi, d, type = "l", xlab = "response error (degrees)", ylab = "density")

# fit: one row per trial; resp_error is the response error in radians
model <- mixture2p(resp_error = "resp_error")
fit <- bmm(formula = bmf(thetat ~ 1, kappa ~ 1), data = my_data, model = model)
# bmm estimates thetat (p_mem) on the logit scale and kappa on the log scale. The values above are
# thetat = qlogis(${p.p_mem}) = ${inf(Math.log(p.p_mem / (1 - p.p_mem)))} and log(kappa) = ${p.kappa > 0 ? Math.log(p.kappa).toFixed(2) : "-Inf"}.`;
}

function draw() {
  const t0 = performance.now();
  const p = readParams(pairs), bad = problems(p);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["mix2-widget", "mix2-code"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("mix2-par-hint").textContent = bad.map(([, msg]) => msg).join(" ") || "kappa: the slider moves in log units.";
  if (bad.length) return;
  wheel([0], "target colour; error = response − target");
  drawDensity(p);
  drawWeights(p);
  drawCode(p);
  $("mix2-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

$("mix2-reset").addEventListener("click", () => { setParams(pairs, START); draw(); });
$("mix2-copy").addEventListener("click", () => navigator.clipboard?.writeText($("mix2-code").textContent));

pairs.p_mem.setBounds({ min: 0, max: 1, step: 0.01 });
pairs.kappa.setBounds({ min: KAPPA[0] - 3 * KAPPA[1], max: KAPPA[0] + 3 * KAPPA[1], step: 0.05, scale: LOG });
setParams(pairs, START);
draw();
initInfo();
