// The plot summaries and value texts a screen reader gets (js/lib/summaries.js): one case per page against values
// checked by hand, and the edges where wording used to break (set size 1, the last set size, m = 2, far tails).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../../js/lib/summaries.js";
import { ezdmBands } from "../../js/lib/simulate-rt.js";
import { immWeights } from "../../js/models/circular.js";

const r2 = v => Math.round(v * 100) / 100;
const logit = p => Math.log(p / (1 - p));

// IMM at its starting values (c = a = s = b = 1) on the equidistant circle with k items: non-target distances
// 2 pi i / k the short way round, rounded as the page rounds them. Target weight (c + a) / total:
// k = 1: 2/3 = 0.67; k = 4: 2 / (2 + 2 (e^-1.57 + 1) + (e^-3.14 + 1) + 1) = 0.3096; k = 8: 0.1731.
const START = { c: 1, a: 1, b: 1, s: 1 };
const equi = k => [0, ...Array.from({ length: k - 1 }, (_, i) => r2(Math.abs(Math.atan2(Math.sin(2 * Math.PI * (i + 1) / k), Math.cos(2 * Math.PI * (i + 1) / k)))))];
const across = { target: [1, 2, 3, 4, 5, 6, 7, 8].map(k => immWeights({ dist: equi(k), ...START })[0]), within: [0.9, 0.8, 0.7, 0.62, 0.5, 0.45, 0.4, 0.35] };

test("IMM: the across summary reads the plotted (equidistant) curve, and names a scattered layout's own weight", () => {
  // A scattered square layout with 4 items: its target weight differs from the equidistant one at set size 4.
  const lay = { n: 4, dist: [0, 0.85, 1.2, 1.5], mu: [0, 1.57, 3.14, -1.57] };
  const w = immWeights({ dist: lay.dist, ...START });
  assert.equal(r2(w[0]), 0.29);
  const s = S.immSummaries({ lay, mode: "square", w, within: 0.55, deg: 20, across });
  assert.equal(s["imm-across"], "Target weight and share within 20 degrees across set sizes 1 to 8, items equidistant and colours " +
    "evenly spread. At set size 4, target weight 0.31 and 0.62 of responses within 20 degrees (target weight 0.29 in the current " +
    "layout); the target weight is 0.67 at set size 1 and 0.17 at set size 8.");
  assert.equal(s["imm-display"], "Memory display, square layout: the target and 3 non-targets, at 0.85, 1.20 and 1.50 circle radii from the target.");
  assert.equal(s["imm-wheel"], "Colour wheel: target at 0 degrees, non-targets at 90, 180 and −90 degrees.");
});

test("IMM: equidistant layout, set size 1 and set size 8", () => {
  const at = n => S.immSummaries({ lay: { n, dist: equi(n), mu: [0] }, mode: "circle", w: immWeights({ dist: equi(n), ...START }), within: 0.9, deg: 20, across });
  const four = S.immSummaries({ lay: { n: 4, dist: equi(4), mu: [0, 1.57, 3.14, -1.57] }, mode: "circle", w: immWeights({ dist: equi(4), ...START }), within: 0.62, deg: 20, across });
  assert.match(four["imm-across"], /At set size 4, target weight 0\.31 and 0\.62 of responses within 20 degrees; /);
  assert.equal(four["imm-display"], "Memory display, circle layout: the target and 3 non-targets, at 1.57, 3.14 and 1.57 rad along the circle from the target.");
  const one = at(1);
  assert.equal(one["imm-display"], "Memory display, circle layout: the target alone.");
  assert.equal(one["imm-wheel"], "Colour wheel with the target's colour at 0 degrees; no other colours.");
  assert.equal(one["imm-weights"], "Weights now: target 0.67, guessing 0.33.");
  assert.match(one["imm-across"], /At set size 1, target weight 0\.67 and 0\.90 of responses within 20 degrees; the target weight is 0\.17 at set size 8\.$/);
  assert.match(at(8)["imm-across"], /At set size 8, target weight 0\.17 .*; the target weight is 0\.67 at set size 1\.$/);
  assert.equal(S.immSummaries({ lay: { n: 2, dist: [0, 3.14], mu: [0, 3.14] }, mode: "circle", w: immWeights({ dist: [0, 3.14], ...START }),
    within: 0.5, deg: 20, across })["imm-display"], "Memory display, circle layout: the target and 1 non-target, at 3.14 rad along the circle from the target.");
});

test("IMM item texts: degrees for colours, radians along the circle, radii and place in the square", () => {
  assert.equal(S.colourText(Math.PI / 2), "90 degrees from the target");
  assert.equal(S.colourText(-1.57), "−90 degrees from the target");
  assert.equal(S.circlePositionText(1.57, 1.57), "1.57 rad from the target along the circle, clockwise");
  assert.equal(S.circlePositionText(1.57, -1.57), "1.57 rad from the target along the circle, anticlockwise");
  assert.equal(S.circlePositionText(3.14, 3.14), "3.14 rad from the target along the circle");
  assert.equal(S.squarePositionText([0.5, -0.3], 0.85, false), "0.85 radii from the target, 0.50 right, 0.30 up from the centre");
  assert.equal(S.squarePositionText([-1, 0.2], 0, true), "the target, 1.00 left, 0.20 down from the centre, in circle radii");
});

test("mixture3p: one non-target's share at the current and the last set size, without repeating it at set size 8", () => {
  const mu = n => [0, ...Array.from({ length: n - 1 }, (_, i) => r2(Math.atan2(Math.sin(2 * Math.PI * (i + 1) / n), Math.cos(2 * Math.PI * (i + 1) / n))))];
  const s4 = S.mixture3pSummaries({ mu: mu(4), p_mem: 0.33, p_nt: 0.33, maxN: 8 });
  // 0.33 / 3 = 0.11, 0.33 / 7 = 0.047, guessing 1 - 0.66 = 0.34
  assert.equal(s4["mix3-across"], "Weights across set sizes 2 to 8: memory 0.33, all non-targets 0.33 and guessing 0.34 at every set size; " +
    "one non-target gets 0.11 at set size 4 and 0.05 at set size 8.");
  assert.equal(s4["mix3-weights"], "Weights now: memory 0.33, non-targets 0.33 (0.11 each), guessing 0.34.");
  assert.equal(s4["mix3-wheel"], "Colour wheel: target at 0 degrees, 3 non-targets at 90, 180 and −90 degrees.");
  const s8 = S.mixture3pSummaries({ mu: mu(8), p_mem: 0.33, p_nt: 0.33, maxN: 8 });
  assert.match(s8["mix3-across"], /one non-target gets 0\.05 at set size 8 and 0\.33 at set size 2\.$/);
  assert.doesNotMatch(s8["mix3-across"], /falls to/);
  const s2 = S.mixture3pSummaries({ mu: mu(2), p_mem: 0.5, p_nt: 0.5, maxN: 8 });
  assert.equal(s2["mix3-weights"], "Weights now: memory 0.50, non-target 0.50, guessing 0.00.");
  assert.equal(s2["mix3-wheel"], "Colour wheel: target at 0 degrees, the non-target at 180 degrees.");
});

test("mixture2p and SDM", () => {
  assert.equal(S.mixture2pSummaries({ p_mem: 1, within: 0.7, deg: 20 })["mix2-density"],
    "Response-error density: memory weight 1.00, guessing 0.00, 0.70 of responses within 20 degrees of the target.");
  assert.equal(S.sdmSummaries({ c: 7.39, kappa: 5.75, within: 0.4, deg: 20 })["sdm-density"],
    "Response-error density with c 7.39 and kappa 5.75: 0.40 of responses within 20 degrees of the target.");
});

test("m-AFC: m = 2 has one distractor; far tails are a bound, not superscripts", () => {
  // Normal noise, m = 2: P(correct) = pnorm(d / sqrt(2)) = 0.7602 at d = 1.
  const lg = (d, m) => (m === 2 ? logit(0.7602) : m === 10 ? logit(0.3) : NaN);
  const s = S.sdtMafcSummaries({ p: { d: 1, m: 2 }, dist: "normal", lg, dRange: [-2, 4], maxM: 10 });
  assert.equal(s["sdtmafc-latent"], "Evidence densities under normal noise at d 1.00: the signal alternative and the one distractor.");
  assert.equal(s["sdtmafc-byd"], "P(correct) against d from −2 to 4 with 2 alternatives under normal noise, chance 0.50: 0.76 at d 1.00.");
  assert.equal(s["sdtmafc-across"], "P(correct) across m from 2 to 10 at d 1.00 under normal noise: 0.76 at m = 2; 0.30 at m = 10.");
  const m4 = S.sdtMafcSummaries({ p: { d: 8, m: 4 }, dist: "gumbel_max", lg: () => logit(1 - 7.7e-9), dRange: [-2, 4], maxM: 10 });
  assert.equal(m4["sdtmafc-latent"], "Evidence densities under gumbel_max noise at d 8.00: the signal alternative and one distractor, and the strongest of the 3 distractors.");
  assert.equal(m4["sdtmafc-byd"], "P(correct) against d from −2 to 4 with 4 alternatives under gumbel_max noise, chance 0.25: more than 0.999 at d 8.00, outside the plotted range.");
  assert.doesNotMatch(Object.values(m4).join(" "), /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/);
});

test("m-AFC P(correct) texts: the page's tail notation and the spoken bound", () => {
  assert.equal(S.pcText(logit(1 - 7.7e-9)), "1 − 7.7 × 10⁻⁹");
  assert.equal(S.pcText(logit(0.76)), "0.76");
  assert.equal(S.pcSpoken(logit(0.995)), "0.995");
  assert.equal(S.pcSpoken(logit(0.005)), "0.005");
  assert.equal(S.pcSpoken(logit(0.9995)), "more than 0.999");
  assert.equal(S.pcSpoken(-40), "less than 0.001");
  assert.equal(S.pcSpoken(Infinity), "1");
});

test("ezdm: bands of 2 SD, clipped to [0, 1], P(upper) not accuracy, the mean-rt bands included", () => {
  // 3par, P(upper) 0.5, mean rt 0.47 s with VRT 0.0625 (SD 0.25 s): at 100 trials P(upper) 0.5 +- 2 sqrt(0.25 / 100) =
  // 0.40 to 0.60, mean rt 0.47 +- 2 * 0.25 / 10 = 0.42 to 0.52 s; at 3 trials +- 0.58, clipped to 0 and 1.
  const s = { pC: 0.5, rows: [{ name: "all", mean: 0.47, vrt: 0.0625 }] };
  const at = n => S.ezdmSummaries({ q: { drift: 0, bound: 1, ndt: 0.22, zr: 0.5, n_trials: n }, version: "3par", s, bands: ezdmBands(s, n), cells: null, nMax: 500 });
  assert.equal(at(100)["ezdm-across"], "One cell's observed statistics against n_trials from 3 to 500 (log scale), with bands of 2 SD either side " +
    "of the prediction. At 100 trials: P(upper) 0.40 to 0.60 around 0.50; mean rt 0.42 to 0.52 s around 0.47 s.");
  assert.match(at(3)["ezdm-across"], /P\(upper\) 0\.00 to 1\.00 around 0\.50/);
  assert.doesNotMatch(at(3)["ezdm-across"], /accuracy|within|95/);
  assert.equal(at(100)["ezdm-stats"], "Predicted P(upper) 0.50; mean rt 0.47 s (SD 0.25 s) over all responses.");
  assert.equal(at(100)["ezdm-task"], "Evidence paths with drift 0.00, boundary separation 1.00, non-decision time 0.22 s.");
});

test("ezdm 4par: a boundary's band is 2 sqrt(VRT E(1/k | k >= 2)) over the cells that have it", () => {
  // n_trials 3, P(upper) 1/2: the upper count k is 2 with probability 3/8 and 3 with 1/8, so P(k >= 2) = 1/2 and
  // E(1/k | k >= 2) = (3/8 / 2 + 1/8 / 3) / (1/2) = 11/24; the lower count likewise. VRT 0.0024: 2 sqrt(0.0011) = 0.0663,
  // 0.43 to 0.57 around 0.50; VRT 0.0096: 0.1327, 0.47 to 0.73 around 0.60. Under the old band (expected count n/2)
  // the upper one would be 0.5 +- 2 sqrt(0.0024 / 1.5) = 0.42 to 0.58.
  const s = { pC: 0.5, rows: [{ name: "upper", mean: 0.5, vrt: 0.0024 }, { name: "lower", mean: 0.6, vrt: 0.0096 }] };
  const q = { drift: 0, bound: 1, ndt: 0.3, zr: 0.5, n_trials: 3 };
  const b = ezdmBands(s, 3);
  assert.ok(Math.abs(b.rows[0].now - 2 * Math.sqrt(0.0024 * 11 / 24)) < 1e-12);
  assert.equal(S.ezdmSummaries({ q, version: "4par", s, bands: b, cells: { n: 200, rows: [101, 99] }, nMax: 500 })["ezdm-across"],
    "One cell's observed statistics against n_trials from 3 to 500 (log scale), with bands of 2 SD either side of the prediction. " +
    "At 3 trials: P(upper) 0.00 to 1.00 around 0.50; mean rt of upper responses, in cells with 2 or more, 0.43 to 0.57 s around 0.50 s; " +
    "mean rt of lower responses, in cells with 2 or more, 0.47 to 0.73 s around 0.60 s. " +
    "Dots: 200 simulated cells; 101 with 2 or more upper responses, 99 with 2 or more lower responses.");
});

test("ezdm 4par: a rare boundary's band starts where 1 cell in 1000 has 2 responses there, or is not drawn", () => {
  // P(upper) 0.999: P(lower count >= 2) = 1 - 0.999^n - 0.001 n 0.999^(n - 1) first reaches 1e-3 at n = 46; the
  // panel's grid (every n to 30, then 30 log-even steps: 30, 33, 36, 40, 44, 48, ...) starts the band at 48.
  // At 20 trials: P(upper) 0.999 +- 2 sqrt(0.000999 / 20) = +- 0.014, 0.98 to 1.00; the upper count is >= 2 in every
  // cell, E(1/k) = 0.05005, 0.5 +- 2 sqrt(0.04 * 0.05005) = 0.41 to 0.59. At 500 trials P(lower count >= 2) = 0.090 and
  // E(1/k | k >= 2) = 0.4718: 0.6 +- 2 sqrt(0.04 * 0.4718) = 0.6 +- 0.275, 0.33 to 0.87.
  const s = { pC: 0.999, rows: [{ name: "upper", mean: 0.5, vrt: 0.04 }, { name: "lower", mean: 0.6, vrt: 0.04 }] };
  const q = n => ({ drift: 3, bound: 1.5, ndt: 0.3, zr: 0.996, n_trials: n });
  const txt = n => S.ezdmSummaries({ q: q(n), version: "4par", s, bands: ezdmBands(s, n), cells: null, nMax: 500 });
  assert.deepEqual(ezdmBands(s, 20).rows.map(r => [r.ns[0], r.common]), [[3, true], [48, false]]);
  assert.deepEqual(ezdmBands(s, 46).rows.map(r => [r.common, Number.isFinite(r.now)]), [[true, true], [true, false]],
    "at 46 the share is reached, but the drawn band starts at 48 and the text says what is drawn");
  assert.match(txt(20)["ezdm-across"], /At 20 trials: P\(upper\) 0\.98 to 1\.00 around 1\.00; mean rt of upper responses, in cells with 2 or more, 0\.41 to 0\.59 s around 0\.50 s; mean rt of lower responses: no band below 48 trials\.$/);
  assert.match(txt(500)["ezdm-across"], /mean rt of lower responses, in cells with 2 or more, 0\.33 to 0\.87 s around 0\.60 s\.$/);
  assert.equal(txt(20)["ezdm-stats"], "Predicted P(upper) 1.00; mean rt 0.50 s (SD 0.20 s) for upper and 0.60 s (SD 0.20 s) for lower responses.");
  assert.match(txt(20)["ezdm-task"], /and start point 0\.996\.$/, "a start point near 1 keeps the digits that tell it from 1");
  // P(upper) 0.99995: at 500 trials P(lower count >= 2) = 3.1e-4, below 1 in 1000 everywhere.
  const rare = { pC: 0.99995, rows: s.rows };
  assert.equal(ezdmBands(rare, 100).rows[1].ns.length, 0);
  assert.match(S.ezdmSummaries({ q: q(100), version: "4par", s: rare, bands: ezdmBands(rare, 100), cells: null, nMax: 500 })["ezdm-across"],
    /mean rt of lower responses: no band, fewer than 1 cell in 1000 has 2 lower responses up to 500 trials\.$/);
});

test("DDM: the speed-accuracy point is the mean rt over all responses, where the plot puts its circle", () => {
  const s = { pC: 0.7, rtUpper: 0.6, rtLower: 0.8, meanRt: 0.66 };
  const txt = S.ddmSummaries({ drift: 1, bound: 1, ndt: 0.3, zr: 0.5 }, s, [Math.exp(-1.5), Math.exp(1.5)]);
  assert.equal(txt["ddm-sat"], "P(upper) against mean rt over all responses as the boundary separation runs from 0.22 to 4.48: " +
    "0.70 at mean rt 0.66 s with boundary separation 1.00.");
});

test("cswald: the simple version's error curve is not a density", () => {
  const q = { drift: 2, bound: 1, ndt: 0.3, zr: 0.5 };
  assert.match(S.cswaldSummaries("simple", q)["cswald-density"], /probability that no correct response has come by that time/);
  assert.doesNotMatch(S.cswaldSummaries("simple", q)["cswald-density"], /densities of the two/);
  assert.match(S.cswaldSummaries("crisk", q)["cswald-density"], /^Response-time densities of upper responses, above the axis, and lower responses, below it, drift 2\.00, bound 1\.00, non-decision time 0\.30 s, start point 0\.50\.$/);
});

test("M3 and MPT: plurals and the response-set wording", () => {
  const ss = S.m3Summaries("ss", { set_size: 2, n_other: 1, n_npl: 1 }, 3, [0.6, 0.3, 0.1]);
  assert.equal(ss["m3-task"], "Simple span, set size 2: 3 candidates, 1 correct, 1 other list letter, 1 lure.");
  assert.equal(ss["m3-bars"], "Predicted proportions: correct 0.60, other list items 0.30, lures 0.10.");
  const cs = S.m3Summaries("cs", { set_size: 6, n_other: 4, n_npl: 5, n_dist_context: 2, n_dist_other: 0 }, 12, [0.5, 0.1, 0.2, 0, 0.2]);
  assert.equal(cs["m3-task"], "Complex span, set size 6: 12 candidates, 1 correct, 4 other list letters, 2 distractors near the cue, " +
    "0 other distractors, 5 lures.");
  assert.match(cs["m3-across"], /or the far distractors from the current set: 0\.50 at N = 12\.$/);
  const mpt = S.mptSummaries({ Pi: 0.00431, Pb: 0.5, n_other: 4, n_npl: 5 }, [0.2, 0.3, 0.5], { a: 1.5, c: 2 });
  assert.equal(mpt["mpt-tree"], "Span tree with Pi 0.004 and Pb 0.50: correct 0.20, other list items 0.30, lures 0.50.");
  assert.match(mpt["mpt-across"], /M3's simple rule with a 1\.50 and c 2\.00 \(dotted\): 0\.20 at N = 10\.$/);
});

test("SDT yes/no and rating", () => {
  const yn = S.sdtYnSummaries({ d: 1, sdratio: 1, criterion: 1.15 }, "bias", 0.65, [0.13, 0.44]);
  assert.equal(yn["sdtyn-latent"], "Noise and signal evidence densities with d 1.00, the criterion at 1.15 (bias 0.65): false-alarm rate 0.13, hit rate 0.44.");
  // K = 3 at d 1: two thresholds, two ROC points; the strictest is rating 3's.
  const cur = [[0.5, 0.3, 0.2], [0.2, 0.3, 0.5]];
  const r = S.sdtRatingSummaries({ d: 1, sdratio: 1.2, K: 3 }, [0, 0.84], cur);
  assert.equal(r["sdtrating-latent"], "Noise and signal evidence densities with d 1.00 and sdratio 1.20 and 2 rating thresholds at 0.00 and 0.84.");
  assert.equal(r["sdtrating-roc"], "ROC with 2 points; the strictest threshold gives hit rate 0.50 at false-alarm rate 0.20.");
  assert.equal(r["sdtrating-bars"], "Most likely rating: 1 on noise trials, 3 on signal trials; rating 3 gets 0.20 of noise and 0.50 of signal responses.");
});
