// Page script for models/sdt_yn.qmd: yes/no signal detection under bmm's four evidence distributions, with the
// boundary given as criterion (from the noise location) or bias (from the midpoint).
import { ynLogPOld, dsdtYn, ynRoc, evidencePdf, separation, biasToCriterion, criterionToBias, sdtD, DISTS } from "../models/sdt.js";
import { bindParams, readParams, setParams, fmt, LINEAR, LOG } from "../lib/widget.js";
import { barPlot, el } from "../lib/plot.js";
import { latentPlot, dragLines, rocPlot, NOISE, SIGNAL } from "../lib/sdt-plot.js";
import { initInfo } from "../lib/info.js";
import { describePlot, initA11y } from "../lib/a11y.js";
import { simControls, markBars, pair, simLine } from "../lib/sim-panel.js";
import { ynSample } from "../lib/simulate.js";

// bmm's default priors for sdt_yn(), [mean, sd] on the link scale: identity, log for sdratio. The sliders
// span mean +- 3 SD; the prior means are the starting values and the dashed reference.
const PRIOR = { d: [1, 1], criterion: [0.5, 1.5], bias: [0, 1.5], sdratio: [0, 0.3] };
const PRIOR_MEANS = { d: 1, criterion: 0.5, bias: 0, sdratio: 1 };
const STEP = 0.05;
// The sliders reach criterion -6.38 to 8.26 (bias -4.5 to 4.5 plus half the separation at d -2 or 4 and
// sdratio 2.46, the slider's top) and put the signal between -3.76 and 7.51; the margin keeps the line's label
// inside the panel.
const XLIM = [-7.5, 9.5];
const LABEL = { criterion: "criterion, from the noise location", bias: "bias, from the midpoint" };

const $ = id => document.getElementById(id);
const pairs = bindParams({ d: ["sdtyn-d", "sdtyn-d-num"], k: ["sdtyn-k", "sdtyn-k-num"], sdratio: ["sdtyn-s", "sdtyn-s-num"] }, draw);
const anchorInputs = [...document.querySelectorAll('input[name="sdtyn-anchor"]')];
const anchor = () => anchorInputs.find(r => r.checked).value;
const dist = () => $("sdtyn-dist").value;
let shownAnchor = "criterion", latent = null;

// The current values with the boundary as the criterion, the form the model computes with.
function values() {
  const { d, k, sdratio } = readParams(pairs);
  return { d, sdratio, dist: dist(), k, criterion: anchor() === "criterion" ? k : biasToCriterion(k, d, sdratio) };
}
const rates = v => [0, 1].map(stim => Math.exp(ynLogPOld(v, stim)));
const prior = () => ({ d: PRIOR_MEANS.d, sdratio: PRIOR_MEANS.sdratio, criterion: PRIOR_MEANS.criterion, dist: dist() });

function problems(v) {
  const out = [];
  const bad = ["d", "k"].filter(key => !Number.isFinite(v[key]));
  if (bad.length) out.push([bad, `d and ${anchor()} must be numbers.`]);
  if (!(v.sdratio > 0 && Number.isFinite(v.sdratio))) out.push([["sdratio"], "sdratio must be a number above 0."]);
  // Past about 1e306 the axis arithmetic overflows to Infinity.
  else if (!out.length && ![separation(v.d, v.sdratio), v.criterion].every(x => Math.abs(x) < 1e300)) {
    out.push([["d", "k", "sdratio"], "These values put the signal or the boundary too far out to draw."]);
  }
  return out;
}

function drawLatent(v, [fa, hit]) {
  const delta = separation(v.d, v.sdratio), mid = delta / 2;
  // Every standard density here has its mode at 0, so a density with scale s peaks at pdf(0) / s.
  const peak = s => DISTS[v.dist].pdf(0) / s;
  // The axis stays put; it grows only when a narrow signal density would leave it.
  const ymax = Math.max(0.5, 1.15 * Math.max(peak(1), peak(v.sdratio)));
  const right = v.criterion < 6.5;
  // The x axis grows only for a criterion the sliders cannot reach (a typed value, or a bias an anchor switch
  // left outside its slider range), so the line stays where the rates are computed; the margin past the line
  // grows with the axis so that its label stays inside.
  const xlim = [v.criterion - 1 < XLIM[0] ? v.criterion - Math.max(3, (XLIM[1] - v.criterion) / 8) : XLIM[0],
    v.criterion + 1 > XLIM[1] ? v.criterion + Math.max(3, (v.criterion - XLIM[0]) / 8) : XLIM[1]];
  // Ticks on the round step (1, 2 or 5 times a power of 10) nearest to an eighth of the axis: 5 to 13 ticks.
  const raw = (xlim[1] - xlim[0]) / 8, mag = 10 ** Math.floor(Math.log10(raw));
  const tick = [1, 2, 5, 10].map(m => m * mag).reduce((a, b) => (Math.abs(Math.log(b / raw)) < Math.abs(Math.log(a / raw)) ? b : a));
  const first = Math.ceil(xlim[0] / tick);
  latent = latentPlot($("sdtyn-latent"), {
    xlim, xticks: Array.from({ length: Math.floor(xlim[1] / tick) - first + 1 }, (_, i) => +((first + i) * tick).toPrecision(12)),
    xlab: "Evidence (noise at 0, noise scale 1)", ymax,
    curves: [
      { f: x => evidencePdf(x, v, 0), color: NOISE, shade: [v.criterion, xlim[1]] },
      { f: x => evidencePdf(x, v, 1), color: SIGNAL, shade: [v.criterion, xlim[1]] }
    ],
    lines: [
      { x: v.criterion, drag: true, label: `${anchor()} = ${fmt(v.k, 2)}`, aria: anchor() },
      ...(anchor() === "bias" ? [{ x: mid, width: 2, dash: "3 6", color: "#5a6472" }] : [])
    ],
    notes: [
      { x: 0, density: peak(1), text: "noise", color: NOISE },
      { x: delta, density: peak(v.sdratio), text: "signal", color: SIGNAL },
      { x: v.criterion + (right ? 0.2 : -0.2), y: 120, anchor: right ? "start" : "end", text: `false alarms ${fmt(fa, 2)}`, color: NOISE },
      { x: v.criterion + (right ? 0.2 : -0.2), y: 146, anchor: right ? "start" : "end", text: `hits ${fmt(hit, 2)}`, color: SIGNAL },
      ...(anchor() === "bias" ? [{ x: mid, y: 70, text: "midpoint", color: "#5a6472" }] : [])
    ]
  });
}

// The simulated sample: half of the trials noise, half signal, each "old" when its uniform falls below the rate.
const sim = simControls("sdtyn", draw);

function drawBars(cur, ref, got) {
  const svg = $("sdtyn-bars");
  const { rects, sy } = barPlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 22, b: 44 }, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    categories: ["noise: false alarms", "signal: hits"], ylab: 'P("old")', groups: [{ values: cur }]
  });
  rects[0].forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    r.setAttribute("fill", [NOISE, SIGNAL][i]);
    el("rect", { x, y: sy(ref[i]), width: w, height: sy(0) - sy(ref[i]), fill: "none", stroke: "#222", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    // The value label clears the sample mark's halo and sits no higher than over a full bar (digits have no
    // descenders, so it still clears a mark at 1).
    const y = Math.max(sy(1) - 6, Math.min(sy(Math.max(cur[i], ref[i])) - 6, got ? sy(got[i]) - 8 : Infinity));
    el("text", { x: x + w / 2, y, "text-anchor": "middle", class: "tick" }, svg)
      .textContent = fmt(cur[i], 2);
  });
  if (got) markBars(svg, rects[0], sy, got);
  simLine(sim, () => `Expected (this sample of ${sim.n / 2} noise and ${sim.n / 2} signal trials): ` +
    `false alarms ${pair(cur[0], got[0])}, hits ${pair(cur[1], got[1])}.`);
}

// The ROC of the current d and sdratio, the prior means' (dashed) and, under unequal scales, the
// equal-variance ROC through the current point (dotted): same criterion, d from sdt_d() of the two rates.
function drawRoc(v, [fa, hit], got) {
  const evD = sdtD(hit, fa, v.dist), unequal = v.sdratio !== 1 && Number.isFinite(evD);
  rocPlot($("sdtyn-roc"), {
    curves: [
      { pts: ynRoc(prior()), color: "#5a6472", dashed: true, width: 2.5 },
      ...(unequal ? [{ pts: ynRoc({ d: evD, sdratio: 1, dist: v.dist }), color: "#5a6472", dotted: true, width: 2.5 }] : []),
      { pts: ynRoc(v), color: "#222" }
    ],
    points: [{ fa, hit }, ...(got ? [{ fa: got[0], hit: got[1], r: 6, fill: "#000", color: "#000", label: "sample" }] : [])]
  });
  $("sdtyn-roc-legend").textContent = "Solid: this d and sdratio; circle: the current criterion; dashed: bmm's prior means" +
    (unequal ? `; dotted: equal variance through the circle (d = ${fmt(evD, 2)})` : "") + (got ? "; black: the simulated sample" : "") + "; grey: chance.";
  $("sdtyn-across-now").textContent = !Number.isFinite(evD)
    ? `With the current values a rate rounds to 0 or 1, and sdt_d() has no finite value.`
    : v.sdratio === 1
      ? `With the current values, false alarms ${fmt(fa, 2)} and hits ${fmt(hit, 2)}, sdratio is 1, so the equal-variance observer is this one: sdt_d() of the two rates returns d itself, ${fmt(evD, 2)}. Move sdratio away from 1 to see the dotted curve.`
      : `With the current values, false alarms ${fmt(fa, 2)} and hits ${fmt(hit, 2)}, the equal-variance observer has d = ${fmt(evD, 2)} instead of ${fmt(v.d, 2)}.`;
}

function drawCode(v, [fa, hit]) {
  const n = [Math.round(100 * fa), Math.round(100 * hit)], a = anchor();
  const formula = v.sdratio === 1
    ? `bmf(d ~ 1, ${a} ~ 1)`
    : a === "criterion" ? "bmf(d ~ 1, criterion ~ 0 + condition, sdratio ~ 1)" : "bmf(d ~ 0 + condition, bias ~ 1, sdratio ~ 1)";
  const why = v.sdratio === 1 ? ""
    : a === "criterion"
      ? "# sdratio needs a criterion that moves between conditions while d does not, e.g. a base-rate\n# manipulation in a column condition; a criterion that is the same in every row does not identify it\n"
      : "# with bias held constant, a d that moves between conditions (column condition) traces the ROC\n";
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("sdtyn-code").textContent =
`library(bmm)
model <- sdt_yn(response = "n_old", stimulus = "stimulus", n_trials = "n_trials", dist = "${v.dist}")

# log likelihood of the "old" counts in two rows of 100 trials each, noise and signal, at the
# counts predicted (one value per row). sdratio is the ratio itself; sdt_yn() estimates its log.
dsdt_yn(n_old = c(${n.join(", ")}), n_trials = 100, stimulus = c(0, 1),
        d = ${v.d}, ${a} = ${v.k}, sdratio = ${v.sdratio}, dist = "${v.dist}", log = TRUE)
${sim.on ? `
# simulate ${sim.n / 2} noise and ${sim.n / 2} signal trials: the "old" count on noise, then on signal trials
rsdt_yn(n = 2, n_trials = ${sim.n / 2}, stimulus = c(0, 1),
        d = ${v.d}, ${a} = ${v.k}, sdratio = ${v.sdratio}, dist = "${v.dist}")
` : ""}
# fit: one row per participant, condition and stimulus, columns n_old, n_trials, stimulus
${why}fit <- bmm(formula = ${formula}, data = my_data, model = model)`;
  $("sdtyn-code").dataset.logd = JSON.stringify(n.map((k, stim) => dsdtYn(k, 100, stim, v)));
}

function draw() {
  const t0 = performance.now();
  const v = values(), bad = problems(v);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["sdtyn-widget", "sdtyn-code", "sdtyn-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("sdtyn-range-hint").textContent = bad.length ? bad.map(b => b[1]).join(" ")
    : "Sliders: bmm's prior mean ± 3 SD. sdratio moves on the log scale; the box shows the ratio.";
  if (bad.length) { sim.text.hidden = true; return; }
  const cur = rates(v);
  drawLatent(v, cur);
  const got = sim.on ? ynSample(cur, sim.us) : null;
  drawBars(cur, rates(prior()), got);
  drawRoc(v, cur, got);
  drawCode(v, cur);
  describePlot($("sdtyn-latent"), `Noise and signal evidence densities with d ${fmt(v.d)} and the criterion at ${fmt(v.criterion)}: ` +
    `false-alarm rate ${fmt(cur[0])}, hit rate ${fmt(cur[1])}.`);
  describePlot($("sdtyn-bars"), `Predicted false-alarm rate ${fmt(cur[0])} on noise trials, hit rate ${fmt(cur[1])} on signal trials.`);
  describePlot($("sdtyn-roc"), `Hit rate ${fmt(cur[1])} at false-alarm rate ${fmt(cur[0])} for the current criterion.`);
  $("sdtyn-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// Switching between criterion and bias keeps the boundary where it is and gives its position from the other
// point, rounded to what the box shows.
function applyAnchor() {
  const a = anchor(), { d, k, sdratio } = readParams(pairs), [m, sd] = PRIOR[a];
  pairs.k.setBounds({ min: m - 3 * sd, max: m + 3 * sd, step: STEP });
  $("sdtyn-k-label").textContent = LABEL[a];
  pairs.k.num.setAttribute("aria-label", a);
  // A conversion that is not a number (an invalid d or sdratio) keeps the box as typed.
  const moved = a === "bias" ? criterionToBias(k, d, sdratio) : biasToCriterion(k, d, sdratio);
  if (a !== shownAnchor && Number.isFinite(moved)) pairs.k.value = +moved.toFixed(2);
  shownAnchor = a;
}

// Dragging the criterion line sets the boundary in the selected parametrisation, within its slider range. An
// arrow key moves by one step from the value in use; outside the slider range it moves only towards it.
const clampK = x => Math.min(+pairs.k.range.max, Math.max(+pairs.k.range.min, x));
dragLines($("sdtyn-latent"), {
  plot: () => latent,
  active: () => !$("sdtyn-widget").classList.contains("ex-stale"),
  move: (i, x) => {
    const v = values();
    pairs.k.value = +clampK(anchor() === "criterion" ? x : criterionToBias(x, v.d, v.sdratio)).toFixed(2);
    draw();
  },
  step: (i, sign) => {
    const k = pairs.k.value, lo = Math.min(+pairs.k.range.min, k), hi = Math.max(+pairs.k.range.max, k);
    pairs.k.value = +Math.min(hi, Math.max(lo, k + sign * STEP)).toFixed(2);
    draw();
  }
});

anchorInputs.forEach(i => i.addEventListener("change", () => { applyAnchor(); draw(); }));
$("sdtyn-dist").addEventListener("change", draw);
$("sdtyn-reset").addEventListener("click", () => {
  setParams(pairs, { d: PRIOR_MEANS.d, k: PRIOR_MEANS[anchor()], sdratio: PRIOR_MEANS.sdratio });
  sim.reset();
  draw();
});
$("sdtyn-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdtyn-code").textContent));
pairs.d.setBounds({ min: PRIOR.d[0] - 3 * PRIOR.d[1], max: PRIOR.d[0] + 3 * PRIOR.d[1], step: STEP, scale: LINEAR });
// 3 * 0.3 is 0.8999999999999999 in floating point, which puts the top of the slider's 0.02 grid at 0.88.
const LOG_SD3 = +(3 * PRIOR.sdratio[1]).toFixed(2);
pairs.sdratio.setBounds({ min: -LOG_SD3, max: LOG_SD3, step: 0.02, scale: LOG });
applyAnchor();
setParams(pairs, { d: PRIOR_MEANS.d, k: PRIOR_MEANS.criterion, sdratio: PRIOR_MEANS.sdratio });
draw();
initInfo();
initA11y();
