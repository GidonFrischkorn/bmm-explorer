// Page script for models/ddm.qmd: the Wiener diffusion model, dddm().
import { dddm, ezdmMoments4par } from "../models/rt.js";
import { bindParams, readParams, setParams, fmt, rValue, LINEAR, LOG, LOGIT } from "../lib/widget.js";
import { linePlot, el } from "../lib/plot.js";
import { drawDiffusion, mirroredDensity, timeAxis, rtGrid, BLUE, ORANGE } from "../lib/rt-plot.js";
import { autoAxis, niceAxis } from "../lib/axis.js";
import { initInfo } from "../lib/info.js";
import { simControls, rtLine, RT_BINS } from "../lib/sim-panel.js";
import { ddmSim, rtStats, rtHistogram } from "../lib/simulate-rt.js";

// bmm's default priors for ddm(), [mean, sd, scale] on the link scale; the sliders span mean +- 3 SD and
// start at the means. drift's cauchy(0, 1) has no SD; its slider spans location +- 3 scale.
const PRIOR = { drift: [0, 1, LINEAR, 0.05], bound: [0, 0.5, LOG, 0.02], ndt: [-1.5, 0.5, LOG, 0.02], zr: [0, 0.5, LOGIT, 0.02] };
const START = Object.fromEntries(Object.entries(PRIOR).map(([k, [m, , sc]]) => [k, sc.fromRange(m)]));

const $ = id => document.getElementById(id);
const pairs = bindParams(Object.fromEntries(Object.keys(PRIOR).map(k => [k, [`ddm-${k}`, `ddm-${k}-num`]])), draw);
for (const [k, [m, sd, scale, step]] of Object.entries(PRIOR)) pairs[k].setBounds({ min: m - 3 * sd, max: m + 3 * sd, step, scale });

// [field, message] for each value the densities are not defined at.
const problems = p => [
  ["drift", Number.isFinite(p.drift), "drift a number"], ["bound", p.bound > 0, "bound positive"],
  ["ndt", p.ndt > 0, "ndt positive"], ["zr", p.zr > 0 && p.zr < 1, "zr between 0 and 1"]
].filter(([, ok]) => !ok).map(([k, , msg]) => [k, msg]);

// The moments the EZ map gives for the same process: P(upper) and the mean decision time at each boundary.
function summary(p) {
  const m = ezdmMoments4par({ drift: p.drift, bound: p.bound, zr: p.zr });
  const meanRt = p.ndt + m.pC * m.mdt_upper + (1 - m.pC) * m.mdt_lower;
  return { ...m, rtUpper: p.ndt + m.mdt_upper, rtLower: p.ndt + m.mdt_lower, meanRt,
    tEnd: p.ndt + Math.max(m.mdt_upper, m.mdt_lower) + 3 * Math.sqrt(Math.max(m.vrt_upper, m.vrt_lower)) };
}

// The time axis is shared by the task drawing and the densities; the speed-accuracy panel has its own.
const timeAuto = autoAxis(draw, { nice: niceAxis }), satAuto = autoAxis(draw, { nice: niceAxis }), densityAxis = autoAxis(draw);
// The simulated sample: two uniforms per trial, one for the response and one for its rt (simulate-rt.js, ddmSim()).
const sim = simControls("ddm", draw, 2);

function drawDensity(p, axis) {
  const x = rtGrid(axis.xlim), dens = (q, r) => dddm(x, { ...q, response: r }).map(Math.exp);
  let bars;
  if (sim.on) {
    const model = ddmSim(p), draws = model.draw(sim.us);
    rtLine(sim, model.expected, rtStats(draws));
    bars = rtHistogram(draws, axis.xlim, RT_BINS);
  } else sim.text.hidden = true;
  mirroredDensity($("ddm-density"), {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, ...axis, x, axis: densityAxis, bars,
    upper: [{ y: dens(START, 1), color: BLUE, dashed: true }, { y: dens(p, 1), color: BLUE }],
    lower: [{ y: dens(START, 0), color: ORANGE, dashed: true }, { y: dens(p, 0), color: ORANGE }]
  });
}

// P(upper) against mean RT as bound runs over its slider range, the other parameters as set.
const BOUNDS = Array.from({ length: 41 }, (_, i) => Math.exp(-1.5 + 3 * i / 40));
function drawSpeedAccuracy(p, s) {
  const sweep = q => BOUNDS.map(b => summary({ ...q, bound: b }));
  const cur = sweep(p), ref = sweep(START);
  const axis = timeAxis(Math.max(...cur.map(c => c.meanRt), ...ref.map(c => c.meanRt)), satAuto);
  const svg = $("ddm-sat");
  const { sx, sy } = linePlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, ...axis, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    xlab: "mean rt (s)", ylab: "P(upper)",
    series: [{ x: ref.map(c => c.meanRt), y: ref.map(c => c.pC), color: "#222", dashed: true, width: 2 },
             { x: cur.map(c => c.meanRt), y: cur.map(c => c.pC), color: BLUE }]
  });
  for (const [c, label, anchor] of [[cur[0], `bound ${fmt(BOUNDS[0], 2)}`, "start"], [cur[40], `bound ${fmt(BOUNDS[40], 1)}`, "end"]])
    el("text", { x: sx(c.meanRt) + (anchor === "start" ? 8 : -8), y: sy(c.pC) + (c.pC > 0.85 ? 24 : -12), "text-anchor": anchor, class: "tick" }, svg).textContent = label;
  el("circle", { cx: sx(s.meanRt), cy: sy(s.pC), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, svg);
}

// R code: plain ASCII digits and minus, so the snippet pastes into R unchanged. The densities in the comment
// are taken at the printed values (rValue), so they are what R returns for the call as shown.
function drawCode(p, s) {
  const q = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, rValue(v, k === "zr")]));
  // Each rt is the printed ndt plus the response's mean decision time, to 3 decimals. A zr near 0 or 1 puts
  // one mean decision time below 0.0005 s, and 3 decimals would print rt = ndt, where the density is 0 and
  // the log density -Inf; that rt takes as many more decimals as keep it above ndt.
  const rts = [s.mdt_upper, s.mdt_lower].map(mdt => {
    for (let d = 3; ; d++) {
      const rt = +(q.ndt + mdt).toFixed(d);
      if (rt > q.ndt || d >= 20) return rt;
    }
  });
  const ll = [dddm(rts[0], { ...q, response: 1 }), dddm(rts[1], { ...q, response: 0 })];
  const freeZr = q.zr !== 0.5;
  $("ddm-code").textContent =
`library(bmm)
model <- ddm(rt = "rt", response = "response")

# log density of an upper (1) and a lower (0) response, each at its predicted mean rt
dddm(rt = c(${rts.join(", ")}), response = c(1, 0),
     drift = ${q.drift}, bound = ${q.bound}, ndt = ${q.ndt}, zr = ${q.zr})
# ${ll.map(v => v.toFixed(4)).join("  ")}

${sim.on ? `# simulate ${sim.n} trials: P(upper), and the mean and SD of rt for each response (0 lower, 1 upper)
y <- rddm(n = ${sim.n}, drift = ${q.drift}, bound = ${q.bound}, ndt = ${q.ndt}, zr = ${q.zr})
c(p_upper = mean(y$response), mean_rt = tapply(y$rt, y$response, mean), sd_rt = tapply(y$rt, y$response, sd))

` : ""}# fit: one row per trial, rt in seconds, response 0 or 1
fit <- bmm(formula = bmf(drift ~ 1, bound ~ 1, ndt ~ 1${freeZr ? ", zr ~ 1" : ""}), data = my_data, model = model)${freeZr
  ? "\n# zr ~ 1 estimates the starting point; without it bmm fixes zr at 0.5" : ""}`;
}

function draw() {
  const t0 = performance.now();
  const p = readParams(pairs), bad = problems(p);
  for (const [k, pair] of Object.entries(pairs)) {
    const off = bad.some(([f]) => f === k);
    pair.num.classList.toggle("ex-invalid", off);
    pair.num.setAttribute("aria-invalid", off);
  }
  for (const id of ["ddm-widget", "ddm-code"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("ddm-hint").textContent = bad.length ? `Needed: ${bad.map(([, msg]) => msg).join(", ")}.`
    : "bound, ndt: log scale; zr: logit scale. The boxes show the values.";
  if (bad.length) { sim.text.hidden = true; return; }
  const s = summary(p), axis = timeAxis(Math.max(s.tEnd, summary(START).tEnd), timeAuto);
  drawDiffusion($("ddm-task"), { mode: "ddm", ...p, ...axis });
  drawDensity(p, axis);
  $("ddm-readout").textContent = `P(upper) = ${fmt(s.pC, 2)}; mean rt ${fmt(s.rtUpper, 2)} s upper, ${fmt(s.rtLower, 2)} s lower.`;
  drawSpeedAccuracy(p, s);
  drawCode(p, s);
  $("ddm-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

$("ddm-reset").addEventListener("click", () => { setParams(pairs, START); sim.reset(); draw(); });
$("ddm-copy").addEventListener("click", () => navigator.clipboard?.writeText($("ddm-code").textContent));
setParams(pairs, START);
draw();
initInfo();
