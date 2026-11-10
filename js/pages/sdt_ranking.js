// Page script for models/sdt_ranking.qmd: ranking under bmm's two evidence distributions, the target's rank
// probabilities at this m and across m, with the other distribution matched on rank 1.
import { rankingRules, rankingProbs, dsdtRanking, rankingMatchD, evidencePdf, separation } from "../models/sdt.js";
import { bindParams, readParams, setParams, fmt, LINEAR, LOG } from "../lib/widget.js";
import { barPlot, linePlot, el, clear } from "../lib/plot.js";
import { split100 } from "../lib/math.js";
import { latentPlot, distSwatch, SIGNAL, DIST_COLOR, DIST_TEXT } from "../lib/sdt-plot.js";
import { initInfo } from "../lib/info.js";
import { describePlot, initA11y } from "../lib/a11y.js";
import { sdtRankingSummaries } from "../lib/summaries.js";
import { simControls, markBars, shareLine } from "../lib/sim-panel.js";
import { categoricalShares } from "../lib/simulate.js";

// bmm's ranking quadrature rules for normal noise, written from bmm by R/make_fixtures.R. Without them normal is
// switched off rather than computed on other nodes.
const RULES = await fetch(new URL("../../tests/parity/fixtures/nodes.json", import.meta.url))
  .then(r => (r.ok ? r.json() : null))
  .then(j => rankingRules(j?.cells))
  .catch(() => null);

// bmm's default priors for sdt_ranking(), [mean, sd] on the link scale: d normal(1, 1), identity; sdratio (normal only)
// normal(0, 0.3) on its log. The sliders span mean +- 3 SD and start at the means.
const PRIOR = { d: [1, 1], sdratio: [0, 0.3] };
const M_MAX = 8, START = { d: 1, m: 4, sdratio: 1 };
const GREY = "#595959", CHANCE = "#9aa3ad";
const XLIM = [-6, 10];
const M = Array.from({ length: M_MAX - 1 }, (_, i) => i + 2);
const OTHER = { gumbel_min: "normal", normal: "gumbel_min" };
// The matched distribution's lines: one dash for either distribution, apart from chance's dots.
const MATCH_DASH = "9 5";

const $ = id => document.getElementById(id);
const pairs = bindParams({ d: ["sdtrank-d", "sdtrank-d-num"], m: ["sdtrank-m", "sdtrank-m-num"], sdratio: ["sdtrank-s", "sdtrank-s-num"] }, draw);
const dist = () => $("sdtrank-dist").value;
// gumbel_min has no sdratio: its control hides and the model gets 1, as dsdt_ranking() ignores it there.
const values = () => { const p = readParams(pairs); return { ...p, sdratio: dist() === "normal" ? p.sdratio : 1 }; };
const probs = (q, ds = dist()) => rankingProbs(q.d, q.m, q.sdratio, ds, RULES);
const available = n => n === "gumbel_min" || RULES !== null;

function problems(q) {
  const out = [];
  if (!(Number.isInteger(q.m) && q.m >= 2 && q.m <= M_MAX)) out.push([["m"], "sdtrank-m-hint", `m must be a whole number from 2 to ${M_MAX}.`]);
  if (!Number.isFinite(q.d)) out.push([["d"], "sdtrank-range-hint", "d must be a number."]);
  else if (!(q.sdratio > 0 && Number.isFinite(q.sdratio))) out.push([["sdratio"], "sdtrank-range-hint", "sdratio must be a number above 0."]);
  return out;
}

// One trial: the m items as shown, then one order the observer could give them, the target second. The first rank
// goes to the last lure on the display, so the order differs from the display at every m.
function drawTiles(m) {
  const svg = $("sdtrank-tiles");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 440 250");
  const size = m > 6 ? 42 : 50, gap = 10, x0 = (440 - m * size - (m - 1) * gap) / 2, target = 1;
  const lures = Array.from({ length: m }, (_, i) => i).filter(i => i !== target);
  const order = [lures.at(-1), target, ...lures.slice(0, -1)];
  const tile = (x, y, i) => {
    const t = i === target;
    el("rect", { x, y, width: size, height: size, rx: 8, fill: t ? "#fbebe0" : "#f3f4f7", stroke: t ? SIGNAL : "#a3adb7", "stroke-width": t ? 4 : 2.5 }, svg);
    el("text", { x: x + size / 2, y: y + size / 2 + 9, "text-anchor": "middle", class: "task-letter", fill: t ? "#b04a00" : GREY }, svg)
      .textContent = String.fromCharCode(65 + i);
  };
  for (let i = 0; i < m; i++) tile(x0 + i * (size + gap), 22, i);
  el("text", { x: 220, y: 22 + size + 30, "text-anchor": "middle", class: "task-note" }, svg).textContent = "ranked, most likely target first:";
  order.forEach((i, r) => {
    const x = x0 + r * (size + gap), y = 22 + size + 44;
    tile(x, y, i);
    el("text", { x: x + size / 2, y: y + size + 24, "text-anchor": "middle", class: "sdt-note", fill: i === target ? "#b04a00" : GREY }, svg)
      .textContent = r + 1;
  });
  el("text", { x: 220, y: 242, "text-anchor": "middle", class: "task-note" }, svg).textContent = `the datum: the target's rank, here 2 of ${m}`;
}

function drawLatent(q) {
  const delta = separation(q.d, q.sdratio);
  latentPlot($("sdtrank-latent"), {
    W: 700, H: 250, xlim: XLIM, xticks: [-6, -4, -2, 0, 2, 4, 6, 8, 10], xlab: "Evidence (lures at 0, SD or scale 1)",
    curves: [
      { f: x => evidencePdf(x, { ...q, dist: dist() }, 0), color: GREY, dashed: true, width: 2.5 },
      { f: x => evidencePdf(x, { ...q, dist: dist() }, 1), color: SIGNAL }
    ],
    notes: [
      { x: delta + 0.8 * q.sdratio, density: evidencePdf(delta + 0.8 * q.sdratio, { ...q, dist: dist() }, 1), text: "target", color: SIGNAL, anchor: "start" },
      { x: -0.9, density: evidencePdf(-0.9, { ...q, dist: dist() }, 0), text: "lure", color: GREY, anchor: "end" }
    ]
  });
}

const sim = simControls("sdtrank", draw);
const rankLabels = m => Array.from({ length: m }, (_, i) => `rank ${i + 1}`);
function drawBars(q, cur, ref) {
  const svg = $("sdtrank-bars");
  const { rects, sx, sy } = barPlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 22, b: 50 }, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    categories: cur.map((_, i) => String(i + 1)), xlab: "Rank of the target", ylab: "Probability",
    groups: [{ values: cur, color: DIST_COLOR[dist()] }]
  });
  el("line", { x1: sx(0), x2: sx(q.m), y1: sy(1 / q.m), y2: sy(1 / q.m), stroke: CHANCE, "stroke-width": 2, "stroke-dasharray": "2 5" }, svg);
  const got = sim.on ? categoricalShares(cur, sim.us) : null;
  rects[0].forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    el("rect", { x, y: sy(ref[i]), width: w, height: sy(0) - sy(ref[i]), fill: "none", stroke: "#222", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    // The value clears the reference outline and the sample's mark, and stays inside the frame over a full bar.
    const y = Math.max(sy(1) - 6, Math.min(sy(Math.max(cur[i], ref[i])) - 6, got ? sy(got[i]) - 8 : Infinity));
    el("text", { x: x + w / 2, y, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt(cur[i], 2);
  });
  if (got) markBars(svg, rects[0], sy, got);
  shareLine(sim, rankLabels(q.m), cur, got);
}

// Rank 1 and the last rank across m with d fixed, the chosen distribution solid and the other one dotted at the d
// that gives it the same P(rank 1) at the current m; the ranks in between as grey dots, chance dotted.
function drawAcross(q, cur) {
  const ds = dist(), other = OTHER[ds];
  const mine = M.map(m => (m === q.m ? cur : probs({ ...q, m })));
  const logit = Math.log(cur[0]) - Math.log(cur.slice(1).reduce((a, b) => a + b, 0));
  const md = available(other) ? rankingMatchD(logit, q.m, 1, other, RULES) : NaN;
  const theirs = Number.isNaN(md) ? null : M.map(m => rankingProbs(md, m, 1, other, RULES));
  const lines = (ps, n, dash) => [
    { x: M, y: ps.map(p => p[0]), color: DIST_COLOR[n], ...(dash ? { width: 2.5 } : {}) },
    { x: M, y: ps.map(p => p.at(-1)), color: DIST_COLOR[n], ...(dash ? { width: 2.5 } : {}) }
  ];
  const svg = $("sdtrank-across");
  const { paths, sx, sy } = linePlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 58, t: 12, b: 50 }, xlim: [2, M_MAX], ylim: [0, 1],
    xticks: M, yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Items m", ylab: "P(target at rank)",
    series: [
      { x: M, y: M.map(m => 1 / m), color: CHANCE, width: 2 },
      ...(theirs ? lines(theirs, other, true) : []),
      ...lines(mine, ds, false)
    ]
  });
  paths[0].setAttribute("stroke-dasharray", "2 5");
  if (theirs) [1, 2].forEach(i => paths[i].setAttribute("stroke-dasharray", MATCH_DASH));
  mine.forEach((p, k) => p.slice(1, -1).forEach(v => el("circle", { cx: sx(M[k]), cy: sy(v), r: 3.5, fill: GREY }, svg)));
  el("circle", { cx: sx(q.m), cy: sy(cur[0]), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, svg);
  // Direct labels at the right end, pulled apart where the two lines end close together (at d near 0 they meet), and
  // clear of the circle when it sits at the last m.
  let y1 = sy(mine.at(-1)[0]), y2 = sy(mine.at(-1).at(-1));
  if (Math.abs(y1 - y2) < 18) { const mid = (y1 + y2) / 2, s = y1 <= y2 ? -9 : 9; y1 = mid + s; y2 = mid - s; }
  const lx = sx(M_MAX) + (q.m === M_MAX ? 11 : 6);
  el("text", { x: lx, y: y1 + 6, class: "tick", fill: DIST_TEXT[ds] }, svg).textContent = "rank 1";
  el("text", { x: lx, y: y2 + 6, class: "tick", fill: DIST_TEXT[ds] }, svg).textContent = "last";
  const theirName = distSwatch(other, MATCH_DASH);
  $("sdtrank-across-legend").innerHTML = `Solid: ${distSwatch(ds)} at this d. Dashed: ` +
    (theirs ? `${theirName} at d = ${fmt(md, Math.abs(md) >= 100 ? 0 : 2)}${other === "normal" ? ", sdratio 1" : ""}, its d for the same P(rank 1) at this m (circle)` :
      available(other) ? `${theirName}, no d reaches this P(rank 1)` : `${theirName} is off: bmm's quadrature nodes did not load`) +
    ". Grey dots: the ranks in between; dotted: chance.";
  const matched = theirs ? { dist: other, d: md, last: theirs[q.m - 2].at(-1) } : null;
  $("sdtrank-across-now").textContent = `With the current values at m = ${q.m}, ${ds} gives the target rank 1 with probability ${fmt(cur[0], 3)} ` +
    `and the last rank with ${fmt(cur.at(-1), 3)}` + (matched
      ? `; ${other} at d = ${fmt(md, 2)}${other === "normal" ? " (sdratio 1)" : ""}, matched on rank 1, gives the last rank ${fmt(matched.last, 3)}.`
      : ".");
  return { across: { first: mine.map(p => p[0]), last: mine.map(p => p.at(-1)) }, matched };
}

function drawCode(q, cur) {
  const ds = dist(), counts = split100(cur), cols = cur.map((_, i) => `"rank${i + 1}"`).join(", ");
  const sd = ds === "normal" ? `sdratio = ${q.sdratio}, ` : "";
  const free = ds === "normal" && q.sdratio !== 1 && q.m > 2;
  const why = ds !== "normal" ? ""
    : q.m === 2 ? "# at m = 2 the counts hold only P(rank 1), Phi(d / sqrt(2)) whatever sdratio: sdratio needs m of 3 or more\n"
    : free ? "# sdratio ~ 1 frees the ratio, which bmm estimates on the log scale; without it sdratio stays at 1\n"
    : "# sdratio stays at 1 (equal SDs) unless the formula names it: bmf(d ~ 1, sdratio ~ 1)\n";
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("sdtrank-code").textContent =
`library(bmm)
model <- sdt_ranking(response = c(${cols}), m = ${q.m}, dist = "${ds}")

# log likelihood of 100 trials at the counts predicted for ranks 1 to ${q.m} (100 x P(rank), rounded)
dsdt_ranking(counts = c(${counts.join(", ")}), m = ${q.m}, d = ${q.d}, ${sd}dist = "${ds}", log = TRUE)
${sim.on ? `
# simulate ${sim.n} trials: how often the target got each rank
rsdt_ranking(n = 1, n_trials = ${sim.n}, m = ${q.m}, d = ${q.d}, ${sd}dist = "${ds}")
` : ""}
# fit: one row per participant and condition, columns rank1 to rank${q.m} with the counts. With m varying
# between rows, name its column instead (m = "m"), with count columns up to the largest m, 0 beyond a row's m
${why}fit <- bmm(formula = bmf(d ~ 1${free ? ", sdratio ~ 1" : ""}), data = my_data, model = model)`;
  $("sdtrank-code").dataset.logd = dsdtRanking(counts, q.m, q.d, q.sdratio, ds, RULES);
}

function draw() {
  const t0 = performance.now();
  const normal = dist() === "normal";
  for (const e of document.querySelectorAll(".sdtrank-normal-only")) e.hidden = !normal;
  const q = values(), bad = problems(q);
  $("sdtrank-m-hint").textContent = "Items per trial, the target and m − 1 lures.";
  $("sdtrank-range-hint").textContent = "Sliders: bmm's prior mean ± 3 SD." + (normal ? " sdratio moves on the log scale; the box shows the ratio." : "") +
    (RULES ? "" : " normal is off: bmm's quadrature nodes did not load.");
  // A d typed far out puts the target where log Phi overflows (beyond about 1e154), and the probabilities are NaN.
  const cur = bad.length ? null : probs(q);
  if (cur && !cur.every(Number.isFinite)) bad.push([["d", "sdratio"], "sdtrank-range-hint", "These values put the target too far out to compute."]);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["sdtrank-widget", "sdtrank-code", "sdtrank-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) { sim.text.hidden = true; return; }
  const ref = probs({ ...q, d: PRIOR.d[0], sdratio: 1 });
  drawTiles(q.m);
  drawLatent(q);
  drawBars(q, cur, ref);
  const { across, matched } = drawAcross(q, cur);
  drawCode(q, cur);
  for (const [id, text] of Object.entries(sdtRankingSummaries({ q, dist: dist(), cur, across, matched, maxM: M_MAX }))) describePlot($(id), text);
  $("sdtrank-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

if (!RULES) for (const o of $("sdtrank-dist").options) o.disabled = !available(o.value);
$("sdtrank-dist").addEventListener("change", draw);
$("sdtrank-reset").addEventListener("click", () => { setParams(pairs, START); sim.reset(); draw(); });
$("sdtrank-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdtrank-code").textContent));
pairs.d.setBounds({ min: PRIOR.d[0] - 3 * PRIOR.d[1], max: PRIOR.d[0] + 3 * PRIOR.d[1], step: 0.05, scale: LINEAR });
// 3 * 0.3 is 0.8999999999999999 in floating point, which puts the top of the slider's 0.02 grid at 0.88.
const LOG_SD3 = +(3 * PRIOR.sdratio[1]).toFixed(2);
pairs.sdratio.setBounds({ min: PRIOR.sdratio[0] - LOG_SD3, max: PRIOR.sdratio[0] + LOG_SD3, step: 0.02, scale: LOG });
setParams(pairs, START);
draw();
initInfo();
initA11y();
