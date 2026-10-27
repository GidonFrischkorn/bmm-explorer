// Page script for models/mpt.qmd: the span tree (item memory Pi, binding Pb, guessing set by the response
// set), drawn from its branch list, and its comparison with the M3 simple rule.
import { mptProbs, mptCovariates, mptNodes, branchString } from "../models/mpt.js";
import { SPAN_TREE, spanTreeToM3 } from "../models/mpt-span-tree.js";
import { m3Probs, ssActs } from "../models/m3.js";
import { bindParams, readParams, setParams, fmt, LOGIT } from "../lib/widget.js";
import { barPlot, linePlot, el, clear } from "../lib/plot.js";
import { initInfo } from "../lib/info.js";

// bmm's mpt() puts Pi and Pb on the logit scale with a logistic(0, 1) prior, SD pi / sqrt(3): the
// sliders span mean +- 3 SD (+-5.44) and start at the prior mean, 0.5.
const BOUNDS = { min: -5.44, max: 5.44, step: 0.04, scale: LOGIT };
const PRIOR_MEANS = { Pi: 0.5, Pb: 0.5 };
const MAX = { set_size: 9, n_npl: 12 };
const START_COUNTS = { set_size: 6, n_other: 4, n_npl: 5 };
const COLOR = { corr: "#0072B2", other: "#D55E00", npl: "#595959", both: "#CC79A7" };
const LABEL = { corr: "correct", other: "other list", npl: "lure" };
// What a trial is like at each inner node of the tree, by the node's path of factors.
const STATE = { "": "trial", "/Pi": "in memory", "/1-Pi": "not in memory", "/Pi/1-Pb": "position lost" };
// Edge labels: parameters by name, guessing rates as the fraction of candidates they are.
function edgeLabel(f, p) {
  const N = 1 + p.n_other + p.n_npl;
  const frac = { gl_corr: [1, 1 + p.n_other], gl_other: [p.n_other, 1 + p.n_other], g_corr: [1, N], g_other: [p.n_other, N], g_npl: [p.n_npl, N] }[f];
  return frac ? `${frac[0]}/${frac[1]}` : f.replace("1-", "1 − ");
}
const sig = v => String(+v.toPrecision(3));

const $ = id => document.getElementById(id);
const pairs = bindParams({
  Pi: ["mpt-pi", "mpt-pi-num"], Pb: ["mpt-pb", "mpt-pb-num"],
  set_size: ["mpt-set-size", "mpt-set-size-num"], n_other: ["mpt-n-other", "mpt-n-other-num"], n_npl: ["mpt-n-npl", "mpt-n-npl-num"]
}, draw);

const values = p => ({ Pi: p.Pi, Pb: p.Pb, ...mptCovariates(SPAN_TREE, p) });
const probs = p => mptProbs(SPAN_TREE, values(p));
const m3Simple = (ac, p) => m3Probs(ssActs({ ...ac, b: 0.1 }), [1, p.n_other, p.n_npl], "simple");
const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// What keeps the current values from being drawn, as [fields, hint element id, message]; empty if nothing.
function problems(p) {
  const counts = [];
  if (!inRange(p.set_size, 1, MAX.set_size)) counts.push(["set_size", `set size 1–${MAX.set_size}`]);
  else if (!inRange(p.n_other, 0, p.set_size - 1)) counts.push(["n_other", `n_other 0–${p.set_size - 1}`]);
  if (!inRange(p.n_npl, 0, MAX.n_npl)) counts.push(["n_npl", `n_npl 0–${MAX.n_npl}`]);
  const out = counts.length ? [[counts.map(q => q[0]), "mpt-n-total", `Out of range: ${counts.map(q => q[1]).join(", ")}.`]] : [];
  // bmm's logit link needs probabilities strictly between 0 and 1, and dmpt() refuses 0 and 1.
  const bad = ["Pi", "Pb"].filter(k => !(p[k] > 0 && p[k] < 1));
  if (bad.length) out.push([bad, "mpt-range-hint", "Pi and Pb must be numbers strictly between 0 and 1."]);
  return out;
}

// n_other cannot exceed the other list items there are; a smaller set size pulls it down.
function capOther() {
  const { set_size, n_other } = readParams(pairs);
  if (!inRange(set_size, 1, MAX.set_size)) return;
  pairs.n_other.setBounds({ max: set_size - 1 });
  if (n_other > set_size - 1) pairs.n_other.value = set_size - 1;
}

// The tree from its branch list: depth runs left to right, leaves stacked in branch order on the right.
// An edge is as wide as the probability that a trial passes along it.
function drawTree(p) {
  const svg = $("mpt-tree");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 1000 250");
  const vals = values(p), root = mptNodes(SPAN_TREE);
  const X = [30, 280, 540], LEAF_X = 790, top = 22, step = 41;
  let leaf = 0;
  const place = (node, reach) => {
    node.reach = reach;
    if (node.cat) { node.x = LEAF_X; node.y = top + step * leaf++; return; }
    node.children.forEach(c => place(c, reach * (c.edge.startsWith("1-") ? 1 - vals[c.edge.slice(2)] : vals[c.edge])));
    node.x = X[node.depth];
    node.y = node.children.reduce((s, c) => s + c.y, 0) / node.children.length;
  };
  place(root, 1);
  const edges = [], nodes = [];
  const walk = n => { nodes.push(n); n.children.forEach(c => { edges.push([n, c]); walk(c); }); };
  walk(root);
  for (const [a, b] of edges) {
    const color = b.cat ? COLOR[b.cat] : "#1a2340";
    el("path", { d: `M${a.x + 6},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x - 6},${b.y}`, fill: "none",
      stroke: color, "stroke-opacity": 0.55, "stroke-width": (1.5 + 14 * b.reach).toFixed(1), "stroke-linecap": "round" }, svg);
    const f = b.edge, v = f.startsWith("1-") ? 1 - vals[f.slice(2)] : vals[f];
    // On the flat end of the edge, where edges leaving one node have separated.
    el("text", { x: b.x - 16, y: b.y - 7, "text-anchor": "end", class: "tree-edge" }, svg)
      .textContent = `${edgeLabel(f, p)} = ${fmt(v, 2)}`;
  }
  for (const n of nodes) {
    if (n.cat) {
      el("circle", { cx: n.x, cy: n.y, r: 6, fill: COLOR[n.cat] }, svg);
      el("text", { x: n.x + 14, y: n.y + 6, class: "tree-leaf", fill: COLOR[n.cat] }, svg).textContent = `${LABEL[n.cat]}  ${fmt(n.reach, 3)}`;
    } else {
      el("circle", { cx: n.x, cy: n.y, r: 7, fill: "#fff", stroke: "#1a2340", "stroke-width": 2.5 }, svg);
      el("text", { x: n.x - 4, y: n.y + 27, class: "tree-state" }, svg).textContent = STATE[n.id];
    }
  }
}

function drawBars(cur, ref) {
  const svg = $("mpt-bars");
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

// P(correct) along three ways of changing the response set from the current composition (as on the M3
// page): lures only, other list items only, or both by the same step. Solid: the tree with Pi and Pb
// fixed. Dotted: M3's simple rule with a and c fixed at the values that match the tree here.
function compositions(p) {
  const lo = -Math.min(p.n_other, p.n_npl), hi = Math.min(p.set_size - 1 - p.n_other, MAX.n_npl - p.n_npl);
  return [
    { color: COLOR.npl, pts: Array.from({ length: MAX.n_npl + 1 }, (_, k) => ({ ...p, n_npl: k })) },
    { color: COLOR.other, pts: Array.from({ length: p.set_size }, (_, k) => ({ ...p, n_other: k })) },
    { color: COLOR.both, pts: Array.from({ length: hi - lo + 1 }, (_, i) => ({ ...p, n_other: p.n_other + lo + i, n_npl: p.n_npl + lo + i })) }
  ];
}

function drawAcross(p, cur, ac) {
  const N = s => 1 + s.n_other + s.n_npl;
  const series = compositions(p).flatMap(comp => [
    { x: comp.pts.map(N), y: comp.pts.map(s => probs(s)[0]), color: comp.color },
    { x: comp.pts.map(N), y: comp.pts.map(s => m3Simple(ac, s)[0]), color: comp.color, width: 2.5 }
  ]);
  const { paths, sx, sy } = linePlot($("mpt-across"), {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, xlim: [1, 21], ylim: [0, 1],
    xticks: [1, 5, 9, 13, 17, 21], yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Response-set size N", ylab: "P(correct)", series
  });
  paths.forEach((path, i) => { if (i % 2) path.setAttribute("stroke-dasharray", "2 5"); });
  el("circle", { cx: sx(N(p)), cy: sy(cur[0]), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, $("mpt-across"));
  const full = { ...p, n_npl: MAX.n_npl };
  $("mpt-across-now").textContent =
    `With the current values, M3's simple rule gives the same proportions at a = ${sig(ac.a)} and c = ${sig(ac.c)} ` +
    `(N = ${N(p)}, P(correct) = ${fmt(cur[0], 2)}). ` +
    (p.n_npl < MAX.n_npl
      ? `With ${MAX.n_npl} lures, the tree predicts ${fmt(probs(full)[0], 2)} and M3 with these a and c ${fmt(m3Simple(ac, full)[0], 2)}.`
      : "");
}

// x in the dmpt() call: 100 trials split as the model predicts, rounded so the counts sum to 100.
function expectedCounts(pr, n = 100) {
  const raw = pr.map(v => v * n), k = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - k[i], i]).sort((u, v) => v[0] - u[0]);
  // Fixed before the loop: recomputing it inside would shrink it with every increment.
  const short = n - k.reduce((s, v) => s + v, 0);
  for (let j = 0; j < short; j++) k[order[j][1]]++;
  return k;
}

function drawCode(p, pr) {
  const N = 1 + p.n_other + p.n_npl;
  const rate = { gl_corr: `1/${1 + p.n_other}`, gl_other: `${p.n_other}/${1 + p.n_other}`, g_corr: `1/${N}`, g_other: `${p.n_other}/${N}`, g_npl: `${p.n_npl}/${N}` };
  const pad = Math.max(...SPAN_TREE.categories.map(c => c.length));
  const empty = [p.n_other === 0 && "other", p.n_npl === 0 && "npl"].filter(Boolean);
  const fit = "fit <- bmm(formula = bmf(Pi ~ 1, Pb ~ 1), data = my_data, model = model)";
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("mpt-code").textContent =
`library(bmm)
span <- mpt_tree("span", list(
${SPAN_TREE.categories.map(c => `  ${c.padEnd(pad)} = "${branchString(SPAN_TREE, c)}"`).join(",\n")}
))
model <- mpt(span, covariates = c(${Object.keys(SPAN_TREE.covariates).map(k => `"${k}"`).join(", ")}))

# guessing rates of the current response set: 1 correct, ${p.n_other} other list items, ${p.n_npl} lures
rates <- c(${Object.entries(rate).map(([k, v]) => `${k} = ${v}`).join(", ")})

# log likelihood of response counts per category; here 100 trials split as predicted.
# pars are probabilities; bmm() estimates logit(Pi) and logit(Pb).
dmpt(x = c(${expectedCounts(pr).join(", ")}), pars = c(Pi = ${p.Pi}, Pb = ${p.Pb}), mpt_model = model, covariates = rates)

# fit: one row per participant and condition, columns corr, other, npl with the counts
# and the five rates as columns
${empty.length
  // What one such response set tells about the parameters: at n_other = 0 Pb drops out of every
  // branch, at n_npl = 0 Pi and Pb enter corr and other only as the product Pi * Pb.
  ? `# bmm() stops on data with rows like this one: ${empty.join(" and ")} cannot occur here (branch
# probability 0), and bmm() needs every branch above 0 in every row. Such rows take a second
# tree that has no branch for ${empty.join(" and ")} and lists ${empty.length > 1 ? "them" : "it"} under mpt_tree(impossible = )
# (mpt_tree() refuses a category given both), chosen per row with mpt(tree_id = ).
# With this response set alone, ${p.n_other === 0 && p.n_npl === 0
  ? "every response is correct, so neither Pi nor Pb is identified"
  : p.n_other === 0 ? "the data identify Pi but not Pb" : "the data identify only the product Pi * Pb"}.
# ${fit}`
  : fit}`;
}

function draw() {
  const t0 = performance.now();
  capOther();
  const p = readParams(pairs), bad = problems(p);
  // Out-of-range input flags its box and dims every output, so nothing reads as the result for it.
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["mpt-widget", "mpt-code", "mpt-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("mpt-n-total").textContent = `N = 1 correct + ${p.n_other} other + ${p.n_npl} lures = ${1 + p.n_other + p.n_npl}`;
  $("mpt-range-hint").textContent = "Sliders move on the logit scale; boxes show Pi and Pb.";
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) return;
  const cur = probs(p);
  drawTree(p);
  drawBars(cur, probs({ ...p, ...PRIOR_MEANS }));
  drawAcross(p, cur, spanTreeToM3(p));
  drawCode(p, cur);
  $("mpt-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

$("mpt-reset").addEventListener("click", () => { setParams(pairs, { ...PRIOR_MEANS, ...START_COUNTS }); draw(); });
$("mpt-copy").addEventListener("click", () => navigator.clipboard?.writeText($("mpt-code").textContent));
for (const k of ["Pi", "Pb"]) pairs[k].setBounds(BOUNDS);
setParams(pairs, { ...PRIOR_MEANS, ...START_COUNTS });
draw();
initInfo();
