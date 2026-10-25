// Page script for models/m3.qmd: M3 simple span (version "ss"), simple and softmax choice rules.
import { m3Probs, ssActs, defaultB } from "../models/m3.js";
import { bindParams, readParams, setParams, fmt, LINEAR, LOG } from "../lib/widget.js";
import { barPlot, linePlot, el, clear } from "../lib/plot.js";

// bmm's default priors for m3(version = "ss"), [mean, sd] on the link scale: log for simple, identity
// for softmax. The sliders span mean +- 3 SD; the prior means are the starting values.
const PRIOR = {
  simple: { a: [0, 1], c: [3, 1], scale: LOG, step: 0.05 },
  softmax: { a: [3, 1], c: [3, 1], scale: LINEAR, step: 0.1 }
};
// Set size is the list length; only n_other of the set_size - 1 other list items are offered at test.
const MAX = { set_size: 9, n_npl: 12 };
const START_COUNTS = { set_size: 6, n_other: 4, n_npl: 5 };
const COLOR = { corr: "#0072B2", other: "#D55E00", npl: "#595959", both: "#CC79A7" };
const TILE = {
  corr: { fill: "#e5f0f7", stroke: "#0072B2", text: "#0072B2" },
  other: { fill: "#fbebe0", stroke: "#D55E00", text: "#b04a00" },
  npl: { fill: "#f3f4f7", stroke: "#a3adb7", text: "#595959" },
  empty: { fill: "#f8f9fa", stroke: "#dde1e6", text: "#c3c8cf" }
};
// Consonants only, so no letter string reads as a word. A letter's place in RANK is its fixed slot on
// the response screen, so changing a count fills or empties slots without moving the other letters.
const LETTERS = "FKPTBLRXHMNQSVZJDGCWY";
const RANK = "MZBQHTXCLFWJRDVKNGPSY";

const $ = id => document.getElementById(id);
const pairs = bindParams({
  a: ["m3-a", "m3-a-num"], c: ["m3-c", "m3-c-num"],
  set_size: ["m3-set-size", "m3-set-size-num"], n_other: ["m3-n-other", "m3-n-other-num"], n_npl: ["m3-n-npl", "m3-n-npl-num"]
}, draw);
const ruleInputs = [...document.querySelectorAll('input[name="m3-rule"]')];
const rule = () => ruleInputs.find(r => r.checked).value;
const priorMeans = r => ({ a: PRIOR[r].scale.fromRange(PRIOR[r].a[0]), c: PRIOR[r].scale.fromRange(PRIOR[r].c[0]) });

// null where the simple rule would get a negative or zero total activation (only reachable by typing).
function probs({ a, c, n_other, n_npl }, choiceRule) {
  const acts = ssActs({ a, c, b: defaultB(choiceRule) });
  if (choiceRule === "simple" && acts.some(A => A < 0)) return null;
  const pr = m3Probs(acts, [1, n_other, n_npl], choiceRule);
  return pr.every(Number.isFinite) ? pr : null;
}

const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// What keeps the current values from being drawn, as [fields, hint element id, message]; empty if nothing.
function problems(p, choiceRule) {
  const counts = [];
  if (!inRange(p.set_size, 1, MAX.set_size)) counts.push(["set_size", `set size 1–${MAX.set_size}`]);
  else if (!inRange(p.n_other, 0, p.set_size - 1)) counts.push(["n_other", `n_other 0–${p.set_size - 1}`]);
  if (!inRange(p.n_npl, 0, MAX.n_npl)) counts.push(["n_npl", `n_npl 0–${MAX.n_npl}`]);
  const out = counts.length ? [[counts.map(q => q[0]), "m3-n-total", `Out of range: ${counts.map(q => q[1]).join(", ")}.`]] : [];
  const ac = ["a", "c"].filter(k => !Number.isFinite(p[k]) || (choiceRule === "simple" && p[k] < 0));
  if (ac.length) {
    out.push([ac, "m3-range-hint", choiceRule === "simple" ? "Under the simple rule a and c must be numbers ≥ 0." : "a and c must be numbers."]);
  } else if (!counts.length && !probs(p, choiceRule)) {
    out.push([["a", "c"], "m3-range-hint", "No finite prediction for these a and c."]);
  }
  return out;
}

// n_other cannot exceed the other list items there are; a smaller set size pulls it down. A set size
// that is empty or out of range, as while it is being typed, leaves n_other and its limits alone.
function capOther() {
  const { set_size, n_other } = readParams(pairs);
  if (!inRange(set_size, 1, MAX.set_size)) return;
  pairs.n_other.setBounds({ max: set_size - 1 });
  if (n_other > set_size - 1) pairs.n_other.value = set_size - 1;
}

function drawTask({ set_size, n_other, n_npl }) {
  const svg = $("m3-task");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 1000 312");
  const list = LETTERS.slice(0, set_size).split("");
  const cued = Math.min(2, set_size - 1);
  const offered = list.filter((_, i) => i !== cued).slice(0, n_other);
  const lures = LETTERS.slice(set_size, set_size + n_npl);
  const kind = ch => (ch === list[cued] ? "corr" : offered.includes(ch) ? "other" : lures.includes(ch) ? "npl" : "empty");

  el("text", { x: 500, y: 20, "text-anchor": "middle", class: "task-note" }, svg).textContent = "study the list, one letter at a time";
  const x0 = 500 - (list.length * 92 - 12) / 2;
  list.forEach((ch, i) => {
    const isCue = i === cued;
    el("rect", { x: x0 + i * 92, y: 32, width: 80, height: 50, rx: 6, fill: isCue ? TILE.corr.fill : "#fff",
      stroke: isCue ? TILE.corr.stroke : "#1a2340", "stroke-width": isCue ? 3 : 2 }, svg);
    el("text", { x: x0 + i * 92 + 40, y: 66, "text-anchor": "middle", class: "task-letter", fill: isCue ? TILE.corr.text : "#1a2340" }, svg)
      .textContent = isCue ? "?" : ch;
  });

  el("text", { x: 500, y: 114, "text-anchor": "middle", class: "task-note" }, svg).textContent = "then: which letter was in the cued box? pick one";
  RANK.split("").forEach((ch, i) => {
    const x = 114 + (i % 7) * 112, y = 126 + Math.floor(i / 7) * 52, k = kind(ch);
    el("rect", { x, y, width: 100, height: 42, rx: 6, fill: TILE[k].fill, stroke: TILE[k].stroke, "stroke-width": k === "corr" ? 3 : 2 }, svg);
    el("text", { x: x + 50, y: y + 29, "text-anchor": "middle", class: "task-letter task-tile", fill: TILE[k].text }, svg)
      .textContent = k === "empty" ? "xxx" : ch;
  });

  [[200, "corr", "1 correct letter"],
   [500, "other", `${n_other} of ${set_size - 1} other list letter${set_size === 2 ? "" : "s"}`],
   [800, "npl", `${n_npl} letter${n_npl === 1 ? "" : "s"} never shown`]].forEach(([x, k, label]) => {
    el("text", { x, y: 302, "text-anchor": "middle", class: "task-bin", fill: TILE[k].text }, svg).textContent = label;
  });
}

function drawBars(cur, ref) {
  const svg = $("m3-bars");
  const { rects, sy } = barPlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 22, b: 44 }, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    categories: ["correct", "other list items", "lures"], ylab: "Proportion", groups: [{ values: cur }]
  });
  rects[0].forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    r.setAttribute("fill", [COLOR.corr, COLOR.other, COLOR.npl][i]);
    el("rect", { x, y: sy(ref[i]), width: w, height: sy(0) - sy(ref[i]), fill: "none", stroke: "#222", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    el("text", { x: x + w / 2, y: sy(Math.max(cur[i], ref[i])) - 6, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt(cur[i], 2);
  });
}

// P(correct) along three ways of changing the response set from the current composition: lures only,
// other list items only, or both by the same step. Each runs through the current counts.
function compositions(p) {
  const lo = -Math.min(p.n_other, p.n_npl), hi = Math.min(p.set_size - 1 - p.n_other, MAX.n_npl - p.n_npl);
  return [
    { color: COLOR.npl, pts: Array.from({ length: MAX.n_npl + 1 }, (_, k) => ({ ...p, n_npl: k })) },
    { color: COLOR.other, pts: Array.from({ length: p.set_size }, (_, k) => ({ ...p, n_other: k })) },
    { color: COLOR.both, pts: Array.from({ length: hi - lo + 1 }, (_, i) => ({ ...p, n_other: p.n_other + lo + i, n_npl: p.n_npl + lo + i })) }
  ];
}

function drawAcross(p, ref, choiceRule, cur) {
  const series = [{ ...p, ...ref }, p].flatMap((q, j) => compositions(q).map(comp => ({
    x: comp.pts.map(s => 1 + s.n_other + s.n_npl), y: comp.pts.map(s => probs(s, choiceRule)[0]),
    color: comp.color, dashed: j === 0
  })));
  const { sx, sy } = linePlot($("m3-across"), {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, xlim: [1, 21], ylim: [0, 1],
    xticks: [1, 5, 9, 13, 17, 21], yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Response-set size N", ylab: "P(correct)", series
  });
  const N = 1 + p.n_other + p.n_npl, pc = q => fmt(probs(q, choiceRule)[0], 2);
  el("circle", { cx: sx(N), cy: sy(cur[0]), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, $("m3-across"));
  // A counterfactual that equals the current state (12 lures already, all other list items already
  // offered, or none to offer) is left out.
  const alt = [
    p.n_npl < MAX.n_npl && `with ${MAX.n_npl} lures instead it would be ${pc({ ...p, n_npl: MAX.n_npl })} (N = ${1 + p.n_other + MAX.n_npl})`,
    p.n_other < p.set_size - 1 && `with ${p.set_size === 2 ? "the other list item" : `all ${p.set_size - 1} other list items`} ` +
      `offered it would be ${pc({ ...p, n_other: p.set_size - 1 })} (N = ${p.set_size + p.n_npl})`
  ].filter(Boolean).join("; ");
  $("m3-across-now").textContent = `With the current values, P(correct) is ${fmt(cur[0], 2)} at N = ${N}.` +
    (alt && ` ${alt[0].toUpperCase()}${alt.slice(1)}.`);
}

// x in the dm3() call: 100 trials split as the model predicts, rounded so the counts sum to 100.
function expectedCounts(pr, n = 100) {
  const raw = pr.map(v => v * n), k = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - k[i], i]).sort((u, v) => v[0] - u[0]);
  // Fixed before the loop: recomputing it inside would shrink it with every increment.
  const short = n - k.reduce((s, v) => s + v, 0);
  for (let j = 0; j < short; j++) k[order[j][1]]++;
  return k;
}

function drawCode(p, choiceRule, pr) {
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("m3-code").textContent =
`library(bmm)
model <- m3(resp_cats = c("corr", "other", "npl"),
            num_options = c(1, ${p.n_other}, ${p.n_npl}),
            choice_rule = "${choiceRule}",
            version = "ss")

# log likelihood of response counts per category; here 100 trials split as predicted.
# pars are on the natural scale${choiceRule === "simple" ? "; bmm() estimates log(a) and log(c) under the simple rule" : ""}.
dm3(x = c(${expectedCounts(pr).join(", ")}), pars = c(a = ${p.a}, c = ${p.c}), m3_model = model)

# fit: one row per participant and condition, columns corr, other, npl with the counts
fit <- bmm(formula = bmf(c ~ 1, a ~ 1), data = my_data, model = model)`;
}

const RULE_HINT = {
  simple: "b = 0.1, fixed. Sliders move on the log scale; boxes show a and c.",
  softmax: "b = 0, fixed. Only differences between activations matter."
};

function draw() {
  const t0 = performance.now();
  capOther();
  const p = readParams(pairs), r = rule(), bad = problems(p, r);
  // Out-of-range input flags its box and dims every output, so nothing reads as the result for it.
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["m3-widget", "m3-code", "m3-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("m3-n-total").textContent = `N = 1 correct + ${p.n_other} other + ${p.n_npl} lures = ${1 + p.n_other + p.n_npl}`;
  $("m3-range-hint").textContent = RULE_HINT[r];
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) return;
  const ref = priorMeans(r), cur = probs(p, r);
  drawTask(p);
  drawBars(cur, probs({ ...p, ...ref }, r));
  drawAcross(p, ref, r, cur);
  drawCode(p, r, cur);
  $("m3-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// Switching the rule switches the parametrisation, so a and c restart at that rule's prior means.
function applyRule() {
  const pr = PRIOR[rule()];
  for (const k of ["a", "c"]) {
    const [m, sd] = pr[k];
    pairs[k].setBounds({ min: m - 3 * sd, max: m + 3 * sd, step: pr.step, scale: pr.scale });
  }
  setParams(pairs, priorMeans(rule()));
}

ruleInputs.forEach(r => r.addEventListener("change", () => { applyRule(); draw(); }));
$("m3-reset").addEventListener("click", () => { setParams(pairs, { ...priorMeans(rule()), ...START_COUNTS }); draw(); });
$("m3-copy").addEventListener("click", () => navigator.clipboard?.writeText($("m3-code").textContent));
setParams(pairs, START_COUNTS);
applyRule();
draw();
