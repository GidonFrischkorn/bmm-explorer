// Page script for models/m3.qmd: M3 simple span (version "ss"), simple and softmax choice rules.
import { m3Probs, ssActs, defaultB } from "../models/m3.js";
import { bindParams, readParams, setParams, fmt } from "../lib/widget.js";
import { barPlot, linePlot, el, clear } from "../lib/plot.js";

// bmm's dm3() example: a = 1, c = 2, num_options = c(1, 4, 5). Valid under both rules.
const START = { a: 1, c: 2, n_other: 4, n_npl: 5 };
const RANGES = { simple: [0, 10], softmax: [-3, 6] };
const MAX = { n_other: 8, n_npl: 12 };
const COLOR = { corr: "#0072B2", other: "#D55E00", npl: "#595959", both: "#CC79A7" };
// Consonants only, so no letter reads as a word; the rank string fixes where each tile sits on the
// response screen, so changing a count adds or removes tiles without reshuffling the rest.
const LETTERS = "FKPTBLRXHMNQSVZJDGCWY";
const RANK = "MZBQHTXCLFWJRDVKNGPSY";

const $ = id => document.getElementById(id);
const pairs = bindParams({
  a: ["m3-a", "m3-a-num"], c: ["m3-c", "m3-c-num"],
  n_other: ["m3-n-other", "m3-n-other-num"], n_npl: ["m3-n-npl", "m3-n-npl-num"]
}, draw);
const ruleInputs = [...document.querySelectorAll('input[name="m3-rule"]')];
const rule = () => ruleInputs.find(r => r.checked).value;

// null where the simple rule would need a negative activation: the softmax range lets a go below −0.1,
// and the across-settings panel draws both rules from the same a and c.
function probs({ a, c, n_other, n_npl }, choiceRule) {
  const acts = ssActs({ a, c, b: defaultB(choiceRule) });
  if (choiceRule === "simple" && acts.some(A => A < 0)) return null;
  const pr = m3Probs(acts, [1, n_other, n_npl], choiceRule);
  // All-zero activations under the simple rule give 0 / 0.
  return pr.every(Number.isFinite) ? pr : null;
}

function valid(p) {
  const [lo, hi] = RANGES[rule()];
  return [p.a, p.c].every(v => Number.isFinite(v) && v >= lo && v <= hi) &&
    ["n_other", "n_npl"].every(k => Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= MAX[k]);
}

function drawTask({ n_other, n_npl }) {
  const svg = $("m3-task");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 600 330");
  const list = LETTERS.slice(0, 1 + n_other).split("");
  const lures = LETTERS.slice(1 + n_other, 1 + n_other + n_npl).split("");
  const cued = Math.min(2, list.length - 1);
  const kind = ch => (ch === list[cued] ? "corr" : list.includes(ch) ? "other" : "npl");

  el("text", { x: 10, y: 34, class: "task-label" }, svg).textContent = "1  Study";
  list.forEach((ch, i) => {
    el("rect", { x: 130 + i * 48, y: 10, width: 40, height: 40, rx: 4, fill: "#fff", stroke: "#999", "stroke-width": 1.5 }, svg);
    el("text", { x: 150 + i * 48, y: 38, "text-anchor": "middle", class: "task-letter" }, svg).textContent = ch;
    el("text", { x: 150 + i * 48, y: 66, "text-anchor": "middle", class: "task-small" }, svg).textContent = i + 1;
  });

  el("text", { x: 10, y: 104, class: "task-label" }, svg).textContent = "2  Cue";
  el("text", { x: 130, y: 104, class: "task-cue" }, svg).textContent = `Which letter was in position ${cued + 1}?`;

  el("text", { x: 10, y: 150, class: "task-label" }, svg).textContent = "3  Choose";
  [...list, ...lures].sort((p, q) => RANK.indexOf(p) - RANK.indexOf(q)).forEach((ch, i) => {
    const x = 130 + (i % 8) * 58, y = 126 + Math.floor(i / 8) * 64, k = kind(ch);
    el("rect", { x, y, width: 50, height: 50, rx: 6, fill: COLOR[k], "fill-opacity": 0.14, stroke: COLOR[k], "stroke-width": 3 }, svg);
    el("text", { x: x + 25, y: y + 34, "text-anchor": "middle", class: "task-letter", fill: COLOR[k] }, svg).textContent = ch;
  });

  $("m3-task-legend").innerHTML =
    `<span class="blue">1 correct</span> · <span class="orange">${n_other} other list item${n_other === 1 ? "" : "s"}</span> · ` +
    `<span class="grey">${n_npl} lure${n_npl === 1 ? "" : "s"}</span> · N = ${1 + n_other + n_npl} candidates`;
}

function drawBars(p, cur, start) {
  const spec = {
    W: 600, H: 330, margin: { l: 70, r: 15, t: 20, b: 50 }, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    categories: ["correct", "other list items", "lures"], ylab: "Probability", groups: [{ values: cur }]
  };
  const svg = $("m3-bars");
  const { rects, sy } = barPlot(svg, spec);
  rects[0].forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    r.setAttribute("fill", Object.values(COLOR)[i]);
    el("rect", { x, y: sy(start[i]), width: w, height: sy(0) - sy(start[i]), fill: "none", stroke: "#222", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    el("text", { x: x + w / 2, y: sy(cur[i]) - 6, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt(cur[i], 3);
  });
}

// P(correct) along three ways of growing the response set from the current composition.
function compositions(p) {
  return [
    { label: "lures", color: COLOR.npl, pts: Array.from({ length: MAX.n_npl + 1 }, (_, k) => ({ ...p, n_npl: k })) },
    { label: "others", color: COLOR.other, pts: Array.from({ length: MAX.n_other + 1 }, (_, k) => ({ ...p, n_other: k })) },
    { label: "both", color: COLOR.both, pts: Array.from({ length: MAX.n_other + 1 }, (_, k) => ({ ...p, n_other: k, n_npl: k })) }
  ];
}

function drawAcross(p, choiceRule) {
  const series = [];
  for (const r of ["simple", "softmax"]) {
    for (const comp of compositions(p)) {
      const ys = comp.pts.map(q => probs(q, r)?.[0]);
      if (ys.some(y => y === undefined)) continue;
      series.push({ x: comp.pts.map(q => 1 + q.n_other + q.n_npl), y: ys, color: comp.color, dashed: r === "softmax" });
    }
  }
  const spec = {
    W: 600, H: 340, margin: { l: 70, r: 15, t: 15, b: 55 }, xlim: [1, 21], ylim: [0, 1],
    xticks: [1, 5, 9, 13, 17, 21], yticks: [0, 0.25, 0.5, 0.75, 1],
    xlab: "Response-set size N = 1 + n_other + n_npl", ylab: "P(correct)", series
  };
  const { sx, sy } = linePlot($("m3-across"), spec);
  const now = probs(p, choiceRule);
  if (now) el("circle", { cx: sx(1 + p.n_other + p.n_npl), cy: sy(now[0]), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, $("m3-across"));

  const end = (q) => fmt(probs(q, choiceRule)[0], 2);
  $("m3-across-now").textContent = !now ? "" :
    `Under the ${choiceRule} rule with a = ${fmt(p.a, 1)} and c = ${fmt(p.c, 1)}, P(correct) is ${fmt(now[0], 2)} ` +
    `with ${p.n_other} other list items and ${p.n_npl} lures (N = ${1 + p.n_other + p.n_npl}). ` +
    `With ${MAX.n_npl} lures instead (N = ${1 + p.n_other + MAX.n_npl}) it would be ${end({ ...p, n_npl: MAX.n_npl })}; ` +
    `with ${MAX.n_other} other list items instead (N = ${1 + MAX.n_other + p.n_npl}) it would be ${end({ ...p, n_other: MAX.n_other })}.`;
}

// x in the dm3() call: 100 trials split as the model predicts, rounded so the counts sum to 100.
function expectedCounts(pr, n = 100) {
  const raw = pr.map(v => v * n), k = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - k[i], i]).sort((u, v) => v[0] - u[0]);
  for (let j = 0; j < n - k.reduce((s, v) => s + v, 0); j++) k[order[j][1]]++;
  return k;
}

function drawCode(p, choiceRule, pr) {
  // R code: plain ASCII minus, so the snippet pastes into R unchanged.
  $("m3-code").textContent =
`library(bmm)
model <- m3(resp_cats = c("corr", "other", "npl"),
            num_options = c(1, ${p.n_other}, ${p.n_npl}),
            choice_rule = "${choiceRule}",
            version = "ss")

# log likelihood of response counts per category; here 100 trials split as predicted
dm3(x = c(${expectedCounts(pr).join(", ")}), pars = c(a = ${p.a.toFixed(1)}, c = ${p.c.toFixed(1)}), m3_model = model)

# fit: one row per participant and condition, columns corr, other, npl with the counts
fit <- bmm(formula = bmf(c ~ 1, a ~ 1), data = my_data, model = model)`;
}

function draw() {
  const t0 = performance.now();
  const p = readParams(pairs), r = rule();
  if (!valid(p)) return;
  const cur = probs(p, r);
  drawTask(p);
  drawBars(p, cur, probs({ ...p, a: START.a, c: START.c }, r));
  drawAcross(p, r);
  drawCode(p, r, cur);
  $("m3-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

function applyRange() {
  const [lo, hi] = RANGES[rule()];
  for (const k of ["a", "c"]) {
    for (const input of [pairs[k].range, pairs[k].num]) { input.min = lo; input.max = hi; }
    pairs[k].value = Math.min(hi, Math.max(lo, pairs[k].value));
  }
  $("m3-range-hint").textContent = rule() === "simple"
    ? "Simple rule: b = 0.1, a and c from 0 to 10 (activations must stay positive)."
    : "Softmax rule: b = 0, a and c from −3 to 6 (only differences between activations matter).";
}

ruleInputs.forEach(r => r.addEventListener("change", () => { applyRange(); draw(); }));
$("m3-reset").addEventListener("click", () => { setParams(pairs, START); draw(); });
$("m3-copy").addEventListener("click", () => navigator.clipboard?.writeText($("m3-code").textContent));
setParams(pairs, START);
applyRange();
draw();
