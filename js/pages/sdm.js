// Page script for models/sdm.qmd: sdm(), the signal discrimination model of Oberauer (2023).
import { dsdm, sdmLogNumer, sdmLogDenom } from "../models/circular.js";
import { integrateExp } from "../lib/math.js";
import { bindPair, readParams, setParams, fmt, LOG } from "../lib/widget.js";
import { circularPlot, CIRC_X, DEG } from "../lib/circular-plot.js";
import { autoAxis } from "../lib/axis.js";
import { simControls, circularSimulation, simCode } from "../lib/sim-panel.js";
import { colourWheel, hue } from "../lib/wheel.js";
import { WEIGHT_COLOR } from "../lib/weights-bar.js";
import { initInfo } from "../lib/info.js";

// Slider ranges are the page's choice (the article names none). The starting values are the centres
// of bmm's default priors, student_t(5, 2, 0.75) on log c and student_t(5, 1.75, 0.75) on log kappa,
// stated for the default sqrtexp parametrization. c's slider stays linear although bmm's link for c is
// log: a log scale has no place for c = 0, the uniform limit the page text discusses. Its step is fine
// enough that the start value, e^2 to three digits, lies on the grid.
const C = { min: 0, max: 20, step: 0.01 };
const KAPPA = { min: 0.1, max: 50 };
const START_SQRTEXP = { c: LOG.fromRange(2), kappa: LOG.fromRange(1.75) };
const WINDOW = 20 / DEG;

const $ = id => document.getElementById(id);
const pairs = { c: bindPair("sdm-c", "sdm-c-num", draw), kappa: bindPair("sdm-kappa", "sdm-kappa-num", draw, LOG) };
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const sig3 = v => +v.toPrecision(3);
const rLog = v => (v > 0 ? Math.log(v).toFixed(2) : "-Inf");
const clamp = (v, { min, max }) => Math.min(Math.max(v, min), max);

// The numerator is c times a function of kappa alone in both parametrizations, so the same density
// has c_to = c_from * g(from) / g(to), with g the numerator at the target for c = 1. bmm's
// c_sqrtexp2bessel() and c_bessel2sqrtexp() do this conversion. At kappa = 0 the density is uniform
// for every c in both parametrizations, so no conversion exists and the user's c is kept.
const g = (kappa, par) => sdmLogNumer(0, 0, 1, kappa, par);
const convertC = (c, kappa, from, to) => (from === to || kappa === 0 ? c : c * g(kappa, from) / g(kappa, to));
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

const densityAxis = autoAxis(draw), activationAxis = autoAxis(draw), sim = simControls("sdm", draw);
function drawDensity(p, ref) {
  circularPlot($("sdm-density"), {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, window: WINDOW, ylab: "Density (per radian)", axis: densityAxis,
    series: [{ y: ref.density, color: WEIGHT_COLOR.target, dashed: true }, { y: dsdm(CIRC_X, args(p)).map(Math.exp), color: WEIGHT_COLOR.target }],
    bars: circularSimulation(sim, x => dsdm(x, args(p)), WINDOW),
    marks: [{ at: 0, color: hue(0), label: 1 }]
  });
}

function drawActivation(p, ref, logZ) {
  circularPlot($("sdm-activation"), {
    W: 500, H: 250, margin: { l: 64, r: 14, t: 10, b: 50 }, ylab: "Activation", axis: activationAxis,
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
# density over the response error (radians); bmm fixes mu at 0 unless the formula includes mu
x <- seq(-pi, pi, length.out = 361)
d <- dsdm(x, mu = 0, c = ${p.c}, kappa = ${p.kappa}, parametrization = "${par}")
plot(x * 180 / pi, d, type = "l", xlab = "response error (degrees)", ylab = "density")
${sim.on ? simCode(sim.n, `rsdm(n, mu = 0, c = ${p.c}, kappa = ${p.kappa}, parametrization = "${par}")`, WINDOW) + "\n" : ""}
# fit: one row per trial; resp_error is the response error in radians
model <- sdm(resp_error = "resp_error")
fit <- bmm(formula = bmf(c ~ 1, kappa ~ 1), data = my_data, model = model)
# bmm estimates c and kappa on the log scale, in the sqrtexp parametrization.` + (p.kappa === 0
? ` At kappa = 0 the
# density is uniform for any c, in both parametrizations, so log(kappa) = -Inf and c has no effect.`
: par === "bessel"
? `
# The density above is the one with c = c_bessel2sqrtexp(c = ${p.c}, kappa = ${p.kappa}) = ${sig3(sq)} there,
# so log(c) = ${rLog(sq)} and log(kappa) = ${rLog(p.kappa)}.`
: ` The values above are
# log(c) = ${rLog(p.c)} and log(kappa) = ${rLog(p.kappa)}.`);
}

// The peak activation grows with c and with kappa, so either can overflow exp() in the normaliser. The
// hint has to name the one to bring back: the one that overflows even with the other inside its slider
// range.
function overflowCause(p) {
  const ok = (c, kappa) => Number.isFinite(sdmLogDenom(0, c, kappa, par));
  const cAlone = !ok(p.c, clamp(p.kappa, KAPPA)), kappaAlone = !ok(clamp(p.c, C), p.kappa);
  return cAlone === kappaAlone ? ["c", "kappa"] : cAlone ? ["c"] : ["kappa"];
}

function draw() {
  const t0 = performance.now();
  const p = readParams(pairs);
  const bad = ["c", "kappa"].filter(k => !inRange(p[k], 0, Infinity));
  const logZ = bad.length ? NaN : sdmLogDenom(0, p.c, p.kappa, par);
  const culprits = bad.length || Number.isFinite(logZ) ? [] : overflowCause(p);
  for (const [k, pair] of Object.entries(pairs)) {
    const flagged = bad.includes(k) || culprits.includes(k);
    pair.num.classList.toggle("ex-invalid", flagged);
    pair.num.setAttribute("aria-invalid", flagged);
  }
  for (const id of ["sdm-widget", "sdm-code"]) $(id).classList.toggle("ex-stale", bad.length > 0 || culprits.length > 0);
  // A typed value, or one a switch of parametrization converted, can lie beyond its slider. It is used
  // as it is and the slider rests at its end, so the hint warns that touching the slider replaces it;
  // widening the slider for the rare converted value would crowd the range every other value uses.
  const beyond = bad.length ? [] : [["c", C], ["kappa", KAPPA]].filter(([k, r]) => p[k] !== clamp(p[k], r)).map(([k]) => k);
  $("sdm-par-hint").textContent = bad.length ? "c and kappa must be numbers ≥ 0."
    : culprits.length ? `${culprits.length > 1 ? "c and kappa are" : `${culprits[0]} is`} too large for the normaliser to be computed.`
    : beyond.length ? `${beyond.join(" and ")} ${beyond.length > 1 ? "lie beyond their sliders' ranges" : "lies beyond its slider's range"}; the value in the box is used until the slider moves.`
    : "kappa: the slider moves in log units.";
  if (bad.length || culprits.length) return;
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
  // The density stays; the activation changes scale with the parametrization.
  activationAxis.reset();
  draw();
});
$("sdm-reset").addEventListener("click", () => {
  par = "sqrtexp";
  for (const r of document.querySelectorAll('input[name="sdm-par"]')) r.checked = r.value === par;
  setParams(pairs, start(par));
  sim.reset();
  draw();
});
$("sdm-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdm-code").textContent));

pairs.c.setBounds(C);
// kappa's slider starts at -2.3, not log(0.1), so that the start value lies on its 0.05 grid and a first
// touch keeps 5.75; exp(-2.3) still shows as 0.1. No such grid also holds log(50), so the box allows 50
// while the slider's last step is 49.4.
pairs.kappa.setBounds({ min: -2.3, max: Math.log(KAPPA.max), step: 0.05, scale: LOG });
setParams(pairs, start(par));
draw();
initInfo();
