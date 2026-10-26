// Page script for models/sdt_mafc.qmd: m-alternative forced choice under bmm's four evidence distributions,
// accuracy by d and across m.
import { mafcLogitPc, mafcPc, dsdtMafc, mafcMatchD, maxCompetitorPdf, DISTS } from "../models/sdt.js";
import { bindParams, readParams, setParams, fmt } from "../lib/widget.js";
import { linePlot, el, clear } from "../lib/plot.js";
import { linspace } from "../lib/math.js";
import { latentPlot, SIGNAL, DIST_COLOR, DIST_NAMES } from "../lib/sdt-plot.js";

// bmm's quadrature rules for normal (m > 2) and logistic noise, written from bmm by R/make_fixtures.R. Without
// them those two distributions are switched off rather than computed on other nodes.
const RULES = await fetch(new URL("../../tests/parity/fixtures/nodes.json", import.meta.url))
  .then(r => (r.ok ? r.json() : null))
  .then(j => {
    const gh = j?.cells.find(c => c.fn === ".mafc_gh"), gl = j?.cells.find(c => c.fn === ".mafc_gl");
    return gh && gl ? { gh, gl } : null;
  }).catch(() => null);

// bmm's default prior for d in sdt_mafc(): normal(1, 1), identity link. The slider spans mean +- 3 SD.
const PRIOR_D = [1, 1];
const M_MAX = 10, START = { d: 1, m: 4 };
const GREY = "#595959";
const XLIM = [-5, 8];

const $ = id => document.getElementById(id);
const pairs = bindParams({ d: ["sdtmafc-d", "sdtmafc-d-num"], m: ["sdtmafc-m", "sdtmafc-m-num"] }, draw);
const dist = () => $("sdtmafc-dist").value;
const pc = (d, m, ds = dist()) => mafcPc(d, m, ds, RULES);
const M = Array.from({ length: M_MAX - 1 }, (_, i) => i + 2);

function problems(p) {
  const out = [];
  if (!(Number.isInteger(p.m) && p.m >= 2 && p.m <= M_MAX)) out.push([["m"], "sdtmafc-m-hint", `m must be a whole number from 2 to ${M_MAX}.`]);
  if (!Number.isFinite(p.d)) out.push([["d"], "sdtmafc-range-hint", "d must be a number."]);
  return out;
}

// One trial: m tiles, the signal in a fixed slot, in up to two rows of five.
function drawTiles(m) {
  const svg = $("sdtmafc-tiles");
  clear(svg);
  svg.setAttribute("viewBox", "0 0 440 250");
  const target = Math.min(1, m - 1), cols = Math.min(m, 5), size = 64, gap = 18;
  const x0 = (440 - cols * size - (cols - 1) * gap) / 2, y0 = m > 5 ? 34 : 76;
  for (let i = 0; i < m; i++) {
    const x = x0 + (i % 5) * (size + gap), y = y0 + Math.floor(i / 5) * (size + 40);
    const sig = i === target;
    el("rect", { x, y, width: size, height: size, rx: 10, fill: sig ? "#fbebe0" : "#f3f4f7", stroke: sig ? SIGNAL : "#a3adb7", "stroke-width": sig ? 4 : 2.5 }, svg);
    el("text", { x: x + size / 2, y: y + size / 2 + 9, "text-anchor": "middle", class: "task-letter", fill: sig ? SIGNAL : GREY }, svg).textContent = i + 1;
  }
  el("text", { x: 220, y: 236, "text-anchor": "middle", class: "task-note" }, svg).textContent = `${m} alternatives, 1 holds the signal`;
}

function drawLatent(p) {
  const D = DISTS[dist()];
  const comp = x => maxCompetitorPdf(x, p.m, dist());
  // The signal's label on the right flank of its density, the strongest distractor's ending at its peak,
  // where the two curves have separated.
  const xs = linspace(XLIM[0], XLIM[1], 261), ys = xs.map(comp), top = ys.indexOf(Math.max(...ys));
  latentPlot($("sdtmafc-latent"), {
    W: 700, H: 250, xlim: XLIM, xticks: [-4, -2, 0, 2, 4, 6, 8], xlab: "Evidence (distractors at 0, scale 1)",
    curves: [
      { f: x => D.pdf(x), color: GREY, dashed: true, width: 2.5 },
      { f: comp, color: GREY },
      { f: x => D.pdf(x - p.d), color: SIGNAL }
    ],
    notes: [
      { x: p.d + 1.2, density: D.pdf(1.2), text: "signal", color: SIGNAL, anchor: "start" },
      ...(p.m > 2 ? [{ x: xs[top] - 0.1, density: ys[top], text: `strongest of ${p.m - 1}`, color: GREY, anchor: "end" }] : [])
    ]
  });
}

const [dLo, dHi] = [PRIOR_D[0] - 3 * PRIOR_D[1], PRIOR_D[0] + 3 * PRIOR_D[1]];
function drawByD(p, cur) {
  const ds = linspace(dLo, dHi, 121);
  const svg = $("sdtmafc-byd");
  const { paths, sx, sy } = linePlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, xlim: [dLo, dHi], ylim: [0, 1],
    xticks: [-2, -1, 0, 1, 2, 3, 4], yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "d", ylab: "P(correct)",
    series: [
      { x: [dLo, dHi], y: [1 / p.m, 1 / p.m], color: "#9aa3ad", width: 2 },
      { x: [PRIOR_D[0], PRIOR_D[0]], y: [0, 1], color: "#5a6472", dashed: true, width: 2 },
      { x: ds, y: ds.map(d => pc(d, p.m)), color: DIST_COLOR[dist()] }
    ]
  });
  paths[0].setAttribute("stroke-dasharray", "2 5");
  if (p.d >= dLo && p.d <= dHi) el("circle", { cx: sx(p.d), cy: sy(cur), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, svg);
}

// P(correct) across m with d fixed: the chosen distribution (solid) and the other three, each at the d that
// gives the same accuracy at the current m (dotted).
function drawAcross(p, cur) {
  const lg = mafcLogitPc(p.d, p.m, dist(), RULES);
  const others = DIST_NAMES.filter(n => n !== dist() && available(n)).map(n => ({ n, d: mafcMatchD(lg, p.m, n, RULES) }));
  const svg = $("sdtmafc-across");
  const { paths, sx, sy } = linePlot(svg, {
    W: 500, H: 300, margin: { l: 64, r: 10, t: 12, b: 50 }, xlim: [2, M_MAX], ylim: [0, 1],
    xticks: [2, 4, 6, 8, 10], yticks: [0, 0.25, 0.5, 0.75, 1], xlab: "Alternatives m", ylab: "P(correct)",
    series: [
      { x: M, y: M.map(m => 1 / m), color: "#9aa3ad", width: 2 },
      ...others.map(o => ({ x: M, y: M.map(m => pc(o.d, m, o.n)), color: DIST_COLOR[o.n], width: 2.5 })),
      { x: M, y: M.map(m => pc(p.d, m)), color: DIST_COLOR[dist()] }
    ]
  });
  paths.slice(0, -1).forEach(path => path.setAttribute("stroke-dasharray", "2 5"));
  el("circle", { cx: sx(p.m), cy: sy(cur), r: 7, fill: "#fff", stroke: "#222", "stroke-width": 2.5 }, svg);
  const name = n => `<span style="color:${DIST_COLOR[n]};font-weight:600">${n}</span>`;
  $("sdtmafc-across-legend").innerHTML = `Solid: ${name(dist())} at d = ${fmt(p.d, 2)}. Dotted: ` +
    others.map(o => `${name(o.n)} (d = ${fmt(o.d, 2)})`).join(", ") + ", each with the same P(correct) at the circle; grey: chance.";
  const far = p.m === M_MAX ? 2 : M_MAX;
  $("sdtmafc-across-now").textContent = `With the current values, ${dist()} noise gives P(correct) = ${fmt(cur, 2)} at m = ${p.m}. ` +
    `At m = ${far} it predicts ${fmt(pc(p.d, far), 2)}, and the other distributions, matched at m = ${p.m}, predict ` +
    others.map(o => `${fmt(pc(o.d, far, o.n), 2)} (${o.n})`).join(", ") + ".";
}

function drawCode(p, cur) {
  const k = Math.round(100 * cur);
  // R code: plain ASCII digits and minus, so the snippet pastes into R unchanged.
  $("sdtmafc-code").textContent =
`library(bmm)
model <- sdt_mafc(response = "n_correct", n_trials = "n_trials", m = ${p.m}, dist = "${dist()}")

# log likelihood of ${k} correct responses in 100 trials, the predicted count (100 x P(correct), rounded)
dsdt_mafc(n_correct = ${k}, n_trials = 100, m = ${p.m}, d = ${p.d}, dist = "${dist()}", log = TRUE)

# fit: one row per participant and condition, columns n_correct and n_trials. With m varying
# between rows, name its column instead: sdt_mafc(..., m = "m")
fit <- bmm(formula = bmf(d ~ 1), data = my_data, model = model)`;
  $("sdtmafc-code").dataset.logd = dsdtMafc(k, 100, p.m, p.d, dist(), RULES);
}

// Normal noise at m > 2 and logistic noise need bmm's nodes.
const available = n => RULES || n === "gumbel_min" || n === "gumbel_max";

function draw() {
  const t0 = performance.now();
  const p = readParams(pairs), bad = problems(p);
  const flagged = new Set(bad.flatMap(([fields]) => fields));
  for (const [k, pair] of Object.entries(pairs)) {
    pair.num.classList.toggle("ex-invalid", flagged.has(k));
    pair.num.setAttribute("aria-invalid", flagged.has(k));
  }
  for (const id of ["sdtmafc-widget", "sdtmafc-code", "sdtmafc-across-now"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("sdtmafc-m-hint").textContent = "Alternatives per trial, the signal and m − 1 distractors.";
  $("sdtmafc-range-hint").textContent = "Slider: bmm's prior mean ± 3 SD." +
    (RULES ? "" : " normal and logistic are off: bmm's quadrature nodes did not load.");
  for (const [, hint, msg] of bad) $(hint).textContent = msg;
  if (bad.length) return;
  const cur = pc(p.d, p.m);
  drawTiles(p.m);
  drawLatent(p);
  drawByD(p, cur);
  drawAcross(p, cur);
  drawCode(p, cur);
  $("sdtmafc-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

if (!RULES) {
  for (const o of $("sdtmafc-dist").options) o.disabled = !available(o.value);
  $("sdtmafc-dist").value = "gumbel_min";
}
$("sdtmafc-dist").addEventListener("change", draw);
$("sdtmafc-reset").addEventListener("click", () => { setParams(pairs, START); draw(); });
$("sdtmafc-copy").addEventListener("click", () => navigator.clipboard?.writeText($("sdtmafc-code").textContent));
pairs.d.setBounds({ min: dLo, max: dHi, step: 0.05 });
setParams(pairs, START);
draw();
