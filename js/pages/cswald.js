// Page script for models/cswald.qmd: the censored shifted Wald model, versions "simple" and "crisk".
import { dcswald, dddm, ezdmMoments4par } from "../models/rt.js";
import { bindParams, readParams, setParams, fmt, LINEAR, LOG, LOGIT } from "../lib/widget.js";
import { linePlot } from "../lib/plot.js";
import { autoAxis, niceAxis } from "../lib/axis.js";
import { drawDiffusion, mirroredDensity, timeAxis, rtGrid, BLUE, ORANGE } from "../lib/rt-plot.js";
import { initInfo } from "../lib/info.js";
import { describePlot, initA11y } from "../lib/a11y.js";

// bmm's default priors for cswald(version = ...), [mean, sd, scale, step] on the link scale; the sliders
// span mean +- 3 SD and start at the means. drift has a log link in simple (it is positive there) and an
// identity link in crisk. zr exists in crisk only; bmm fixes it at 0.5 unless the formula estimates it.
const PRIOR = {
  simple: { drift: [0, 1, LOG, 0.05], bound: [0, 0.3, LOG, 0.02], ndt: [-2, 0.3, LOG, 0.02] },
  crisk: { drift: [0, 1, LINEAR, 0.05], bound: [0, 0.3, LOG, 0.02], ndt: [-2, 0.3, LOG, 0.02], zr: [0, 0.3, LOGIT, 0.02] }
};
const start = v => ({ zr: 0.5, ...Object.fromEntries(Object.entries(PRIOR[v]).map(([k, [m, , sc]]) => [k, sc.fromRange(m)])) });
// The time axis stops near here (6 s once rounded): at the smallest drifts of the simple version the Wald
// density spreads over minutes.
const T_CAP = 5;
// The wide diffusion-model band under the thin curves of the comparison panel; lighter than rt-plot's
// GREY so the curves drawn over it stay readable.
const DDM_BAND = "#8a939c";

const $ = id => document.getElementById(id);
const pairs = bindParams(Object.fromEntries(["drift", "bound", "ndt", "zr"].map(k => [k, [`cswald-${k}`, `cswald-${k}-num`]])), draw);
const versionInputs = [...document.querySelectorAll('input[name="cswald-version"]')];
const version = () => versionInputs.find(r => r.checked).value;

// [field, message] for each value the densities are not defined at.
const problems = (p, v) => [
  ["drift", v === "simple" ? p.drift > 0 : Number.isFinite(p.drift), v === "simple" ? "drift positive" : "drift a number"],
  ["bound", p.bound > 0, "bound positive"], ["ndt", p.ndt > 0, "ndt positive"],
  ["zr", v === "simple" || (p.zr > 0 && p.zr < 1), "zr between 0 and 1"]
].filter(([, ok]) => !ok).map(([k, , msg]) => [k, msg]);

// The diffusion model the version approximates: simple's bound is half the boundary separation, with the
// start in the middle; crisk shares the diffusion model's parameters.
const ddmPars = (p, v) => (v === "simple" ? { drift: p.drift, bound: 2 * p.bound, ndt: p.ndt, zr: 0.5 } : { ...p });

// The end of the time axis: the Wald mean plus 3 SD in simple (bound / drift and bound / drift^3, s = 1),
// the diffusion model's moments in crisk.
function tEnd(p, v) {
  if (v === "simple") return p.ndt + p.bound / p.drift + 3 * Math.sqrt(p.bound / p.drift ** 3);
  const m = ezdmMoments4par(p);
  return p.ndt + Math.max(m.mdt_upper, m.mdt_lower) + 3 * Math.sqrt(Math.max(m.vrt_upper, m.vrt_lower));
}

const dens = (x, p, response, v) => dcswald(x, { ...p, response, version: v }).map(Math.exp);
const MARGIN = { l: 64, r: 10, t: 12, b: 50 };
// The time axis is shared by the task drawing and both density panels.
const timeAuto = autoAxis(draw, { nice: niceAxis }), densityAxis = autoAxis(draw), compareAxis = autoAxis(draw);
// simple: the axis reaches 1 at least, the probability of no correct response by rt 0.
const simpleAxis = autoAxis(draw, { nice: m => niceAxis(Math.max(1, m) * 1.05) });

function drawDensity(p, v, axis, x) {
  const ref = start(v), svg = $("cswald-density");
  if (v === "crisk") {
    mirroredDensity(svg, { W: 500, H: 300, margin: MARGIN, ...axis, x, axis: densityAxis,
      upper: [{ y: dens(x, ref, 1, v), color: BLUE, dashed: true }, { y: dens(x, p, 1, v), color: BLUE }],
      lower: [{ y: dens(x, ref, 0, v), color: ORANGE, dashed: true }, { y: dens(x, p, 0, v), color: ORANGE }] });
    return;
  }
  // simple: the correct response's density and, for an error at rt, the probability that no correct
  // response has happened by rt. One is a density, the other a probability; they share the axis only.
  const series = [[ref, true], [p, false]].flatMap(([q, dashed]) => [
    { x, y: dens(x, q, 1, v), color: BLUE, dashed }, { x, y: dens(x, q, 0, v), color: ORANGE, dashed }]);
  const { ylim, yticks } = simpleAxis.next(Math.max(...series.flatMap(s => s.y.filter(Number.isFinite))));
  linePlot(svg, { W: 500, H: 300, margin: MARGIN, ...axis, ylim, yticks, xlab: "rt (s)", ylab: "density · probability", series });
}

function drawCompare(p, v, axis, x) {
  const d = ddmPars(p, v), ddm = r => dddm(x, { ...d, response: r }).map(Math.exp);
  mirroredDensity($("cswald-ddm"), { W: 500, H: 300, margin: MARGIN, ...axis, x, axis: compareAxis,
    upper: [{ y: ddm(1), color: DDM_BAND, width: 5 }, { y: dens(x, p, 1, v), color: BLUE, width: 2.5 }],
    lower: [{ y: ddm(0), color: DDM_BAND, width: 5 }, ...(v === "crisk" ? [{ y: dens(x, p, 0, v), color: ORANGE, width: 2.5 }] : [])],
    lowerLabel: v === "simple" ? "lower (0), DDM only" : "lower (0)" });
  const pLower = 1 - ezdmMoments4par(d).pC;
  $("cswald-ddm-readout").textContent = `With these values the diffusion model gives P(lower) = ${fmt(pLower, 3)}` +
    (v === "simple" ? ` (bound ${fmt(d.bound, 2)}, zr 0.5).` : ".");
}

// R code: plain ASCII digits and minus, so the snippet pastes into R unchanged. The call prints the
// parameters to 3 significant digits, and the comment is computed from those printed values, so it is
// what R returns for the call even when a typed value has more digits. A typed zr just below 1 would
// print as 1, which bmm rejects, so zr takes as many more digits as keep it inside (0, 1).
function printed(k, x) {
  for (let digits = 3; ; digits++) {
    const y = +x.toPrecision(digits);
    if (k !== "zr" || (y > 0 && y < 1)) return y;
  }
}
function drawCode(p, v) {
  const q = Object.fromEntries(Object.entries(p).map(([k, x]) => [k, printed(k, x)])), crisk = v === "crisk";
  const rt = +(q.ndt + 0.5).toFixed(3);
  const ll = [1, 0].map(resp => dcswald(rt, { ...q, response: resp, version: v }));
  const freeZr = crisk && q.zr !== 0.5;
  $("cswald-code").textContent =
`library(bmm)
model <- cswald(rt = "rt", response = "response", version = "${v}")

# log likelihood of an upper (1) and a lower (0) response, both at rt = ndt + 0.5 s
dcswald(rt = c(${rt}, ${rt}), response = c(1, 0),
        drift = ${q.drift}, bound = ${q.bound}, ndt = ${q.ndt}${crisk ? `, zr = ${q.zr}` : ""}, version = "${v}")
# ${ll.map(x => x.toFixed(4)).join("  ")}

# fit: one row per trial, rt in seconds, response 0 or 1
fit <- bmm(formula = bmf(drift ~ 1, bound ~ 1, ndt ~ 1${freeZr ? ", zr ~ 1" : ""}), data = my_data, model = model)${freeZr
  ? "\n# zr ~ 1 estimates the starting point; without it bmm fixes zr at 0.5" : ""}`;
}

const HINT = {
  simple: "drift, bound, ndt: log scale. bound runs from the start to the upper boundary.",
  crisk: "bound, ndt: log scale; zr: logit scale. bound is the full boundary separation."
};

function draw() {
  const t0 = performance.now();
  const v = version(), p = readParams(pairs), bad = problems(p, v);
  for (const e of document.querySelectorAll(".cswald-crisk-only")) e.hidden = v !== "crisk";
  for (const [k, pair] of Object.entries(pairs)) {
    const off = bad.some(([f]) => f === k);
    pair.num.classList.toggle("ex-invalid", off);
    pair.num.setAttribute("aria-invalid", off);
  }
  for (const id of ["cswald-widget", "cswald-code"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("cswald-hint").textContent = bad.length ? `Needed: ${bad.map(([, msg]) => msg).join(", ")}.` : HINT[v];
  if (bad.length) return;
  const q = v === "simple" ? { ...p, zr: 0.5 } : p;
  const axis = timeAxis(Math.min(T_CAP, Math.max(tEnd(q, v), tEnd(start(v), v))), timeAuto), x = rtGrid(axis.xlim);
  drawDiffusion($("cswald-task"), { mode: v, ...q, ...axis });
  drawDensity(q, v, axis, x);
  drawCompare(q, v, axis, x);
  drawCode(q, v);
  const pars = `drift ${fmt(q.drift)}, boundary ${fmt(q.bound)}, non-decision time ${fmt(q.ndt)} s`;
  describePlot($("cswald-task"), `${v === "simple" ? "Simple" : "Competing-risks"} version: evidence accumulating toward the boundary, ${pars}.`);
  describePlot($("cswald-density"), `Response-time densities of the two responses, ${pars}.`);
  describePlot($("cswald-ddm"), `The densities of this model over those of the diffusion decision model with matching parameters, ${pars}.`);
  $("cswald-legend").innerHTML = v === "simple"
    ? '<span class="blue">Correct (1)</span>: density of the rt. <span class="orange">Error (0)</span>: probability ' +
      "that no correct response has come by that rt, the likelihood of an error then. Dashed: prior means."
    : '<span class="blue">Upper</span> above the axis, <span class="orange">lower</span> below; each area is that ' +
      "response's probability. Dashed: prior means.";
  $("cswald-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// The version decides the parametrisation of drift and whether zr exists, so the parameters restart at
// that version's prior means.
function applyVersion() {
  const v = version();
  for (const a of [timeAuto, densityAxis, compareAxis, simpleAxis]) a.reset();
  for (const [k, [m, sd, scale, step]] of Object.entries(PRIOR[v])) pairs[k].setBounds({ min: m - 3 * sd, max: m + 3 * sd, step, scale });
  setParams(pairs, start(v));
}

versionInputs.forEach(i => i.addEventListener("change", () => { applyVersion(); draw(); }));
$("cswald-reset").addEventListener("click", () => { setParams(pairs, start(version())); draw(); });
$("cswald-copy").addEventListener("click", () => navigator.clipboard?.writeText($("cswald-code").textContent));
pairs.zr.setBounds({ min: -0.9, max: 0.9, step: 0.02, scale: LOGIT });
applyVersion();
draw();
initInfo();
initA11y();
