// What a screen reader gets in words: the one-line summary of every plot (describePlot() in a11y.js) and the value
// texts of the draggable items, built from the values a page holds. Pure functions, so node tests read every string.
// Each page builder returns { svg id: summary }; numbers go through fmt() as on the page.
import { fmt } from "./widget.js";
import { log1pExp } from "./math.js";

const DEG = 180 / Math.PI;
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const list = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
// A weight that sums to 1 with others can come out as -1e-17, which fmt() prints as −0.00.
const share = v => fmt(Math.max(0, v));
// A probability parameter strictly between 0 and 1 (Pi, zr), with the decimals that keep it off 0.00 and 1.00.
const prob = v => {
  let d = 2;
  while (d < 4 && (+v.toFixed(d) === 0 || +v.toFixed(d) === 1)) d++;
  return fmt(v, d);
};

// A colour on the wheel, in the degrees the page's summaries and density axis use.
export const colourText = mu => `${fmt(mu * DEG, 0)} degrees from the target`;
// An item on the IMM display circle: its distance along the circle in radians (what the model takes, as the
// spacing box and the drawing's note give it) and the way round from the target, angles growing clockwise.
export function circlePositionText(dist, angle) {
  const way = dist < 0.005 || dist > Math.PI - 0.005 ? "" : angle > 0 ? ", clockwise" : ", anticlockwise";
  return `${fmt(dist)} rad from the target along the circle${way}`;
}
// An item in the IMM square: its straight-line distance from the target in circle radii and its place, x to the
// right and y down from the display centre as drawn.
export function squarePositionText([x, y], dist, target) {
  const place = `${fmt(Math.abs(x))} ${x < 0 ? "left" : "right"}, ${fmt(Math.abs(y))} ${y < 0 ? "up" : "down"} from the centre`;
  return target ? `the target, ${place}, in circle radii` : `${fmt(dist)} radii from the target, ${place}`;
}

// P(correct) from its logit, as the m-AFC page prints it. Within 0.01 of 0 or 1, two decimals would print 0.00 or 1.00
// for every distribution, so the distance to that end is shown instead (ε or 1 − ε), to two significant digits, read
// off log10 of it so it does not underflow.
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const pow10 = e => `10${[...String(e)].map(c => SUP[c]).join("")}`;
export function pcText(lg) {
  if (!Number.isFinite(lg)) return lg > 0 ? "1" : "0";
  if (Math.abs(lg) < Math.log(99)) return fmt(1 / (1 + Math.exp(-lg)), 2);
  const l10 = -log1pExp(Math.abs(lg)) / Math.LN10, e = Math.floor(l10), mant = 10 ** (l10 - e);
  // a mantissa that rounds up to 10.0 moves to the next power
  const tail = l10 >= -3 ? fmt(10 ** l10, 1 - e) : mant >= 9.95 ? `1.0 × ${pow10(e + 1)}` : `${fmt(mant, 1)} × ${pow10(e)}`;
  return lg > 0 ? `1 − ${tail}` : tail;
}
// The same for the ear: superscript digits are read as symbols or not at all, so the far tails are a bound.
export function pcSpoken(lg) {
  if (!Number.isFinite(lg)) return lg > 0 ? "1" : "0";
  const p = 1 / (1 + Math.exp(-lg));
  if (p > 0.999) return "more than 0.999";
  if (p < 0.001) return "less than 0.001";
  return fmt(p, p >= 0.99 || p <= 0.01 ? 3 : 2);
}

const M3_NAMES = {
  ss: ["correct", "other list items", "lures"],
  cs: ["correct", "distractors near the cue", "other list items", "other distractors", "lures"]
};
// v: "ss" or "cs"; p: set_size and the counts; N: candidates; cur: predicted proportions in bmm's category order.
export function m3Summaries(v, p, N, cur) {
  const cs = v === "cs";
  return {
    "m3-task": `${cs ? "Complex" : "Simple"} span, set size ${p.set_size}: ${N} candidates, 1 correct, ` +
      `${plural(p.n_other, "other list letter")}, ` +
      (cs ? `${plural(p.n_dist_context, "distractor")} near the cue, ${plural(p.n_dist_other, "other distractor")}, ` : "") +
      `${plural(p.n_npl, "lure")}.`,
    "m3-bars": `Predicted proportions: ${M3_NAMES[v].map((l, i) => `${l} ${fmt(cur[i])}`).join(", ")}.`,
    "m3-across": `P(correct) by response-set size N, changing the lures, the other list items or ${cs ? "the far distractors" : "both together"} ` +
      `from the current set: ${fmt(cur[0])} at N = ${N}.`
  };
}

// p: Pi, Pb and the counts; cur: predicted proportions; ac: M3 simple-rule a and c that match the tree here.
export function mptSummaries(p, cur, ac) {
  const shares = `correct ${fmt(cur[0])}, other list items ${fmt(cur[1])}, lures ${fmt(cur[2])}`;
  return {
    "mpt-tree": `Span tree with Pi ${prob(p.Pi)} and Pb ${prob(p.Pb)}: ${shares}.`,
    "mpt-bars": `Predicted proportions: ${shares}.`,
    "mpt-across": `P(correct) by response-set size N, changing the lures, the other list items or both, from the tree (solid) ` +
      `and from M3's simple rule with a ${fmt(ac.a)} and c ${fmt(ac.c)} (dotted): ${fmt(cur[0])} at N = ${1 + p.n_other + p.n_npl}.`
  };
}

// lay: the current layout { n, dist, mu }; mode: "circle" or "square"; w: its weights (target, each non-target,
// guessing); within: its share within deg degrees; across: the across panel's curves, { target, within } at set
// sizes 1, 2, ..., as drawn (always the equidistant layout with even colours).
export function immSummaries({ lay, mode, w, within, deg, across }) {
  const n = lay.n, nt = w.slice(1, -1).reduce((s, x) => s + x, 0), last = across.target.length;
  const at = k => across.target[k - 1];
  return {
    "imm-display": n === 1 ? `Memory display, ${mode} layout: the target alone.`
      : `Memory display, ${mode} layout: the target and ${plural(n - 1, "non-target")}, at ` +
        `${list(lay.dist.slice(1).map(d => fmt(d)))} ${mode === "square" ? "circle radii" : "rad along the circle"} from the target.`,
    "imm-wheel": n === 1 ? "Colour wheel with the target's colour at 0 degrees; no other colours."
      : `Colour wheel: target at 0 degrees, ${n === 2 ? "the non-target" : "non-targets"} at ${list(lay.mu.slice(1).map(m => fmt(m * DEG, 0)))} degrees.`,
    "imm-density": `Response-error density: target weight ${share(w[0])}, ${n === 1 ? "" : `non-targets ${share(nt)}, `}guessing ${share(w.at(-1))}, ` +
      `${share(within)} of responses within ${deg} degrees of the target.`,
    "imm-weights": `Weights now: target ${share(w[0])}, ${n === 1 ? "" : `non-targets ${share(nt)}, `}guessing ${share(w.at(-1))}.`,
    // The plot's own curve gives the value at set size n; a dragged or scattered layout's differs and is named beside it.
    "imm-across": `Target weight and share within ${deg} degrees across set sizes 1 to ${last}, items equidistant and colours evenly ` +
      `spread. At set size ${n}, target weight ${share(at(n))} and ${share(across.within[n - 1])} of responses within ${deg} degrees` +
      (fmt(at(n)) === fmt(w[0]) ? "" : ` (target weight ${share(w[0])} in the current layout)`) + "; the target weight is " +
      (n === 1 ? `${share(at(last))} at set size ${last}.` : n === last ? `${share(at(1))} at set size 1.`
        : `${share(at(1))} at set size 1 and ${share(at(last))} at set size ${last}.`)
  };
}

export function mixture2pSummaries({ p_mem, within, deg }) {
  return {
    "mix2-wheel": "Colour wheel with the target's colour at the top; the response error is the distance from it.",
    "mix2-density": `Response-error density: memory weight ${share(p_mem)}, guessing ${share(1 - p_mem)}, ${share(within)} of responses ` +
      `within ${deg} degrees of the target.`,
    "mix2-weights": `Weights now: memory ${share(p_mem)}, guessing ${share(1 - p_mem)}.`
  };
}

// mu: the target's colour (0) and the non-targets', in radians; maxN: the across panel's last set size.
export function mixture3pSummaries({ mu, p_mem, p_nt, maxN }) {
  const n = mu.length, g = 1 - p_mem - p_nt, one = k => share(p_nt / (k - 1));
  return {
    "mix3-wheel": `Colour wheel: target at 0 degrees, ${n === 2 ? "the non-target" : `${n - 1} non-targets`} at ` +
      `${list(mu.slice(1).map(m => fmt(m * DEG, 0)))} degrees.`,
    "mix3-density": `Response-error density with ${n} items: memory weight ${share(p_mem)}, ${n === 2 ? "non-target" : "non-targets"} ` +
      `${share(p_nt)}, guessing ${share(g)}.`,
    "mix3-weights": `Weights now: memory ${share(p_mem)}, ${n === 2 ? `non-target ${share(p_nt)}` : `non-targets ${share(p_nt)} (${one(n)} each)`}, ` +
      `guessing ${share(g)}.`,
    "mix3-across": `Weights across set sizes 2 to ${maxN}: memory ${share(p_mem)}, all non-targets ${share(p_nt)} and guessing ${share(g)} ` +
      `at every set size; one non-target gets ${one(n)} at set size ${n} and ` +
      (n === maxN ? `${one(2)} at set size 2.` : `${one(maxN)} at set size ${maxN}.`)
  };
}

export function sdmSummaries({ c, kappa, within, deg }) {
  return {
    "sdm-wheel": "Colour wheel with the target's colour at the top; the response error is the distance from it.",
    "sdm-density": `Response-error density with c ${fmt(c)} and kappa ${fmt(kappa)}: ${share(within)} of responses within ${deg} degrees of the target.`,
    "sdm-activation": `Activation of each response error with c ${fmt(c)} and kappa ${fmt(kappa)}, now and at the starting values.`
  };
}

// v: d, sdratio, criterion; anchor and k: the boundary as the page sets it; [fa, hit]: the rates.
export function sdtYnSummaries(v, anchor, k, [fa, hit]) {
  return {
    "sdtyn-latent": `Noise and signal evidence densities with d ${fmt(v.d)}${v.sdratio === 1 ? "" : ` and sdratio ${fmt(v.sdratio)}`}, ` +
      `the criterion at ${fmt(v.criterion)}${anchor === "bias" ? ` (bias ${fmt(k)})` : ""}: false-alarm rate ${fmt(fa)}, hit rate ${fmt(hit)}.`,
    "sdtyn-bars": `Predicted false-alarm rate ${fmt(fa)} on noise trials, hit rate ${fmt(hit)} on signal trials.`,
    "sdtyn-roc": `Hit rate ${fmt(hit)} at false-alarm rate ${fmt(fa)} for the current criterion.`
  };
}

// p: d, sdratio, K; t: the K - 1 thresholds; cur: [noise, signal] rating probabilities.
export function sdtRatingSummaries(p, t, cur) {
  const K = p.K, mode = row => row.indexOf(Math.max(...row)) + 1;
  return {
    "sdtrating-latent": `Noise and signal evidence densities with d ${fmt(p.d)}${p.sdratio === 1 ? "" : ` and sdratio ${fmt(p.sdratio)}`} ` +
      `and ${K - 1} rating thresholds at ${list(t.map(x => fmt(x)))}.`,
    "sdtrating-bars": `Most likely rating: ${mode(cur[0])} on noise trials, ${mode(cur[1])} on signal trials; rating ${K} gets ` +
      `${fmt(cur[0][K - 1])} of noise and ${fmt(cur[1][K - 1])} of signal responses.`,
    "sdtrating-roc": `ROC with ${K - 1} points; the strictest threshold gives hit rate ${fmt(cur[1][K - 1])} at false-alarm rate ${fmt(cur[0][K - 1])}.`
  };
}

// p: d, m; dist: the evidence distribution; lg(d, m): logit P(correct); dRange: the by-d panel's d axis; maxM: the
// across panel's last m.
export function sdtMafcSummaries({ p, dist, lg, dRange, maxM }) {
  const far = p.m === maxM ? 2 : maxM;
  return {
    "sdtmafc-tiles": `One trial with ${p.m} alternatives, one of them holding the signal.`,
    "sdtmafc-latent": `Evidence densities under ${dist} noise at d ${fmt(p.d)}: the signal alternative and ` +
      (p.m === 2 ? "the one distractor." : `one distractor, and the strongest of the ${p.m - 1} distractors.`),
    "sdtmafc-byd": `P(correct) against d from ${fmt(dRange[0], 0)} to ${fmt(dRange[1], 0)} with ${p.m} alternatives under ${dist} noise, ` +
      `chance ${fmt(1 / p.m)}: ${pcSpoken(lg(p.d, p.m))} at d ${fmt(p.d)}${p.d >= dRange[0] && p.d <= dRange[1] ? "" : ", outside the plotted range"}.`,
    "sdtmafc-across": `P(correct) across m from 2 to ${maxM} at d ${fmt(p.d)} under ${dist} noise: ${pcSpoken(lg(p.d, p.m))} at m = ${p.m}; ` +
      `${pcSpoken(lg(p.d, far))} at m = ${far}.`
  };
}

// q: the parameters drawn; s: { pC, rows: [{ name, mean, vrt }] }; bands: ezdmBands(s, ...); cells: the number of
// simulated cells shown, or 0.
export function ezdmSummaries({ q, version, s, bands, cells, nMax }) {
  const n = q.n_trials, sd = row => fmt(Math.sqrt(row.vrt));
  const pLo = Math.max(0, s.pC - bands.p.half(n)), pHi = Math.min(1, s.pC + bands.p.half(n));
  const rt = bands.rows.map(r => {
    const what = version === "4par" ? `mean rt of ${r.name} responses` : "mean rt";
    if (!r.drawn) return `${what}: no band, fewer than 2 responses expected`;
    if (n < r.n0) return `${what}: no band below ${r.n0} trials`;
    return `${what} ${fmt(Math.max(0, r.mean - r.half(n)))} to ${fmt(r.mean + r.half(n))} s around ${fmt(r.mean)} s`;
  });
  return {
    "ezdm-task": `Evidence paths with drift ${fmt(q.drift)}, boundary separation ${fmt(q.bound)}, non-decision time ${fmt(q.ndt)} s` +
      (version === "4par" ? ` and start point ${prob(q.zr)}.` : "."),
    "ezdm-stats": `Predicted P(upper) ${fmt(s.pC)}; ` + (version === "4par"
      ? `mean rt ${list(s.rows.map(r => `${fmt(r.mean)} s (SD ${sd(r)} s) for ${r.name}`))} responses.`
      : `mean rt ${fmt(s.rows[0].mean)} s (SD ${sd(s.rows[0])} s) over all responses.`),
    "ezdm-across": `One cell's observed statistics against n_trials from 3 to ${nMax} (log scale), with bands of 2 SD either side of ` +
      `the prediction. At ${n} trials: P(upper) ${fmt(pLo)} to ${fmt(pHi)} around ${fmt(s.pC)}; ${rt.join("; ")}.` +
      (cells ? ` Dots: ${cells} simulated cells.` : "")
  };
}

// s: { pC, rtUpper, rtLower, meanRt }; bounds: the first and last boundary separation of the speed-accuracy curve.
export function ddmSummaries(p, s, bounds) {
  return {
    "ddm-task": `Evidence paths with drift ${fmt(p.drift)}, boundary separation ${fmt(p.bound)}, non-decision time ${fmt(p.ndt)} s ` +
      `and start point ${prob(p.zr)}.`,
    "ddm-density": `P(upper) ${fmt(s.pC)}; mean rt ${fmt(s.rtUpper)} s for upper and ${fmt(s.rtLower)} s for lower responses.`,
    "ddm-sat": `P(upper) against mean rt over all responses as the boundary separation runs from ${fmt(bounds[0])} to ${fmt(bounds[1])}: ` +
      `${fmt(s.pC)} at mean rt ${fmt(s.meanRt)} s with boundary separation ${fmt(p.bound)}.`
  };
}

// v: "simple" or "crisk"; q: the parameters drawn.
export function cswaldSummaries(v, q) {
  const pars = `drift ${fmt(q.drift)}, bound ${fmt(q.bound)}, non-decision time ${fmt(q.ndt)} s${v === "crisk" ? `, start point ${prob(q.zr)}` : ""}`;
  return v === "simple" ? {
    "cswald-task": `Simple version: one accumulator toward the boundary of the correct response, ${pars}.`,
    "cswald-density": `Response-time density of correct responses and, for an error, the probability that no correct response has ` +
      `come by that time, ${pars}.`,
    "cswald-ddm": `This model's density of correct responses over the diffusion decision model's densities with matching parameters; ` +
      `lower responses from the diffusion model only. ${pars[0].toUpperCase()}${pars.slice(1)}.`
  } : {
    "cswald-task": `Competing-risks version: two accumulators from the same start, one toward each boundary; the first to arrive ` +
      `gives the response. ${pars[0].toUpperCase()}${pars.slice(1)}.`,
    "cswald-density": `Response-time densities of upper responses, above the axis, and lower responses, below it, ${pars}.`,
    "cswald-ddm": `This model's densities over those of the diffusion decision model with matching parameters, ${pars}.`
  };
}
