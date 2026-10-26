// Page script for models/sdm.qmd: sdm(), the signal discrimination model of Oberauer (2023).
import { dsdm, sdmLogNumer, sdmLogDenom } from "../models/circular.js";
import { integrateExp } from "../lib/math.js";
import { bindPair, readParams, setParams, fmt, LOG } from "../lib/widget.js";
import { circularPlot, CIRC_X, DEG } from "../lib/circular-plot.js";
import { colourWheel, hue } from "../lib/wheel.js";
import { WEIGHT_COLOR } from "../lib/weights-bar.js";

// Slider ranges are the page's choice (the article names none). The starting values are the centres
// of bmm's default priors, student_t(5, 2, 0.75) on log c and student_t(5, 1.75, 0.75) on log kappa,
// stated for the default sqrtexp parametrization.
const C = { min: 0, max: 20, step: 0.1 };
const KAPPA = { min: 0.1, max: 50 };
const START_SQRTEXP = { c: LOG.fromRange(2), kappa: LOG.fromRange(1.75) };
const WINDOW = 20 / DEG;

const $ = id => document.getElementById(id);
const pairs = { c: bindPair("sdm-c", "sdm-c-num", draw), kappa: bindPair("sdm-kappa", "sdm-kappa-num", draw, LOG) };
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const sig3 = v => +v.toPrecision(3);

// The numerator is c times a function of kappa alone in both parametrizations, so the same density
// has c_to = c_from * g(from) / g(to), with g the numerator at the target for c = 1. bmm's
// c_sqrtexp2bessel() and c_bessel2sqrtexp() do this conversion.
const g = (kappa, par) => sdmLogNumer(0, 0, 1, kappa, par);
const convertC = (c, kappa, from, to) => (from === to ? c : c * g(kappa, from) / g(kappa, to));
const start = par => ({ c: sig3(convertC(START_SQRTEXP.c, START_SQRTEXP.kappa, "sqrtexp", par)), kappa: START_SQRTEXP.kappa });

let par = "sqrtexp";
// The reference curves change only with the parametrization, so each is computed once.
const refs = {};
function reference(parametrization) {
  refs[parametrization] ??= (() => {
    const s = start(parametrization), args = { mu: 0, parametrization, ...s };
    return { density: dsdm(CIRC_X, args).map(Math.exp), activation: CIRC_X.map(x => sdmLogNumer(x, 0, s.c, s.kappa, parametrization)) };
  })();
  return refs[parametrization];
}

const wheel = colourWheel($("sdm-wheel"), () => {});

const args = p => ({ mu: 0, parametrization: par, ...p });
const within = p => integrateExp(x => dsdm(x, args(p)), -WINDOW, WINDOW);

function drawDensity(p, ref) {
  circularPlot($("sdm-density"), {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, window: WINDOW, ylab: "Density (per radian)",
    series: [{ y: ref.density, color: WEIGHT_COLOR.target, dashed: true }, { y: dsdm(CIRC_X, args(p)).map(Math.exp), color: WEIGHT_COLOR.target }],
    marks: [{ at: 0, color: hue(0), label: 1 }]
  });
}

function drawActivation(p, ref, logZ) {
  circularPlot($("sdm-activation"), {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, ylab: "Activation",
    series: [{ y: ref.activation, color: WEIGHT_COLOR.nt, dashed: true }, { y: CIRC_X.map(x => sdmLogNumer(x, 0, p.c, p.kappa, par)), color: WEIGHT_COLOR.nt }],
    marks: [{ at: 0, color: hue(0), label: 1 }]
  });
  $("sdm-readout").textContent = `Z = ${Math.exp(logZ).toPrecision(3)}, density at the target ${fmt(Math.exp(sdmLogNumer(0, 0, p.c, p.kappa, par) - logZ), 3)}, ` +
    `share within ±20° of the target ${fmt(within(p))}.`;
}

function drawCode(p) {
  const sq = convertC(p.c, p.kappa, par, "sqrtexp");
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("sdm-code").textContent =
`library(bmm)
# density over the response error (radians); mu is fixed at 0 in bmm
x <- seq(-pi, pi, length.out = 361)
d <- dsdm(x, mu = 0, c = ${p.c}, kappa = ${p.kappa}, parametrization = "${par}")
plot(x * 180 / pi, d, type = "l", xlab = "response error (degrees)", ylab = "density")

# fit: one row per trial; resp_error is the response error in radians
model <- sdm(resp_error = "resp_error")
fit <- bmm(formula = bmf(c ~ 1, kappa ~ 1), data = my_data, model = model)
# bmm estimates c and kappa on the log scale, in the sqrtexp parametrization.` + (par === "bessel"
? `
# The density above is the one with c = c_bessel2sqrtexp(c = ${p.c}, kappa = ${p.kappa}) = ${sig3(sq)} there,
# so log(c) = ${sq > 0 ? Math.log(sq).toFixed(2) : "-Inf"} and log(kappa) = ${Math.log(p.kappa).toFixed(2)}.`
: ` The values above are
# log(c) = ${p.c > 0 ? Math.log(p.c).toFixed(2) : "-Inf"} and log(kappa) = ${p.kappa > 0 ? Math.log(p.kappa).toFixed(2) : "-Inf"}.`);
}

function draw() {
  const t0 = performance.now();
  const p = readParams(pairs);
  const bad = ["c", "kappa"].filter(k => !inRange(p[k], 0, Infinity));
  // exp(activation) must stay finite for the normaliser; far above the slider range it does not.
  const logZ = bad.length ? NaN : sdmLogDenom(0, p.c, p.kappa, par);
  const unstable = !bad.length && !Number.isFinite(logZ);
  for (const [k, pair] of Object.entries(pairs)) {
    const flagged = bad.includes(k) || (unstable && k === "c");
    pair.num.classList.toggle("ex-invalid", flagged);
    pair.num.setAttribute("aria-invalid", flagged);
  }
  for (const id of ["sdm-widget", "sdm-code"]) $(id).classList.toggle("ex-stale", bad.length > 0 || unstable);
  $("sdm-par-hint").textContent = bad.length ? "c and kappa must be numbers ≥ 0."
    : unstable ? "c is too large for the normaliser to be computed." : "kappa: the slider moves in log units.";
  if (bad.length || unstable) return;
  const ref = reference(par);
  wheel([0], "target colour; error = response − target");
  drawDensity(p, ref);
  drawActivation(p, ref, logZ);
  drawCode(p);
  $("sdm-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// Switching converts c so the density stays; an empty or invalid box has nothing to convert.
for (const r of document.querySelectorAll('input[name="sdm-par"]')) r.addEventListener("change", () => {
  const { c, kappa } = readParams(pairs);
  const next = convertC(c, kappa, par, r.value);
  if (inRange(c, 0, Infinity) && inRange(kappa, 0, Infinity) && Number.isFinite(next)) pairs.c.value = sig3(next);
  par = r.value;
  draw();
});
$("sdm-reset").addEventListener("click", () => {
  par = "sqrtexp";
  for (const r of document.querySelectorAll('input[name="sdm-par"]')) r.checked = r.value === par;
  setParams(pairs, start(par));
  draw();
});
$("sdm-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdm-code").textContent));

pairs.c.setBounds(C);
pairs.kappa.setBounds({ min: Math.log(KAPPA.min), max: Math.log(KAPPA.max), step: 0.05, scale: LOG });
setParams(pairs, start(par));
draw();
