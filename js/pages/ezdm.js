// Page script for models/ezdm.qmd: the EZ diffusion model, versions "3par" and "4par". The page shows the
// forward EZ map (parameters to summary statistics) and dezdm() for the call in the In bmm section.
import { ezdmMoments3par, ezdmMoments4par, dezdm } from "../models/rt.js";
import { bindParams, readParams, setParams, fmt, rValue, LINEAR, LOG, LOGIT } from "../lib/widget.js";
import { el, clear, scales } from "../lib/plot.js";
import { drawDiffusion, timeAxis, BLUE, ORANGE, GREY } from "../lib/rt-plot.js";
import { autoAxis, niceAxis } from "../lib/axis.js";
import { initInfo } from "../lib/info.js";
import { simControls, simLine, pair } from "../lib/sim-panel.js";
import { ezdmCells, ezdmExpected, ezdmCellStats, ezdmCountTerms, EZ_STRIDE, EZ_MAX_TRIALS } from "../lib/simulate-rt.js";

// bmm's default priors for ezdm(), [mean, sd, scale, step] on the link scale; the sliders span mean +- 3 SD
// and start at the means. drift's cauchy(0, 1) has no SD; its slider spans location +- 3 scale.
const PRIOR = { drift: [0, 1, LINEAR, 0.05], bound: [0, 0.5, LOG, 0.02], ndt: [-1.5, 0.5, LOG, 0.02], zr: [0, 0.5, LOGIT, 0.02] };
const START = { ...Object.fromEntries(Object.entries(PRIOR).map(([k, [m, , sc]]) => [k, sc.fromRange(m)])), n_trials: 100 };
const N_MAX = EZ_MAX_TRIALS;

const $ = id => document.getElementById(id);
const pairs = bindParams({ ...Object.fromEntries(Object.keys(PRIOR).map(k => [k, [`ezdm-${k}`, `ezdm-${k}-num`]])),
  n_trials: ["ezdm-n", "ezdm-n-num"] }, draw);
for (const [k, [m, sd, scale, step]] of Object.entries(PRIOR)) pairs[k].setBounds({ min: m - 3 * sd, max: m + 3 * sd, step, scale });
const versionInputs = [...document.querySelectorAll('input[name="ezdm-version"]')];
const version = () => versionInputs.find(r => r.checked).value;

// [field, message] for each value the model is not defined at. dezdm() needs n_trials > 2.
const problems = (p, v) => [
  ["drift", Number.isFinite(p.drift), "drift a number"], ["bound", p.bound > 0, "bound positive"],
  ["ndt", p.ndt > 0, "ndt positive"], ["zr", v === "3par" || (p.zr > 0 && p.zr < 1), "zr between 0 and 1"],
  ["n_trials", Number.isInteger(p.n_trials) && p.n_trials >= 3 && p.n_trials <= N_MAX, `n_trials a whole number 3–${N_MAX}`]
].filter(([, ok]) => !ok).map(([k, , msg]) => [k, msg]);

// The n_upper the R snippet prints for n trials; dezdm() counts the lower responses as n_trials - n_upper.
const nUpperOf = (pC, n) => Math.round(pC * n);

// The forward map: P(upper), and mean and SD of the rt (ndt plus the decision time) for each row the
// version has: one for all responses in 3par, one per boundary in 4par.
function stats(p, v) {
  if (v === "3par") {
    const m = ezdmMoments3par(p);
    return { pC: m.pC, rows: [{ label: "rt, all", color: BLUE, mean: p.ndt + m.MDT, vrt: m.VRT }] };
  }
  const m = ezdmMoments4par(p);
  return { pC: m.pC, rows: [
    { label: "rt, upper", color: BLUE, mean: p.ndt + m.mdt_upper, vrt: m.vrt_upper },
    { label: "rt, lower", color: ORANGE, mean: p.ndt + m.mdt_lower, vrt: m.vrt_lower }] };
}

const W = 500, H = 300;
function drawStats(p, s, ref, axis) {
  const svg = $("ezdm-stats");
  clear(svg);
  const m = { l: 110, r: 16 }, rowH = 70, top = 24;
  // P(upper): a bar on [0, 1].
  const px = scales({ W, H, margin: { ...m, t: 0, b: 0 }, xlim: [0, 1], ylim: [0, 1] }).sx;
  el("text", { x: m.l - 10, y: top + 26, "text-anchor": "end", class: "tick" }, svg).textContent = "P(upper)";
  el("rect", { x: px(0), y: top + 8, width: px(1) - px(0), height: 26, fill: "#f0f2f4" }, svg);
  el("rect", { x: px(0), y: top + 8, width: px(s.pC) - px(0), height: 26, fill: BLUE, "fill-opacity": 0.9 }, svg);
  el("line", { x1: px(ref.pC), x2: px(ref.pC), y1: top + 2, y2: top + 40, stroke: "#222", "stroke-width": 2.5, "stroke-dasharray": "5 4" }, svg);
  el("text", { x: px(1), y: top, "text-anchor": "end", class: "tick" }, svg).textContent = fmt(s.pC, 2);
  // Rows of rt: ndt in grey, the mean decision time, and +-1 SD around the mean rt.
  const tx = scales({ W, H, margin: { ...m, t: 0, b: 0 }, xlim: axis.xlim, ylim: [0, 1] }).sx;
  const y0 = top + 70, yAxis = y0 + s.rows.length * rowH + 4;
  s.rows.forEach((row, i) => {
    const y = y0 + i * rowH, sd = Math.sqrt(row.vrt), refRow = ref.rows[i];
    el("text", { x: m.l - 10, y: y + 24, "text-anchor": "end", class: "tick" }, svg).textContent = row.label;
    el("rect", { x: tx(0), y: y + 8, width: tx(p.ndt) - tx(0), height: 24, class: "rt-ndt" }, svg);
    el("rect", { x: tx(p.ndt), y: y + 8, width: Math.max(0, tx(row.mean) - tx(p.ndt)), height: 24, fill: row.color, "fill-opacity": 0.85 }, svg);
    // The -1 SD whisker stops at rt 0, without an end tick, where a wide SD would run into the labels.
    const left = Math.max(0, row.mean - sd);
    el("path", { d: `M${tx(left)},${y + 20}H${tx(row.mean + sd)}${left > 0 ? `M${tx(left)},${y + 12}V${y + 28}` : ""}M${tx(row.mean + sd)},${y + 12}V${y + 28}`,
      stroke: "#222", "stroke-width": 2.5, fill: "none" }, svg);
    el("line", { x1: tx(refRow.mean), x2: tx(refRow.mean), y1: y + 2, y2: y + 38, stroke: "#222", "stroke-width": 2.5, "stroke-dasharray": "5 4" }, svg);
    el("text", { x: tx(axis.xlim[1]), y: y + 2, "text-anchor": "end", class: "tick" }, svg).textContent =
      `mean ${fmt(row.mean, 2)} s, SD ${fmt(sd, 2)} s`;
  });
  el("line", { x1: tx(axis.xlim[0]), x2: tx(axis.xlim[1]), y1: yAxis, y2: yAxis, stroke: "#999", "stroke-width": 1.5 }, svg);
  axis.xticks.forEach(v => {
    el("line", { x1: tx(v), x2: tx(v), y1: yAxis, y2: yAxis + 6, stroke: "#999", "stroke-width": 1.5 }, svg);
    el("text", { x: tx(v), y: yAxis + 26, "text-anchor": "middle", class: "tick" }, svg).textContent = String(v);
  });
  el("text", { x: (m.l + W - m.r) / 2, y: yAxis + 52, "text-anchor": "middle", class: "axis-label" }, svg).textContent = "rt (s)";
  // The box ends below the axis label: one rt row in 3par, two in 4par.
  svg.setAttribute("viewBox", `0 0 ${W} ${yAxis + 60}`);
}

// How far the observed statistics of one cell scatter around the predicted ones as n_trials changes, drawn with or
// without a sample: +-2 SD of the proportion of upper responses (binomial) and of each observed mean rt. Under bmm's
// sampling model the observed mean of k rts has variance VRT / k (normal given the observed variance, which is gamma
// with mean VRT). In 3par k is n_trials. In 4par k is the binomial count at that boundary, and a cell has the
// boundary's statistics only with k >= 2 (rezdm() gives NA, dezdm() drops the terms), so the band is +-2
// sqrt(VRT E(1 / k | k >= 2)), the SD of the points and of the summary line's "SD across cells" (ezdmCountTerms()).
// It starts at the first n_trials of NS4 where at least 1 cell in 1000 has 2 responses there (BAND_SHARE), or is not
// drawn; a sample's rare cells below that are still drawn as points.
const NS = [3, 4, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500];
// 4par: every n_trials up to 30, where the SD bends as cells with 2 responses become common, then 30 steps even on
// the log axis.
const NS4 = [...new Set([...Array.from({ length: 28 }, (_, i) => i + 3),
  ...Array.from({ length: 30 }, (_, i) => Math.round(30 * (N_MAX / 30) ** ((i + 1) / 30)))])];
const BAND_SHARE = 1e-3;
const timeAuto = autoAxis(draw, { nice: niceAxis }), rtAuto = autoAxis(draw, { nice: niceAxis });
// The simulated cells: one block of EZ_STRIDE uniforms per cell (simulate-rt.js, ezdmCells()).
const sim = simControls("ezdm", draw, EZ_STRIDE);
// Points of one statistic, one per cell, at x with a sideways spread of up to 14 px from the golden-ratio sequence
// (cell i at the fractional part of 0.618 i), so that equal values do not hide each other. One path per colour.
function points(svg, sc, x, ys, color, clip) {
  const r = 2.6, d = ys.map((y, i) => Number.isNaN(y) ? "" :
    `M${(sc.sx(x) - 7 + 14 * ((i * 0.6180339887) % 1) - r).toFixed(1)},${sc.sy(y).toFixed(1)}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0`).join("");
  el("path", { d, fill: color, "fill-opacity": 0.55, stroke: "#222", "stroke-width": 0.6, "clip-path": clip }, svg);
}
// The mean-rt panel's floor moves in whole ticks; like its top, it stays while the bands keep above it and
// come within two ticks of it.
let rtFloor = 0;
function drawAcross(p, s, cells) {
  const svg = $("ezdm-across");
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  // Sample points are cut at the edge of their panel.
  const defs = el("defs", {}, svg);
  const clipTo = (name, sc, ylim, pad = 3) => {
    const cp = el("clipPath", { id: `ezdm-across-${name}` }, defs);
    // 10 px beyond the ends of the n_trials axis, so that the sideways spread of up to 7 px + r keeps all points at
    // n_trials 3 and 500; pad px above and below the range.
    el("rect", { x: sc.sx(lx(3)) - 10, y: sc.sy(ylim[1]) - pad, width: sc.sx(lx(N_MAX)) - sc.sx(lx(3)) + 20, height: sc.sy(ylim[0]) - sc.sy(ylim[1]) + 2 * pad }, cp);
    return `url(#ezdm-across-${name})`;
  };
  const m = { l: 64, r: 12 }, lx = n => Math.log(n);
  const panel = (t, b, ylim, yticks, ylab) => {
    const sc = scales({ W, H, margin: { ...m, t, b }, xlim: [lx(3), lx(N_MAX)], ylim });
    yticks.forEach(v => {
      el("line", { x1: sc.sx(lx(3)), x2: sc.sx(lx(N_MAX)), y1: sc.sy(v), y2: sc.sy(v), class: "grid" }, svg);
      el("text", { x: m.l - 8, y: sc.sy(v) + 6, "text-anchor": "end", class: "tick" }, svg).textContent = String(v);
    });
    el("text", { x: 16, y: (sc.sy(ylim[0]) + sc.sy(ylim[1])) / 2, "text-anchor": "middle", class: "axis-label",
      transform: `rotate(-90 16 ${(sc.sy(ylim[0]) + sc.sy(ylim[1])) / 2})` }, svg).textContent = ylab;
    return sc;
  };
  // centre +- half[i] at n_trials ns[i], clipped to the panel's range (clip, if given, cuts the line there too).
  const band = (sc, centre, ns, half, color, [ymin, ymax] = [-Infinity, Infinity], clip) => {
    const n0 = ns[0];
    const at = (n, y) => sc.sx(lx(n)).toFixed(1) + "," + sc.sy(Math.min(ymax, Math.max(ymin, y))).toFixed(1);
    const up = ns.map((n, i) => at(n, centre + half[i])), lo = ns.map((n, i) => at(n, centre - half[i])).reverse();
    const cut = clip ? { "clip-path": clip } : {};
    el("path", { d: "M" + up.join("L") + "L" + lo.join("L") + "Z", fill: color, "fill-opacity": 0.22, stroke: color, "stroke-width": 1.5, ...cut }, svg);
    el("line", { x1: sc.sx(lx(n0)), x2: sc.sx(lx(N_MAX)), y1: sc.sy(centre), y2: sc.sy(centre), stroke: color, "stroke-width": 2.5, ...cut }, svg);
  };
  const pSc = panel(14, 178, [0, 1], [0, 0.5, 1], "P(upper)");
  band(pSc, s.pC, NS, NS.map(n => 2 * Math.sqrt(s.pC * (1 - s.pC) / n)), GREY, [0, 1]);
  if (cells) points(svg, pSc, lx(p.n_trials), cells.map(c => c.n_upper / p.n_trials), "#222", clipTo("p", pSc, [0, 1]));
  // Lower panel: observed mean rt for each row whose band is drawn. The axis is sized from the widest band of the rows
  // that 1 cell in 1000 has at the current n_trials (all drawn rows if none): a boundary that is rare there would
  // otherwise stretch it to a band that starts at a larger n_trials. Bands beyond the axis are cut at its edge.
  const terms = s.rows.length > 1 ? NS4.map(n => ezdmCountTerms(s.pC, n)) : null;
  const shown = s.rows.map((row, j) => {
    if (!terms) return { ...row, j, ns: NS, half: NS.map(n => 2 * Math.sqrt(row.vrt / n)) };
    const at = NS4.map((n, i) => [n, terms[i][j]]).filter(([, t]) => t.share >= BAND_SHARE && Number.isFinite(t.inv));
    return { ...row, j, ns: at.map(([n]) => n), half: at.map(([, t]) => 2 * Math.sqrt(row.vrt * t.inv)) };
  }).filter(row => row.ns.length > 0);
  const now = terms && ezdmCountTerms(s.pC, p.n_trials), common = shown.filter(r => !now || now[r.j].share >= BAND_SHARE);
  const sized = common.length ? common : shown;
  const lo = Math.min(...sized.map(r => r.mean - Math.max(...r.half))), hi = Math.max(...sized.map(r => r.mean + Math.max(...r.half)));
  const { ylim, yticks } = rtAuto.next(hi);
  // While the top eases up from far below, the axis can hold its 0 tick only; the step is then the top.
  const tick = yticks[1] - yticks[0] || ylim[1];
  if (!(lo >= rtFloor && lo < rtFloor + 2 * tick)) rtFloor = Math.max(0, Math.floor(lo / tick) * tick);
  // While the top eases up to a jump in the bands, it can still be below their floor for a few frames.
  const rtTop = Math.max(ylim[1], rtFloor + tick);
  const rtSc = panel(146, 50, [rtFloor, rtTop], yticks.filter(v => v >= rtFloor - 1e-9 && v <= rtTop + 1e-9), "mean rt (s)");
  const bandClip = clipTo("rt-band", rtSc, [rtFloor, rtTop], 1.5);
  shown.forEach(row => band(rtSc, row.mean, row.ns, row.half, row.color, [rtFloor, rtTop], bandClip));
  // Points for every row, also where its band is not drawn (a rare cell with 2 responses); a point beyond the axis is
  // cut at the edge.
  if (cells) {
    const clip = clipTo("rt", rtSc, [rtFloor, rtTop]);
    s.rows.forEach((row, j) => points(svg, rtSc, lx(p.n_trials), cells.map(c => (s.rows.length > 1 ? c.mean_rt[j] : c.mean_rt)), row.color, clip));
  }
  [3, 10, 30, 100, 300].forEach(n => {
    el("text", { x: rtSc.sx(lx(n)), y: H - 26, "text-anchor": "middle", class: "tick" }, svg).textContent = String(n);
  });
  el("text", { x: (m.l + W - m.r) / 2, y: H - 2, "text-anchor": "middle", class: "axis-label" }, svg).textContent = "n_trials (log scale)";
  el("line", { x1: rtSc.sx(lx(p.n_trials)), x2: rtSc.sx(lx(p.n_trials)), y1: 10, y2: H - 46, stroke: "#222", "stroke-width": 2, "stroke-dasharray": "5 4" }, svg);
}

// R code: plain ASCII digits and minus, so the snippet pastes into R unchanged. The parameters are rounded
// as printed (rValue) before dezdm() runs, so the comment is what R returns for the printed call.
function drawCode(p, s, v) {
  const n = p.n_trials, nUpper = nUpperOf(s.pC, n);
  const pr = { drift: rValue(p.drift), bound: rValue(p.bound), ndt: rValue(p.ndt), zr: rValue(p.zr, true) };
  const means = s.rows.map(row => +row.mean.toFixed(3)), vars = s.rows.map(row => rValue(row.vrt));
  const four = v === "4par";
  const vec = xs => (four ? `c(${xs.join(", ")})` : String(xs[0]));
  const ll = dezdm({ mean_rt: four ? means : means[0], var_rt: four ? vars : vars[0], n_upper: nUpper, n_trials: n, ...pr, version: v });
  const cols = four
    ? `mean_rt = c("mean_rt_upper", "mean_rt_lower"), var_rt = c("var_rt_upper", "var_rt_lower"),\n              `
    : 'mean_rt = "mean_rt", var_rt = "var_rt", ';
  $("ezdm-code").textContent =
`library(bmm)
model <- ezdm(${cols}n_upper = "n_upper", n_trials = "n_trials", version = "${v}")

# log likelihood of one cell's summary statistics; here the values the parameters predict for ${n} trials
dezdm(mean_rt = ${vec(means)}, var_rt = ${vec(vars)}, n_upper = ${nUpper}, n_trials = ${n},
      drift = ${pr.drift}, bound = ${pr.bound}, ndt = ${pr.ndt}${four ? `, zr = ${pr.zr}` : ""}, version = "${v}")
# ${ll.toFixed(4)}

${sim.on ? `# simulate ${sim.n} cells of ${n} trials: the mean of each statistic over the cells, and the SD of the observed means
y <- rezdm(n = ${sim.n}, n_trials = ${n}, drift = ${pr.drift}, bound = ${pr.bound}, ndt = ${pr.ndt}${four ? `, zr = ${pr.zr}` : ""}, version = "${v}")
${four
  ? `c(p_upper = mean(y$n_upper / y$n_trials), colMeans(y[c("mean_rt_upper", "mean_rt_lower", "var_rt_upper", "var_rt_lower")], na.rm = TRUE),
  sd_mean_rt_upper = sd(y$mean_rt_upper, na.rm = TRUE), sd_mean_rt_lower = sd(y$mean_rt_lower, na.rm = TRUE))`
  : `c(p_upper = mean(y$n_upper / y$n_trials), colMeans(y[c("mean_rt", "var_rt")]), sd_mean_rt = sd(y$mean_rt))`}

` : ""}# fit: one row per participant and condition with the summary statistics, see ezdm_summary_stats()
fit <- bmm(formula = bmf(drift ~ 1, bound ~ 1, ndt ~ 1${four ? ", zr ~ 1" : ""}), data = my_data, model = model)`;
}

// The summary line of the simulated cells: expected and, in brackets, this sample's P(upper), and per row the mean of
// the observed mean rts, their SD across cells and the mean observed variance. In 4par a boundary with fewer than 2
// responses in a cell has no statistics there; the line counts such cells.
function cellLine(p, v, cells) {
  const e = ezdmExpected(p, v, p.n_trials), got = ezdmCellStats(cells, p.n_trials, v);
  const s = x => (Number.isFinite(x) ? fmt(x, 3) : "–");
  const names = v === "4par" ? ["upper", "lower"] : [""];
  simLine(sim, () => `Expected (these ${sim.n} cells of ${p.n_trials} trials): P(upper) ${pair(e.pUpper, got.pUpper)}; ` +
    e.rows.map((r, j) => {
      const g = got.rows[j], missing = cells.length - g.count, name = names[j];
      const sfx = v === "4par" ? `_${name}` : "";
      if (g.count === 0) return `${name}: no cell has 2 ${name} responses`;
      return `mean_rt${sfx} ${s(r.mean)} (${s(g.mean)}) s, SD across cells ${s(r.sdMean)} (${s(g.sdMean)}) s, ` +
        `var_rt${sfx} ${s(r.varRt)} (${s(g.varRt)}) s²` +
        (missing ? `, ${missing} cell${missing > 1 ? "s" : ""} with fewer than 2 ${name} responses` : "");
    }).join("; ") + ".");
}

function draw() {
  const t0 = performance.now();
  const v = version(), p = readParams(pairs), bad = problems(p, v);
  for (const e of document.querySelectorAll(".ezdm-4par-only")) e.hidden = v !== "4par";
  for (const [k, pair] of Object.entries(pairs)) {
    const off = bad.some(([f]) => f === k);
    pair.num.classList.toggle("ex-invalid", off);
    pair.num.setAttribute("aria-invalid", off);
  }
  for (const id of ["ezdm-widget", "ezdm-code"]) $(id).classList.toggle("ex-stale", bad.length > 0);
  $("ezdm-hint").textContent = bad.length ? `Needed: ${bad.map(([, msg]) => msg).join(", ")}.`
    : `bound, ndt: log scale${v === "4par" ? "; zr: logit scale" : ""}. The boxes show the values.`;
  if (bad.length) { sim.text.hidden = true; return; }
  const q = v === "3par" ? { ...p, zr: 0.5 } : p;
  const s = stats(q, v), ref = stats({ ...START, n_trials: p.n_trials }, v);
  const axis = timeAxis(Math.max(...[...s.rows, ...ref.rows].map(row => row.mean + 2 * Math.sqrt(row.vrt))), timeAuto);
  drawDiffusion($("ezdm-task"), { mode: "ddm", ...q, ...axis });
  drawStats(q, s, ref, axis);
  const cells = sim.on ? ezdmCells(q, v, p.n_trials, sim.us, sim.n) : null;
  drawAcross(q, s, cells);
  if (cells) cellLine(q, v, cells);
  else sim.text.hidden = true;
  drawCode(q, s, v);
  $("ezdm-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

versionInputs.forEach(i => i.addEventListener("change", draw));
$("ezdm-reset").addEventListener("click", () => { setParams(pairs, START); sim.reset(); draw(); });
$("ezdm-copy").addEventListener("click", () => navigator.clipboard?.writeText($("ezdm-code").textContent));
pairs.n_trials.setBounds({ min: 3, max: N_MAX, step: 1 });
setParams(pairs, START);
draw();
initInfo();
