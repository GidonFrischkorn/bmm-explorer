// Simulated data from a circular density. bmm's rimm() and rsdm() draw by rejection from dimm() and dsdm(); here
// the draws come from the same density (the parity-tested port) by inverting its distribution function, from
// uniforms the page keeps. A slider move pushes the same uniforms through the new distribution, so the sample
// changes with the parameters instead of being drawn anew.
import { linspace, integrateExp } from "./math.js";

// 4096 intervals on [-pi, pi], 0 on a node: the distribution function and the expected statistics come from
// the density on this grid. A step of 0.088 degrees is about 1/12 of the circular SD of the narrowest density
// the pages draw, SDM at c 20, kappa 50 (1.09 degrees), and 1/50 of the SD of the narrowest von Mises.
const N = 4096;
export const SIM_GRID = linspace(-Math.PI, Math.PI, N + 1);

// The density varies linearly within a cell of the grid, so the distribution function is quadratic there and
// is inverted in closed form; 2r / (d0 + sqrt(...)) avoids the cancellation of the textbook root.
export function inverseCdf(xs, dens) {
  const cum = [0];
  for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + (dens[i - 1] + dens[i]) / 2 * (xs[i] - xs[i - 1]));
  const total = cum.at(-1);
  return u => {
    const r = u * total;
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= r) lo = mid; else hi = mid;
    }
    const h = xs[hi] - xs[lo], d0 = dens[lo], slope = (dens[hi] - d0) / h, rest = r - cum[lo];
    return xs[lo] + Math.min(h, 2 * rest / (d0 + Math.sqrt(Math.max(0, d0 * d0 + 2 * slope * rest))) || 0);
  };
}

// sqrt(-2 log R) for the mean resultant length R. It has no meaning for R near 0: a uniform density sums to
// R = 1e-16 on the grid, a circular SD of 492 degrees. The page reads R, not this value (sdText in sim-panel.js).
const circSd = R => Math.sqrt(-2 * Math.log(R));

// Mean absolute error, mean cosine and sine, circular SD (sqrt(-2 log R), R the mean resultant length) and the
// share within +-window of the target, for a sample.
export function circularStats(draws, window) {
  const n = draws.length;
  const c = draws.reduce((s, x) => s + Math.cos(x), 0) / n, s = draws.reduce((t, x) => t + Math.sin(x), 0) / n;
  return {
    meanAbs: draws.reduce((t, x) => t + Math.abs(x), 0) / n, meanCos: c, meanSin: s,
    circSd: circSd(Math.hypot(c, s)),
    within: draws.filter(x => Math.abs(x) <= window).length / n
  };
}

// The density on SIM_GRID, the same statistics as expected values (Simpson's rule on the grid; |x| has its
// kink at the node 0, so each panel is smooth), and draw(us), the sample those uniforms give. logd takes an
// array of errors and returns log densities, as the ported d*() functions do.
export function circularSim(logd, window) {
  const dens = logd(SIM_GRID).map(Math.exp), h = 2 * Math.PI / N;
  const simpson = g => h / 3 * dens.reduce((t, v, i) => t + v * g(SIM_GRID[i]) * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2), 0);
  const c = simpson(Math.cos), s = simpson(Math.sin);
  const q = inverseCdf(SIM_GRID, dens);
  return {
    expected: { meanAbs: simpson(Math.abs), meanCos: c, meanSin: s, circSd: circSd(Math.hypot(c, s)), within: integrateExp(logd, -window, window) },
    draw: us => us.map(q)
  };
}

// Bar heights in density units (count / (n * width)) over equal bins on the circle, bin i centred on
// -pi + i * width, so bin 0 wraps around +-pi and the target sits in the middle of a bin, not on an edge.
// Draws are errors in [-pi, pi].
export function histogram(draws, bins) {
  const w = 2 * Math.PI / bins, counts = new Array(bins).fill(0);
  for (const x of draws) counts[Math.floor((x + Math.PI) / w + 0.5) % bins]++;
  return counts.map(k => k / (draws.length * w));
}

// Counts of trials over categories with probabilities probs, one trial per uniform: a trial falls in the first
// category whose cumulative probability exceeds its uniform. A slider move shifts the category boundaries under the
// same uniforms, so only the trials near a boundary change category. probs are renormalised, as dmultinom() does.
export function categoryCounts(probs, us) {
  const total = probs.reduce((a, b) => a + b, 0), cum = [];
  probs.reduce((a, p) => (cum.push(a + p / total), a + p / total), 0);
  const counts = new Array(probs.length).fill(0);
  for (const u of us) {
    const k = cum.findIndex(c => u < c);
    counts[k < 0 ? probs.length - 1 : k]++;
  }
  return counts;
}

// Noise and signal trials of one sample, alternating, so that a larger sample keeps the trials of a smaller one in
// both groups.
export const splitTrials = us => [us.filter((_, i) => i % 2 === 0), us.filter((_, i) => i % 2 === 1)];
// The share of trials whose uniform falls below p: a rate (P("old"), P(correct)) counted as the pages count it.
export const shareBelow = (p, us) => us.filter(u => u < p).length / us.length;

// The samples the pages show, one function per kind of page, so the parity test checks the functions the pages sample
// with (what a page passes them is not tested).
// Each category's share of the trials (M3, MPT).
export const categoricalShares = (probs, us) => categoryCounts(probs, us).map(k => k / us.length);
// Yes/no: the false-alarm and hit rates of the noise and signal halves; rates = [P("old" | noise), P("old" | signal)].
export const ynSample = (rates, us) => splitTrials(us).map((half, s) => shareBelow(rates[s], half));
// Ratings: each rating's share on noise and on signal trials; probs = [noise probabilities, signal probabilities].
export const ratingSample = (probs, us) => splitTrials(us).map((half, s) => categoricalShares(probs[s], half));
// m-AFC: the proportion correct.
export const mafcSample = (pc, us) => shareBelow(pc, us);
