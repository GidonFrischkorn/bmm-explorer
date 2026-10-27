// Page script for models/sdt_rating.qmd: confidence-rating signal detection with K - 1 thresholds set one by
// one, kept in order by the controls.
import { ratingLogProbs, dsdtRating, ynRoc, evidencePdf, separation, parsimoniousThresholds, toLogDistance, DISTS } from "../models/sdt.js";
import { bindPair, bindParams, readParams, setParams, fmt, LINEAR, LOG } from "../lib/widget.js";
import { barPlot, el, clipped } from "../lib/plot.js";
import { latentPlot, dragLines, rocPlot, NOISE, SIGNAL } from "../lib/sdt-plot.js";
import { autoAxis } from "../lib/axis.js";
import { initInfo } from "../lib/info.js";

// bmm's default priors for sdt_rating(), [mean, sd] on the link scale: d normal(1, 1); sdratio, a log ratio,
// normal(0, 0.3). The threshold sliders span the criterion's prior, normal(0.5, 1.5), mean +- 3 SD.
const PRIOR = { d: [1, 1], sdratio: [0, 0.3], criterion: [0.5, 1.5] };
const T_MIN = PRIOR.criterion[0] - 3 * PRIOR.criterion[1], T_MAX = PRIOR.criterion[0] + 3 * PRIOR.criterion[1];
const STEP = 0.05, K_MAX = 8, START = { d: 1, sdratio: 1, K: 6 };
const XLIM = [-5, 9];

const $ = id => document.getElementById(id);
const pairs = bindParams({ d: ["sdtrating-d", "sdtrating-d-num"], sdratio: ["sdtrating-s", "sdtrating-s-num"] }, draw);
// A new K starts from bmm's default thresholds for that K, before the redraw.
const kPair = bindPair("sdtrating-k", "sdtrating-k-num", () => { applyK(); draw(); });
// A slider move places its threshold first (pushing the neighbours), then the pair copies the value to its box
// and redraws: this listener is registered before the pair's own.
const T = Array.from({ length: K_MAX - 1 }, (_, i) => {
  $(`sdtrating-t${i + 1}`).addEventListener("input", e => place(i, +e.target.value));
  return bindPair(`sdtrating-t${i + 1}`, `sdtrating-t${i + 1}-num`, draw);
});
const dist = () => $("sdtrating-dist").value;
const round2 = v => +v.toFixed(2);
let latent = null;

const kOf = () => kPair.value;
const thresholds = () => T.slice(0, kOf() - 1).map(p => p.value);
// Start values: bmm's parsimonious thresholds at the prior means, rounded to what the boxes show.
const startThresholds = K => parsimoniousThresholds(K).map(round2);

// Moves threshold i to v within the slider range, leaving room for its neighbours, and pushes the neighbours
// it runs into so that every interval stays at least one step wide.
function place(i, v) {
  const K = kOf(), t = thresholds();
  t[i] = round2(Math.min(T_MAX - STEP * (K - 2 - i), Math.max(T_MIN + STEP * i, v)));
  for (let j = i + 1; j < K - 1; j++) t[j] = round2(Math.max(t[j], t[j - 1] + STEP));
  for (let j = i - 1; j >= 0; j--) t[j] = round2(Math.min(t[j], t[j + 1] - STEP));
  t.forEach((x, j) => { T[j].value = x; });
}

function problems(p, t) {
  const out = [];
  if (!(Number.isInteger(p.K) && p.K >= 3 && p.K <= K_MAX)) return [[["K"], "sdtrating-k-hint", `K must be a whole number from 3 to ${K_MAX}.`]];
  if (!Number.isFinite(p.d)) out.push([["d"], "sdtrating-range-hint", "d must be a number."]);
  if (!(p.sdratio > 0 && Number.isFinite(p.sdratio))) out.push([["sdratio"], "sdtrating-range-hint", "sdratio must be a number above 0."]);
  // Past about 1e306 the drawing's arithmetic overflows to Infinity.
  else if (!out.length && !(Math.abs(separation(p.d, p.sdratio)) < 1e300)) {
    out.push([["d", "sdratio"], "sdtrating-range-hint", "d and sdratio put the signal too far out to draw."]);
  }
  // A pair out of order flags both of its boxes: either may be the one to change.
  const bad = [...new Set(t.flatMap((x, j) => (!Number.isFinite(x) ? [`t${j + 1}`]
    : j > 0 && !(x > t[j - 1]) ? [`t${j}`, `t${j + 1}`] : [])))];
  if (bad.length) out.push([bad, "sdtrating-range-hint", "Thresholds must be numbers that increase from t1 on."]);
  return out;
}

// The K category probabilities on noise and on signal trials.
const probs = (t, v) => [0, 1].map(stim => ratingLogProbs(t, v, stim).map(Math.exp));

function drawLatent(v, t) {
  const delta = separation(v.d, v.sdratio);
  const peak = s => DISTS[v.dist].pdf(0) / s;
  const edges = [XLIM[0], ...t, XLIM[1]].map(x => Math.min(XLIM[1], Math.max(XLIM[0], x)));
  latent = latentPlot($("sdtrating-latent"), {
    xlim: XLIM, xticks: [-4, -2, 0, 2, 4, 6, 8], xlab: "Evidence (noise at 0, noise scale 1)",
    ymax: Math.max(0.5, 1.15 * Math.max(peak(1), peak(v.sdratio))),
    curves: [{ f: x => evidencePdf(x, v, 0), color: NOISE }, { f: x => evidencePdf(x, v, 1), color: SIGNAL }],
    lines: t.map((x, j) => ({ x, drag: true, width: 2.5, aria: `threshold ${j + 1}` })),
    // the rating numbers centred in their intervals, where the interval is visible and wide enough
    notes: edges.slice(1).flatMap((hi, j) => (hi - edges[j] > 0.3 ? [{ x: (hi + edges[j]) / 2, y: 22, text: String(j + 1), color: "#5a6472" }] : []))
      .concat([{ x: 0, density: peak(1), text: "noise", color: NOISE }, { x: delta, density: peak(v.sdratio), text: "signal", color: SIGNAL }])
  });
}

// Rating proportions seldom pass 0.5: the axis ends at the next quarter above the tallest bar.
const barAxis = autoAxis(draw, { nice: m => {
  const top = Math.max(0.5, Math.ceil(4 * m) / 4);
  return { ylim: [0, top], yticks: [0, 0.25, 0.5, 0.75, 1].filter(y => y <= top) };
} });
function drawBars(cur, ref, K) {
  const svg = $("sdtrating-bars");
  const { rects, sy } = barPlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 14, b: 50 }, ...barAxis.next(Math.max(...cur.flat(), ...ref.flat())),
    categories: Array.from({ length: K }, (_, j) => String(j + 1)), xlab: "Rating", ylab: "Proportion",
    groups: [{ values: cur[0], color: NOISE }, { values: cur[1], color: SIGNAL }]
  });
  rects.forEach((grp, g) => grp.forEach((r, j) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    el("rect", { x, y: sy(ref[g][j]), width: w, height: sy(0) - sy(ref[g][j]), fill: "none", stroke: "#222", "stroke-width": 1.5, "stroke-dasharray": "5 4",
      ...clipped(svg) }, svg);
  }));
}

// P(rating >= j + 1) for each threshold j: one (false-alarm, hit) pair per threshold.
const cumulative = cur => cur[0].slice(1).map((_, j) => [0, 1].map(s => cur[s].slice(j + 1).reduce((a, b) => a + b, 0)));

function drawRoc(v, cur, ref) {
  const pts = cumulative(cur);
  rocPlot($("sdtrating-roc"), {
    curves: [
      { pts: ynRoc({ d: 1, sdratio: 1, dist: v.dist }), color: "#5a6472", dashed: true, width: 2.5 },
      { pts: ynRoc(v), color: "#222" }
    ],
    points: [
      ...cumulative(ref).map(([fa, hit]) => ({ fa, hit, r: 4, color: "#5a6472", fill: "#5a6472" })),
      ...pts.map(([fa, hit], j) => ({ fa, hit, label: `≥${j + 2}` }))
    ]
  });
  const K = v.K;
  $("sdtrating-across-now").textContent = `With K = ${K}, a condition gives ${K - 1} points and ${2 * (K - 1)} free proportions, ` +
    `for ${K + 1} parameters with sdratio estimated (d, sdratio, ${K - 1} thresholds). The code below estimates sdratio ` +
    `only when it differs from 1; otherwise it keeps it at 1.`;
}

function drawCode(v, t, cur) {
  const K = v.K, ld = toLogDistance(t);
  const counts = cur.map(split100);
  const r3 = x => +x.toFixed(3);
  const deltas = ld.deltas.map((x, j) => `delta${j + 1} = ${r3(x)}`).join(", ");
  const terms = ["d ~ 1", "criterion ~ 1", ...ld.deltas.map((_, j) => `delta${j + 1} ~ 1`), ...(v.sdratio === 1 ? [] : ["sdratio ~ 1"])];
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("sdtrating-code").textContent =
`library(bmm)
model <- sdt_rating(response = paste0("r", 1:${K}), stimulus = "stimulus",
                    threshold_type = "log_distance", dist = "${v.dist}")

# these thresholds as log_distance parameters, the scale bmm() estimates them on: criterion is
# ${K % 2 ? "the centre of the middle rating" : "the middle threshold"}, delta1 to delta${K - 2} the log widths of the intervals between thresholds
# criterion = ${r3(ld.criterion)}, ${deltas}

# log likelihood of 100 noise and 100 signal trials, here split as predicted (one value per row).
# sdratio is the ratio itself; sdt_rating() estimates its log.
dsdt_rating(counts = rbind(c(${counts[0].join(", ")}), c(${counts[1].join(", ")})), stimulus = c(0, 1),
            d = ${v.d}, thresholds = c(${t.join(", ")}), sdratio = ${v.sdratio}, dist = "${v.dist}", log = TRUE)

# fit: one row per participant, condition and stimulus, columns r1 to r${K} with the counts and stimulus.
# ${v.sdratio === 1 ? "sdratio stays fixed at 1 (equal variance) unless the formula names it" : "sdratio ~ 1 frees the ratio; one condition identifies it"}
fit <- bmm(formula = bmf(${terms.join(", ")}),
           data = my_data, model = model)`;
  $("sdtrating-code").dataset.logd = JSON.stringify(counts.map((c, s) => dsdtRating(c, s, t, v)));
}

// 100 trials split as predicted, rounded so the counts sum to 100.
function split100(pr) {
  const raw = pr.map(p => p * 100), k = raw.map(Math.floor);
  const order = raw.map((x, i) => [x - k[i], i]).sort((a, b) => b[0] - a[0]);
  const short = 100 - k.reduce((s, x) => s + x, 0);
  for (let j = 0; j < short; j++) k[order[j][1]]++;
  return k;
}

function draw() {
  const t0 = performance.now();
  const p = { ...readParams(pairs), K: kOf() };
  for (let j = 0; j < K_MAX - 1; j++) for (const e of document.querySelectorAll(`[data-thr="${j + 1}"]`)) e.hidden = !(j < p.K - 1);
  const t = Number.isInteger(p.K) && p.K >= 3 && p.K <= K_MAX ? thresholds() : [], bad = problems(p, t);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of [...Object.entries(pairs), ["K", kPair], ...T.map((q, j) => [`t${j + 1}`, q])]) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["sdtrating-widget", "sdtrating-code", "sdtrating-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("sdtrating-k-hint").textContent = "Ratings from 1, sure noise, to K, sure signal.";
  $("sdtrating-range-hint").textContent = "t: thresholds from the noise location. sdratio moves on the log scale.";
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) return;
  const v = { d: p.d, sdratio: p.sdratio, dist: dist(), K: p.K };
  const cur = probs(t, v), ref = probs(parsimoniousThresholds(p.K), { d: 1, sdratio: 1, dist: v.dist });
  drawLatent(v, t);
  drawBars(cur, ref, p.K);
  drawRoc(v, cur, ref);
  drawCode(v, t, cur);
  $("sdtrating-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

function applyK() {
  const K = kOf();
  if (Number.isInteger(K) && K >= 3 && K <= K_MAX) startThresholds(K).forEach((x, j) => { T[j].value = x; });
}

dragLines($("sdtrating-latent"), {
  plot: () => latent,
  active: () => !$("sdtrating-widget").classList.contains("ex-stale"),
  move: (i, x) => { place(i, x); draw(); },
  step: (i, sign) => { place(i, T[i].value + sign * STEP); draw(); }
});
$("sdtrating-dist").addEventListener("change", draw);
$("sdtrating-reset").addEventListener("click", () => {
  setParams(pairs, START);
  kPair.value = START.K;
  applyK();
  draw();
});
$("sdtrating-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdtrating-code").textContent));
pairs.d.setBounds({ min: PRIOR.d[0] - 3 * PRIOR.d[1], max: PRIOR.d[0] + 3 * PRIOR.d[1], step: STEP, scale: LINEAR });
// 3 * 0.3 is 0.8999999999999999 in floating point, which puts the top of the slider's 0.02 grid at 0.88.
const LOG_SD3 = +(3 * PRIOR.sdratio[1]).toFixed(2);
pairs.sdratio.setBounds({ min: -LOG_SD3, max: LOG_SD3, step: 0.02, scale: LOG });
for (const q of T) q.setBounds({ min: T_MIN, max: T_MAX, step: STEP });
setParams(pairs, START);
kPair.value = START.K;
applyK();
draw();
initInfo();
