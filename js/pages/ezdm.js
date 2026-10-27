// Page script for models/ezdm.qmd: the EZ diffusion model, versions "3par" and "4par". The page shows the
// forward EZ map (parameters to summary statistics) and dezdm() for the call in the In bmm section.
import { ezdmMoments3par, ezdmMoments4par, dezdm } from "../models/rt.js";
import { bindParams, readParams, setParams, fmt, rValue, LINEAR, LOG, LOGIT } from "../lib/widget.js";
import { el, clear, scales } from "../lib/plot.js";
import { drawDiffusion, timeAxis, BLUE, ORANGE, GREY } from "../lib/rt-plot.js";
import { autoAxis, niceAxis } from "../lib/axis.js";
import { initInfo } from "../lib/info.js";

// bmm's default priors for ezdm(), [mean, sd, scale, step] on the link scale; the sliders span mean +- 3 SD
// and start at the means. drift's cauchy(0, 1) has no SD; its slider spans location +- 3 scale.
const PRIOR = { drift: [0, 1, LINEAR, 0.05], bound: [0, 0.5, LOG, 0.02], ndt: [-1.5, 0.5, LOG, 0.02], zr: [0, 0.5, LOGIT, 0.02] };
const START = { ...Object.fromEntries(Object.entries(PRIOR).map(([k, [m, , sc]]) => [k, sc.fromRange(m)])), n_trials: 100 };
const N_MAX = 500;

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
// version has: one for all responses in 3par, one per boundary in 4par. count(n) is the number of
// responses the row's rt statistics come from in the printed call for n trials.
function stats(p, v) {
  if (v === "3par") {
    const m = ezdmMoments3par(p);
    return { pC: m.pC, rows: [{ label: "rt, all", color: BLUE, mean: p.ndt + m.MDT, vrt: m.VRT, share: 1, count: n => n }] };
  }
  const m = ezdmMoments4par(p);
  return { pC: m.pC, rows: [
    { label: "rt, upper", color: BLUE, mean: p.ndt + m.mdt_upper, vrt: m.vrt_upper, share: m.pC, count: n => nUpperOf(m.pC, n) },
    { label: "rt, lower", color: ORANGE, mean: p.ndt + m.mdt_lower, vrt: m.vrt_lower, share: 1 - m.pC,
      count: n => n - nUpperOf(m.pC, n) }] };
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

// How far the observed statistics of one cell scatter around the predicted ones as n_trials changes:
// +-2 SD of the proportion of upper responses (binomial) and of each observed mean rt. Under bmm's
// sampling model the observed mean has variance VRT / n (normal given the observed variance, which is
// gamma with mean VRT); in 4par n is the expected count at that boundary. dezdm() drops a boundary's rt
// terms below 2 responses, so its band starts at the first n_trials whose printed call has 2 responses
// there (after rounding, an expected count of about 1.5), or is not drawn.
const NS = [3, 4, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500];
const timeAuto = autoAxis(draw, { nice: niceAxis }), rtAuto = autoAxis(draw, { nice: niceAxis });
// The mean-rt panel's floor moves in whole ticks; like its top, it stays while the bands keep above it and
// come within two ticks of it.
let rtFloor = 0;
function drawAcross(p, s) {
  const svg = $("ezdm-across");
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
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
  // centre +- half(n) from n0 to N_MAX, clipped to the panel's range.
  const band = (sc, centre, half, color, n0, [ymin, ymax] = [-Infinity, Infinity]) => {
    const ns = [n0, ...NS.filter(n => n > n0)];
    const at = (n, y) => sc.sx(lx(n)).toFixed(1) + "," + sc.sy(Math.min(ymax, Math.max(ymin, y))).toFixed(1);
    const up = ns.map(n => at(n, centre + half(n))), lo = ns.map(n => at(n, centre - half(n))).reverse();
    el("path", { d: "M" + up.join("L") + "L" + lo.join("L") + "Z", fill: color, "fill-opacity": 0.22, stroke: color, "stroke-width": 1.5 }, svg);
    el("line", { x1: sc.sx(lx(n0)), x2: sc.sx(lx(N_MAX)), y1: sc.sy(centre), y2: sc.sy(centre), stroke: color, "stroke-width": 2.5 }, svg);
  };
  band(panel(14, 178, [0, 1], [0, 0.5, 1], "P(upper)"), s.pC, n => 2 * Math.sqrt(s.pC * (1 - s.pC) / n), GREY, 3, [0, 1]);
  // Lower panel: observed mean rt for each row whose band is drawn, axis from the widest band drawn.
  const shown = s.rows.map(row => ({ ...row, n0: Array.from({ length: N_MAX - 2 }, (_, i) => i + 3).find(n => row.count(n) >= 2) ?? N_MAX }))
    .filter(row => row.n0 < N_MAX);
  const spread = row => n => 2 * Math.sqrt(row.vrt / (row.share * n));
  const lo = Math.min(...shown.map(r => r.mean - spread(r)(r.n0))), hi = Math.max(...shown.map(r => r.mean + spread(r)(r.n0)));
  const { ylim, yticks } = rtAuto.next(hi);
  if (!(lo >= rtFloor && lo < rtFloor + 2 * yticks[1])) rtFloor = Math.max(0, Math.floor(lo / yticks[1]) * yticks[1]);
  // While the top eases up to a jump in the bands, it can still be below their floor for a few frames.
  const rtTop = Math.max(ylim[1], rtFloor + yticks[1]);
  const rtSc = panel(146, 50, [rtFloor, rtTop], yticks.filter(v => v >= rtFloor - 1e-9 && v <= rtTop + 1e-9), "mean rt (s)");
  shown.forEach(row => band(rtSc, row.mean, spread(row), row.color, row.n0, [rtFloor, rtTop]));
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

# fit: one row per participant and condition with the summary statistics, see ezdm_summary_stats()
fit <- bmm(formula = bmf(drift ~ 1, bound ~ 1, ndt ~ 1${four ? ", zr ~ 1" : ""}), data = my_data, model = model)`;
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
  if (bad.length) return;
  const q = v === "3par" ? { ...p, zr: 0.5 } : p;
  const s = stats(q, v), ref = stats({ ...START, n_trials: p.n_trials }, v);
  const axis = timeAxis(Math.max(...[...s.rows, ...ref.rows].map(row => row.mean + 2 * Math.sqrt(row.vrt))), timeAuto);
  drawDiffusion($("ezdm-task"), { mode: "ddm", ...q, ...axis });
  drawStats(q, s, ref, axis);
  drawAcross(q, s);
  drawCode(q, s, v);
  $("ezdm-widget").dataset.redrawMs = (performance.now() - t0).toFixed(2);
}

versionInputs.forEach(i => i.addEventListener("change", draw));
$("ezdm-reset").addEventListener("click", () => { setParams(pairs, START); draw(); });
$("ezdm-copy").addEventListener("click", () => navigator.clipboard?.writeText($("ezdm-code").textContent));
pairs.n_trials.setBounds({ min: 3, max: N_MAX, step: 1 });
setParams(pairs, START);
draw();
initInfo();
