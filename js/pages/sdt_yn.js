// Page script for models/sdt_yn.qmd: yes/no signal detection under bmm's four evidence distributions, with the
// boundary given as criterion (from the noise location) or bias (from the midpoint).
import { ynLogPOld, dsdtYn, ynRoc, evidencePdf, separation, biasToCriterion, criterionToBias, sdtD, DISTS } from "../models/sdt.js";
import { bindParams, readParams, setParams, fmt, LINEAR, LOG } from "../lib/widget.js";
import { barPlot, el } from "../lib/plot.js";
import { latentPlot, dragLines, rocPlot, NOISE, SIGNAL } from "../lib/sdt-plot.js";

// bmm's default priors for sdt_yn(), [mean, sd] on the link scale: identity, log for sdratio. The sliders
// span mean +- 3 SD; the prior means are the starting values and the dashed reference.
const PRIOR = { d: [1, 1], criterion: [0.5, 1.5], bias: [0, 1.5], sdratio: [0, 0.3] };
const PRIOR_MEANS = { d: 1, criterion: 0.5, bias: 0, sdratio: 1 };
const STEP = 0.05;
const XLIM = [-5, 9];
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
  return out;
}

function drawLatent(v, [fa, hit]) {
  const delta = separation(v.d, v.sdratio), mid = delta / 2;
  // Every standard density here has its mode at 0, so a density with scale s peaks at pdf(0) / s.
  const peak = s => DISTS[v.dist].pdf(0) / s;
  // The axis stays put; it grows only when a narrow signal density would leave it.
  const ymax = Math.max(0.5, 1.15 * Math.max(peak(1), peak(v.sdratio)));
  const right = v.criterion < 6.5;
  latent = latentPlot($("sdtyn-latent"), {
    xlim: XLIM, xticks: [-4, -2, 0, 2, 4, 6, 8], xlab: "Evidence (noise at 0, noise scale 1)", ymax,
    curves: [
      { f: x => evidencePdf(x, v, 0), color: NOISE, shade: [v.criterion, XLIM[1]] },
      { f: x => evidencePdf(x, v, 1), color: SIGNAL, shade: [v.criterion, XLIM[1]] }
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

function drawBars(cur, ref) {
  const svg = $("sdtyn-bars");
  const { rects, sy } = barPlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 22, b: 44 }, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    categories: ["noise: false alarms", "signal: hits"], ylab: 'P("old")', groups: [{ values: cur }]
  });
  rects[0].forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    r.setAttribute("fill", [NOISE, SIGNAL][i]);
    el("rect", { x, y: sy(ref[i]), width: w, height: sy(0) - sy(ref[i]), fill: "none", stroke: "#222", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    el("text", { x: x + w / 2, y: sy(Math.max(cur[i], ref[i])) - 6, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt(cur[i], 2);
  });
}

// The ROC of the current d and sdratio, the prior means' (dashed) and, under unequal scales, the
// equal-variance ROC through the current point (dotted): same criterion, d from sdt_d() of the two rates.
function drawRoc(v, [fa, hit]) {
  const evD = sdtD(hit, fa, v.dist), unequal = v.sdratio !== 1 && Number.isFinite(evD);
  rocPlot($("sdtyn-roc"), {
    curves: [
      { pts: ynRoc(prior()), color: "#5a6472", dashed: true, width: 2.5 },
      ...(unequal ? [{ pts: ynRoc({ d: evD, sdratio: 1, dist: v.dist }), color: "#5a6472", dotted: true, width: 2.5 }] : []),
      { pts: ynRoc(v), color: "#222" }
    ],
    points: [{ fa, hit }]
  });
  $("sdtyn-roc-legend").textContent = "Solid: this d and sdratio; circle: the current criterion; dashed: bmm's prior means" +
    (unequal ? `; dotted: equal variance through the circle (d = ${fmt(evD, 2)})` : "") + "; grey: chance.";
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
  if (bad.length) return;
  const cur = rates(v);
  drawLatent(v, cur);
  drawBars(cur, rates(prior()));
  drawRoc(v, cur);
  drawCode(v, cur);
  $("sdtyn-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// Switching between criterion and bias keeps the boundary where it is and gives its position from the other
// point, rounded to what the box shows.
function applyAnchor() {
  const a = anchor(), { d, k, sdratio } = readParams(pairs), [m, sd] = PRIOR[a];
  pairs.k.setBounds({ min: m - 3 * sd, max: m + 3 * sd, step: STEP });
  $("sdtyn-k-label").textContent = LABEL[a];
  pairs.k.num.setAttribute("aria-label", a);
  if (a !== shownAnchor && Number.isFinite(k)) {
    pairs.k.value = +(a === "bias" ? criterionToBias(k, d, sdratio) : biasToCriterion(k, d, sdratio)).toFixed(2);
  }
  shownAnchor = a;
}

// Dragging the criterion line sets the boundary in the selected parametrisation, within its slider range.
const clampK = x => Math.min(+pairs.k.range.max, Math.max(+pairs.k.range.min, x));
dragLines($("sdtyn-latent"), {
  plot: () => latent,
  active: () => !$("sdtyn-widget").classList.contains("ex-stale"),
  move: (i, x) => {
    const v = values();
    pairs.k.value = +clampK(anchor() === "criterion" ? x : criterionToBias(x, v.d, v.sdratio)).toFixed(2);
    draw();
  },
  step: (i, sign) => { pairs.k.value = +clampK(pairs.k.value + sign * STEP).toFixed(2); draw(); }
});

anchorInputs.forEach(i => i.addEventListener("change", () => { applyAnchor(); draw(); }));
$("sdtyn-dist").addEventListener("change", draw);
$("sdtyn-reset").addEventListener("click", () => {
  setParams(pairs, { d: PRIOR_MEANS.d, k: PRIOR_MEANS[anchor()], sdratio: PRIOR_MEANS.sdratio });
  draw();
});
$("sdtyn-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdtyn-code").textContent));
pairs.d.setBounds({ min: PRIOR.d[0] - 3 * PRIOR.d[1], max: PRIOR.d[0] + 3 * PRIOR.d[1], step: STEP, scale: LINEAR });
pairs.sdratio.setBounds({ min: -3 * PRIOR.sdratio[1], max: 3 * PRIOR.sdratio[1], step: 0.02, scale: LOG });
applyAnchor();
setParams(pairs, { d: PRIOR_MEANS.d, k: PRIOR_MEANS.criterion, sdratio: PRIOR_MEANS.sdratio });
draw();
