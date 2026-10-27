// Page script for models/m3.qmd: M3 simple span (version "ss") and complex span ("cs"), with the simple,
// softmax and gaussian choice rules.
import { m3Probs, ssActs, csActs, defaultB } from "../models/m3.js";
import { bindParams, readParams, setParams, fmt, LINEAR, LOG, LOGIT } from "../lib/widget.js";
import { barPlot, linePlot, el, clear } from "../lib/plot.js";
import { initInfo } from "../lib/info.js";

// bmm's quadrature rule for the gaussian rule, written from bmm by R/make_fixtures.R. Without it the
// gaussian rule is switched off rather than computed on other nodes.
const GH = await fetch(new URL("../../tests/parity/fixtures/nodes.json", import.meta.url))
  .then(r => (r.ok ? r.json() : null)).then(d => d?.cells.find(c => c.fn === ".m3_gauss_rule") ?? null).catch(() => null);

// bmm's default priors for m3(version = "ss" / "cs"), [mean, sd] on the link scale: log for simple,
// identity for softmax and gaussian. The sliders span mean +- 3 SD; the prior means are the starting values.
const PRIOR = {
  simple: { a: [0, 1], c: [3, 1], scale: LOG, step: 0.05 },
  softmax: { a: [3, 1], c: [3, 1], scale: LINEAR, step: 0.1 },
  gaussian: { a: [2, 1], c: [2, 1], scale: LINEAR, step: 0.1 }
};
// f (cs only) has a logit link under every rule and a logistic(0, 1) prior, SD pi / sqrt(3): mean +- 3 SD
// is +-5.44 on the logit scale, f from 0.004 to 0.996.
const F_BOUNDS = { min: -5.44, max: 5.44, step: 0.04, scale: LOGIT };
const F_START = 0.5;
// Category order is bmm's for each version. The complex-span screen also holds the distractor letters,
// so its limits keep every candidate on the 21 slots.
const VERSION = {
  ss: { cats: ["corr", "other", "npl"], labels: ["correct", "other list items", "lures"], max: { set_size: 9, n_npl: 12 } },
  cs: { cats: ["corr", "dist_context", "other", "dist_other", "npl"],
        labels: ["correct", "dist. near", "other list", "dist. other", "lures"], max: { set_size: 6, n_npl: 9 } }
};
// Category names in the R code. bmm turns them into brms parameter names, which take no underscores.
const CODE_CATS = { ss: ["corr", "other", "npl"], cs: ["corr", "distcontext", "other", "distother", "npl"] };
const START_COUNTS = { set_size: 6, n_other: 4, n_npl: 5, n_dist_context: 1, n_dist_other: 3 };
const COLOR = { corr: "#0072B2", other: "#D55E00", npl: "#595959", dist_context: "#009E73", dist_other: "#CC79A7", both: "#CC79A7" };
const TILE = {
  corr: { fill: "#e5f0f7", stroke: "#0072B2", text: "#0072B2" },
  other: { fill: "#fbebe0", stroke: "#D55E00", text: "#b04a00" },
  dist_context: { fill: "#e0f3ed", stroke: "#009E73", text: "#007353" },
  dist_other: { fill: "#f8e9f1", stroke: "#CC79A7", text: "#9b4475" },
  npl: { fill: "#f3f4f7", stroke: "#a3adb7", text: "#595959" },
  empty: { fill: "#f8f9fa", stroke: "#dde1e6", text: "#c3c8cf" }
};
// Consonants only, so no letter string reads as a word. A letter's place in RANK is its fixed slot on
// the response screen, so changing a count fills or empties slots without moving the other letters.
const LETTERS = "FKPTBLRXHMNQSVZJDGCWY";
const RANK = "MZBQHTXCLFWJRDVKNGPSY";

const $ = id => document.getElementById(id);
const pairs = bindParams({
  a: ["m3-a", "m3-a-num"], c: ["m3-c", "m3-c-num"], f: ["m3-f", "m3-f-num"],
  set_size: ["m3-set-size", "m3-set-size-num"], n_other: ["m3-n-other", "m3-n-other-num"], n_npl: ["m3-n-npl", "m3-n-npl-num"],
  n_dist_context: ["m3-n-dc", "m3-n-dc-num"], n_dist_other: ["m3-n-do", "m3-n-do-num"]
}, draw);
const radios = name => [...document.querySelectorAll(`input[name="${name}"]`)];
const ruleInputs = radios("m3-rule"), versionInputs = radios("m3-version");
const rule = () => ruleInputs.find(r => r.checked).value;
const version = () => versionInputs.find(r => r.checked).value;
const priorMeans = r => ({ a: PRIOR[r].scale.fromRange(PRIOR[r].a[0]), c: PRIOR[r].scale.fromRange(PRIOR[r].c[0]), f: F_START });

// Each letter is followed by a distractor in the complex-span task. bmm takes only the counts per
// category and leaves to the design which distractors are close to the cued position; this page cues
// the third letter (the last of a shorter list) and counts the distractor right after it and the one
// right before it (none when the first letter is cued, at set size 1) as dist_context, the rest as
// dist_other.
const cuedAt = setSize => Math.min(2, setSize - 1);
const nearCue = setSize => (cuedAt(setSize) > 0 ? 2 : 1);

const numOptions = (p, v) => (v === "cs"
  ? [1, p.n_dist_context, p.n_other, p.n_dist_other, p.n_npl] : [1, p.n_other, p.n_npl]);
const totalN = (p, v) => numOptions(p, v).reduce((s, n) => s + n, 0);

// null where the simple rule would get a negative or zero total activation, or where the computation
// overflows (both only reachable by typing). An overflowed total is Infinity and turns every probability
// into a finite 0, so finiteness alone does not catch it; the sum does. The tolerance leaves room for
// the gaussian rule, whose quadrature sums to 1 only approximately.
function probs(p, v, choiceRule) {
  const b = defaultB(choiceRule);
  const acts = v === "cs" ? csActs({ ...p, b }) : ssActs({ ...p, b });
  if (choiceRule === "simple" && acts.some(A => A < 0)) return null;
  const pr = m3Probs(acts, numOptions(p, v), choiceRule, GH);
  return pr.every(Number.isFinite) && Math.abs(pr.reduce((s, q) => s + q, 0) - 1) < 1e-3 ? pr : null;
}

const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// What keeps the current values from being drawn, as [fields, hint element id, message]; empty if nothing.
function problems(p, v, choiceRule) {
  const { max } = VERSION[v], counts = [];
  if (!inRange(p.set_size, 1, max.set_size)) counts.push(["set_size", `set size 1–${max.set_size}`]);
  else {
    if (!inRange(p.n_other, 0, p.set_size - 1)) counts.push(["n_other", `n_other 0–${p.set_size - 1}`]);
    if (v === "cs") {
      const near = nearCue(p.set_size), far = p.set_size - near;
      if (!inRange(p.n_dist_context, 0, near)) counts.push(["n_dist_context", `n_dist_context 0–${near}`]);
      if (!inRange(p.n_dist_other, 0, far)) counts.push(["n_dist_other", `n_dist_other 0–${far}`]);
    }
  }
  if (!inRange(p.n_npl, 0, max.n_npl)) counts.push(["n_npl", `n_npl 0–${max.n_npl}`]);
  const out = counts.length ? [[counts.map(q => q[0]), "m3-n-total", `Out of range: ${counts.map(q => q[1]).join(", ")}.`]] : [];
  const ac = ["a", "c"].filter(k => !Number.isFinite(p[k]) || (choiceRule === "simple" && p[k] < 0));
  if (v === "cs" && !(p.f >= 0 && p.f <= 1)) ac.push("f");
  if (ac.length) {
    out.push([ac, "m3-range-hint", (choiceRule === "simple" ? "Under the simple rule a and c must be numbers ≥ 0" : "a and c must be numbers") +
      (v === "cs" ? ", f a number from 0 to 1." : ".")]);
  }
  return out;
}

// Every probability one redraw shows, or null if any is invalid. The across panel evaluates response
// sets other than the current one, and a typed activation can overflow there only (softmax, simple span
// or complex span with f up to the slider's 0.996, a = 708, c = 0, set size 6, n_other = 0: valid now,
// overflowed from n_other = 5 on; at the prior mean c = 3 the current set overflows too), so the check
// covers them all before anything is drawn.
function predict(p, v, choiceRule) {
  const ref = priorMeans(choiceRule), cur = probs(p, v, choiceRule), refCur = probs({ ...p, ...ref }, v, choiceRule);
  const series = [{ ...p, ...ref }, p].flatMap((q, j) => compositions(q, v).map(comp => ({
    x: comp.pts.map(s => totalN(s, v)), y: comp.pts.map(s => probs(s, v, choiceRule)?.[0]),
    color: comp.color, dashed: j === 0
  })));
  return cur && refCur && series.every(s => s.y.every(Number.isFinite)) ? { cur, refCur, series } : null;
}

// Counts cannot exceed the candidates there are: a smaller set size pulls n_other and the distractor
// counts down. A set size that is empty or out of range, as while it is being typed, leaves them alone.
function capCounts(v) {
  const p = readParams(pairs);
  if (!inRange(p.set_size, 1, VERSION[v].max.set_size)) return;
  const lim = { n_other: p.set_size - 1, n_dist_context: nearCue(p.set_size), n_dist_other: p.set_size - nearCue(p.set_size) };
  for (const k in lim) {
    pairs[k].setBounds({ max: lim[k] });
    if (p[k] > lim[k]) pairs[k].value = lim[k];
  }
}

function drawTask(p, v) {
  const svg = $("m3-task");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 1000 312");
  const cs = v === "cs", S = p.set_size, cued = cuedAt(S);
  const list = LETTERS.slice(0, S).split("");
  const dists = cs ? LETTERS.slice(S, 2 * S).split("") : [];
  const near = dists.filter((_, i) => i === cued - 1 || i === cued), far = dists.filter(ch => !near.includes(ch));
  const pick = {
    other: list.filter((_, i) => i !== cued).slice(0, p.n_other),
    dist_context: cs ? near.slice(0, p.n_dist_context) : [],
    dist_other: cs ? far.slice(0, p.n_dist_other) : [],
    npl: LETTERS.slice(cs ? 2 * S : S).slice(0, p.n_npl).split("")
  };
  const kind = ch => (ch === list[cued] ? "corr" : Object.keys(pick).find(k => pick[k].includes(ch)) ?? "empty");

  el("text", { x: 500, y: 20, "text-anchor": "middle", class: "task-note" }, svg).textContent = cs
    ? "study the letters; read each distractor (dashed) aloud" : "study the list, one letter at a time";
  // The study sequence: letters, and in complex span a smaller distractor tile after each letter.
  const seq = list.flatMap((ch, i) => (cs ? [{ ch, i }, { ch: dists[i], dist: near.includes(dists[i]) ? "dist_context" : "dist_other" }] : [{ ch, i }]));
  const w = s => (s.dist ? 56 : cs ? 72 : 80), gap = cs ? 10 : 12;
  let x = 500 - (seq.reduce((t, s) => t + w(s), 0) + gap * (seq.length - 1)) / 2;
  for (const s of seq) {
    const isCue = s.i === cued, h = s.dist ? 40 : 50, y = s.dist ? 37 : 32;
    el("rect", { x, y, width: w(s), height: h, rx: 6, fill: isCue ? TILE.corr.fill : "#fff",
      stroke: s.dist ? TILE[s.dist].stroke : isCue ? TILE.corr.stroke : "#1a2340", "stroke-width": isCue ? 3 : 2,
      ...(s.dist ? { "stroke-dasharray": "6 4" } : {}) }, svg);
    el("text", { x: x + w(s) / 2, y: s.dist ? 65 : 66, "text-anchor": "middle", class: s.dist ? "task-letter task-dist" : "task-letter",
      fill: s.dist ? TILE[s.dist].text : isCue ? TILE.corr.text : "#1a2340" }, svg).textContent = isCue ? "?" : s.ch;
    x += w(s) + gap;
  }

  el("text", { x: 500, y: 114, "text-anchor": "middle", class: "task-note" }, svg).textContent = "then: which letter was in the cued box? pick one";
  RANK.split("").forEach((ch, i) => {
    const tx = 114 + (i % 7) * 112, ty = 126 + Math.floor(i / 7) * 52, k = kind(ch);
    el("rect", { x: tx, y: ty, width: 100, height: 42, rx: 6, fill: TILE[k].fill, stroke: TILE[k].stroke, "stroke-width": k === "corr" ? 3 : 2 }, svg);
    el("text", { x: tx + 50, y: ty + 29, "text-anchor": "middle", class: "task-letter task-tile", fill: TILE[k].text }, svg)
      .textContent = k === "empty" ? "xxx" : ch;
  });

  const bins = cs
    ? [[100, "corr", "1 correct"], [300, "other", `${p.n_other} of ${S - 1} list`],
       [500, "dist_context", `${p.n_dist_context} of ${near.length} near cue`],
       [700, "dist_other", `${p.n_dist_other} of ${far.length} distractors`], [900, "npl", `${p.n_npl} never shown`]]
    : [[200, "corr", "1 correct letter"],
       [500, "other", `${p.n_other} of ${S - 1} other list letter${S === 2 ? "" : "s"}`],
       [800, "npl", `${p.n_npl} letter${p.n_npl === 1 ? "" : "s"} never shown`]];
  for (const [bx, k, label] of bins)
    el("text", { x: bx, y: 302, "text-anchor": "middle", class: cs ? "task-bin task-bin-sm" : "task-bin", fill: TILE[k].text }, svg).textContent = label;
}

function drawBars(cur, ref, v) {
  const svg = $("m3-bars");
  svg.classList.toggle("m3-five", v === "cs");
  const { rects, sy } = barPlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 22, b: 44 }, ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
    categories: VERSION[v].labels, ylab: "Proportion", groups: [{ values: cur }]
  });
  rects[0].forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width");
    r.setAttribute("fill", COLOR[VERSION[v].cats[i]]);
    el("rect", { x, y: sy(ref[i]), width: w, height: sy(0) - sy(ref[i]), fill: "none", stroke: "#222", "stroke-width": 2, "stroke-dasharray": "6 4" }, svg);
    el("text", { x: x + w / 2, y: sy(Math.max(cur[i], ref[i])) - 6, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt(cur[i], 2);
  });
}

// P(correct) along three ways of changing the response set from the current composition, each running
// through the current counts. Simple span: lures only, other list items only, or both by the same step.
// Complex span: lures, other list items, or the distractors far from the cue.
function compositions(p, v) {
  const range = (n, f) => Array.from({ length: n + 1 }, (_, k) => f(k));
  const lures = { color: COLOR.npl, pts: range(VERSION[v].max.n_npl, k => ({ ...p, n_npl: k })) };
  const others = { color: COLOR.other, pts: range(p.set_size - 1, k => ({ ...p, n_other: k })) };
  if (v === "cs") return [lures, others, { color: COLOR.dist_other, pts: range(p.set_size - nearCue(p.set_size), k => ({ ...p, n_dist_other: k })) }];
  const lo = -Math.min(p.n_other, p.n_npl), hi = Math.min(p.set_size - 1 - p.n_other, VERSION.ss.max.n_npl - p.n_npl);
  return [lures, others, { color: COLOR.both, pts: range(hi - lo, i => ({ ...p, n_other: p.n_other + lo + i, n_npl: p.n_npl + lo + i })) }];
}

function drawAcross(p, v, choiceRule, { cur, series }) {
  const { sx, sy } = linePlot($("m3-across"), {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, xlim: [1, 21], ylim: [0, 1],
    xticks: [1, 5, 9, 13, 17, 21], yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Response-set size N", ylab: "P(correct)", series
  });
  const N = totalN(p, v), pc = q => fmt(probs(q, v, choiceRule)[0], 2), maxNpl = VERSION[v].max.n_npl;
  el("circle", { cx: sx(N), cy: sy(cur[0]), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, $("m3-across"));
  // A counterfactual that equals the current state (all lures already, all other list items already
  // offered, or none to offer) is left out.
  const alt = [
    p.n_npl < maxNpl && `with ${maxNpl} lures instead of ${p.n_npl} it would be ${pc({ ...p, n_npl: maxNpl })} (N = ${totalN({ ...p, n_npl: maxNpl }, v)})`,
    p.n_other < p.set_size - 1 && `with ${p.set_size === 2 ? "the other list item" : `all ${p.set_size - 1} other list items`} ` +
      `offered it would be ${pc({ ...p, n_other: p.set_size - 1 })} (N = ${totalN({ ...p, n_other: p.set_size - 1 }, v)})`
  ].filter(Boolean).join("; ");
  $("m3-across-now").textContent = `With the current values, P(correct) is ${fmt(cur[0], 2)} at N = ${N}.` +
    (alt && ` ${alt[0].toUpperCase()}${alt.slice(1)}.`);
  $("m3-across-legend").innerHTML = `Each line changes one count from the current set (circle): <span class="grey">lures</span>, ` +
    '<span class="orange">other list items</span> or ' +
    (v === "cs" ? '<span class="purple">far distractors</span>.' : '<span class="purple">both together</span>.') + " Dashed: prior means.";
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

function drawCode(p, v, choiceRule, pr) {
  const cs = v === "cs", cats = CODE_CATS[v].map(c => `"${c}"`).join(", ");
  const empty = CODE_CATS[v].filter((_, i) => numOptions(p, v)[i] === 0);
  const fit = `fit <- bmm(formula = bmf(c ~ 1, a ~ 1${cs ? ", f ~ 1" : ""}), data = my_data, model = model)`;
  const link = [choiceRule === "simple" && "log(a) and log(c)", cs && "logit(f)"].filter(Boolean).join(" and ");
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("m3-code").textContent =
`library(bmm)
model <- m3(resp_cats = c(${cats}),
            num_options = c(${numOptions(p, v).join(", ")}),
            choice_rule = "${choiceRule}",
            version = "${v}")

# log likelihood of response counts per category; here 100 trials split as predicted.
# pars are on the natural scale${link ? `; bmm() estimates ${link}` : ""}.
dm3(x = c(${expectedCounts(pr).join(", ")}), pars = c(a = ${p.a}, c = ${p.c}${cs ? `, f = ${p.f}` : ""}), m3_model = model)

# fit: one row per participant and condition, columns ${CODE_CATS[v].join(", ")} with the counts
${empty.length
  ? `# bmm() stops on this design: a category with no candidates in every row of the data
# (here ${empty.join(", ")}) is not identified. Fit data with candidates in every category.
# ${fit}`
  : fit}`;
}

const RULE_HINT = {
  simple: "b = 0.1, fixed. Sliders move on the log scale; boxes show a and c.",
  softmax: "b = 0, fixed. Only differences between activations matter.",
  gaussian: "b = 0, fixed. Each candidate gets its own standard normal noise; the largest wins."
};

function draw() {
  const t0 = performance.now();
  const v = version(), r = rule();
  capCounts(v);
  const p = readParams(pairs), bad = problems(p, v, r);
  const pred = bad.length ? null : predict(p, v, r);
  // Only a or c typed far outside the slider range overflows or underflows; the counts decide in which
  // response set. The one outside its range is the one to change. The slack covers slider ends stored at
  // three significant digits (e^3 shows as 20.1).
  if (!bad.length && !pred) {
    const off = ["a", "c"].filter(k => {
      const [m, sd] = PRIOR[r][k], x = PRIOR[r].scale.toRange(p[k]);
      return !(Math.abs(x - m) <= 3 * sd + 1e-2);
    });
    const blame = off.length ? off : ["a", "c"];
    bad.push([blame, "m3-range-hint",
      `With ${blame.join(" and ")} this far outside the slider range, some response set shown has no finite prediction.`]);
  }
  // Out-of-range input flags its box and dims every output, so nothing reads as the result for it.
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["m3-widget", "m3-code", "m3-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("m3-n-total").textContent = v === "cs"
    ? `N = ${totalN(p, v)} candidates: 1 + ${p.n_other} + ${p.n_dist_context} + ${p.n_dist_other} + ${p.n_npl}`
    : `N = 1 correct + ${p.n_other} other + ${p.n_npl} lures = ${totalN(p, v)}`;
  $("m3-range-hint").textContent = RULE_HINT[r] + (GH ? "" : " The gaussian rule is off: bmm's quadrature nodes did not load.");
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) return;
  drawTask(p, v);
  drawBars(pred.cur, pred.refCur, v);
  drawAcross(p, v, r, pred);
  drawCode(p, v, r, pred.cur);
  $("m3-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

// Switching the rule switches the parametrisation, so a and c restart at that rule's prior means.
function applyRule() {
  const pr = PRIOR[rule()];
  for (const k of ["a", "c"]) {
    const [m, sd] = pr[k];
    pairs[k].setBounds({ min: m - 3 * sd, max: m + 3 * sd, step: pr.step, scale: pr.scale });
  }
  const { a, c } = priorMeans(rule());
  setParams(pairs, { a, c });
}

// The version decides which counts and parameters exist; shared values carry over, capped to the
// complex-span limits.
function applyVersion() {
  const v = version(), { max } = VERSION[v];
  for (const e of document.querySelectorAll(".m3-cs-only")) e.hidden = v !== "cs";
  for (const k of ["set_size", "n_npl"]) {
    pairs[k].setBounds({ max: max[k] });
    if (pairs[k].value > max[k]) pairs[k].value = max[k];
  }
}

if (!GH) ruleInputs.find(i => i.value === "gaussian").disabled = true;
ruleInputs.forEach(i => i.addEventListener("change", () => { applyRule(); draw(); }));
versionInputs.forEach(i => i.addEventListener("change", () => { applyVersion(); draw(); }));
$("m3-reset").addEventListener("click", () => { setParams(pairs, { ...priorMeans(rule()), ...START_COUNTS }); applyVersion(); draw(); });
$("m3-copy").addEventListener("click", () => navigator.clipboard?.writeText($("m3-code").textContent));
pairs.f.setBounds(F_BOUNDS);
setParams(pairs, { ...START_COUNTS, f: F_START });
applyVersion();
applyRule();
draw();
initInfo();
