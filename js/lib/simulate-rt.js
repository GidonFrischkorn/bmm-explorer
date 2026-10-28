// Simulated data on the response-time pages. bmm's rddm() and rcswald() both draw from the Wiener diffusion model
// (rtdists::rdiffusion()); here the draws come from the parity-tested dddm() by inverting each response's distribution
// function on a grid, from uniforms the page keeps. rezdm() draws a cell's summary statistics from the sampling
// distributions dezdm() evaluates; ezdmCells() does the same by quantile functions.
import { inverseCdf } from "./simulate.js";
import { qgamma, qnorm } from "./math.js";
import { dddm, ezdmMoments3par, ezdmMoments4par, ezRtTerms } from "../models/rt.js";

// --- Diffusion model: response and response time ----------------------------------------------------------------

// The decision-time grid: N intervals on [0, T], with t = T s^2 for s evenly spaced on [0, 1], so that the steps are
// smallest where a density rises from 0 (near the boundary that a start close to it reaches within milliseconds).
// Beyond the larger mean decision time both densities fall off as exp(-lambda t), lambda = pi^2 / (2 bound^2) +
// drift^2 / 2 (s = 1), so T is that mean plus 35 / lambda. Over the slider corners of the ddm and cswald pages
// (drift -20.1 to 20.1, bound 0.223 to 4.92, zr 0.182 to 0.818) Simpson's rule on this grid puts the mass of each
// response within 1.6e-7 of the exact P(upper), against 1.1e-4 on an even grid of the same size.
const N = 4096, HORIZON = 35;

// Simpson weights in s: the integral of f(t) dt is the integral of f(T s^2) 2 T s ds.
const simpsonWeight = i => (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) / (3 * N);

// Mean and SD of a sample (n - 1 in the SD, as R's sd()); NaN for a mean of 0 draws and an SD of fewer than 2.
function meanSd(xs) {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  return { n, mean, sd: n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : NaN };
}

// The model's P(upper) and each response's mean and SD of rt (ndt included), Simpson sums over dddm() on the grid,
// and draw(us), the trials those uniforms give: uniform 2i decides trial i's response (upper below P(upper)),
// uniform 2i + 1 its rt by the inverse of that response's distribution function. A slider move pushes the same
// uniforms through the new distribution. p: { drift, bound, ndt, zr }, bmm's names, s = 1 as in dddm().
export function ddmSim(p) {
  const m = ezdmMoments4par(p);
  const T = Math.max(m.mdt_upper, m.mdt_lower) + HORIZON / (Math.PI ** 2 / (2 * p.bound ** 2) + p.drift ** 2 / 2);
  const s = Array.from({ length: N + 1 }, (_, i) => i / N), t = s.map(v => T * v * v);
  const rts = t.map(x => p.ndt + x);
  const response = r => {
    // rts[0] is ndt, where dddm() is -Inf; the density there is 0.
    const dens = dddm(rts, { ...p, response: r }).map(Math.exp);
    const sum = g => dens.reduce((acc, d, i) => acc + simpsonWeight(i) * 2 * T * s[i] * d * g(t[i]), 0);
    const mass = sum(() => 1), mean = sum(x => x) / mass;
    return { mass, mean: p.ndt + mean, sd: Math.sqrt(sum(x => (x - mean) ** 2) / mass), q: inverseCdf(rts, dens) };
  };
  const up = response(1), lo = response(0), pUpper = up.mass / (up.mass + lo.mass);
  return {
    expected: { pUpper, upper: { mean: up.mean, sd: up.sd }, lower: { mean: lo.mean, sd: lo.sd } },
    // { upper: [rt], lower: [rt] } for us.length / 2 trials.
    draw: us => {
      const out = { upper: [], lower: [] };
      for (let i = 0; i + 1 < us.length; i += 2) {
        if (us[i] < pUpper) out.upper.push(up.q(us[i + 1])); else out.lower.push(lo.q(us[i + 1]));
      }
      return out;
    }
  };
}

// P(upper) and the mean and SD of rt for each response, as the pages print them for a sample.
export function rtStats(draws) {
  const n = draws.upper.length + draws.lower.length;
  return { n, pUpper: draws.upper.length / n, upper: meanSd(draws.upper), lower: meanSd(draws.lower) };
}

// Bar heights in density units, count / (n width), over `bins` equal bins on xlim, for each response, n the trials
// of both: each response's bars then have that response's share as their area, as its density under the curve.
// Draws beyond xlim are not counted.
export function rtHistogram(draws, xlim, bins) {
  const n = draws.upper.length + draws.lower.length, w = (xlim[1] - xlim[0]) / bins;
  const heights = xs => {
    const counts = new Array(bins).fill(0);
    for (const x of xs) {
      const k = Math.floor((x - xlim[0]) / w);
      if (k >= 0 && k < bins) counts[k]++;
    }
    return counts.map(c => c / (n * w));
  };
  return { edges: Array.from({ length: bins + 1 }, (_, i) => xlim[0] + i * w), upper: heights(draws.upper), lower: heights(draws.lower) };
}

// The diffusion model rcswald() draws from for the cswald page's values: rcswald() hands drift, bound, ndt and zr to
// rtdists::rdiffusion() whatever the version, so bound is the boundary separation. In crisk that is what bound is;
// the simple version's bound runs from the start to the upper boundary, so the separation is twice it, start
// in the middle. The page prints this bound in its rcswald() call.
export const cswaldDdmPars = (p, version) =>
  version === "simple" ? { drift: p.drift, bound: 2 * p.bound, ndt: p.ndt, zr: 0.5 } : { drift: p.drift, bound: p.bound, ndt: p.ndt, zr: p.zr };

// --- EZ diffusion: cells of summary statistics ------------------------------------------------------------------

// Uniforms per cell: four for the rt statistics (variance and mean, at the upper and the lower boundary in 4par; 3par
// takes the first two), then one per trial, up to EZ_MAX_TRIALS. A larger n_trials keeps a cell's first trials.
export const EZ_MAX_TRIALS = 500;
export const EZ_STRIDE = 4 + EZ_MAX_TRIALS;

// mulberry32 can return 0, where qgamma() is 0 and qnorm() -Inf; the middle of its 2^-32 step keeps u in (0, 1).
const open = u => u + 2 ** -33;

// One boundary's (or 3par's) observed mean and variance of k rts, as bmm's .rezdm_boundary_stats() and
// .rezdm_3par() draw them: the variance gamma, the mean normal given the variance (.ez_rt_terms(), ezRtTerms()).
// Fewer than 2 rts give none, NaN, as bmm's NA.
function rtCell(k, ndt, mdt, vrt, k3, k4, uVar, uMean) {
  if (k < 2) return { mean_rt: NaN, var_rt: NaN };
  const t = ezRtTerms(vrt, k3, k4, k), v = qgamma(open(uVar), t.shape, t.rate);
  return { mean_rt: ndt + mdt + t.slope * (v - vrt) + t.sd * qnorm(open(uMean)), var_rt: v };
}

// nCells cells of n_trials trials, as rezdm(nCells, n_trials, ...) returns them: n_upper is the number of the cell's
// trial uniforms below P(upper), the binomial draw; then mean_rt and var_rt of all rts (3par) or of each
// boundary's, [upper, lower] (4par), from the cell's first uniforms. us holds nCells * EZ_STRIDE uniforms.
export function ezdmCells(p, version, nTrials, us, nCells) {
  const four = version === "4par";
  const m = four ? ezdmMoments4par(p) : ezdmMoments3par(p);
  const cells = [];
  for (let c = 0; c < nCells; c++) {
    const o = c * EZ_STRIDE;
    let k = 0;
    for (let i = 0; i < nTrials; i++) if (us[o + 4 + i] < m.pC) k++;
    if (!four) {
      cells.push({ n_upper: k, ...rtCell(nTrials, p.ndt, m.MDT, m.VRT, m.k3, m.k4, us[o], us[o + 1]) });
      continue;
    }
    const up = rtCell(k, p.ndt, m.mdt_upper, m.vrt_upper, m.k3_upper, m.k4_upper, us[o], us[o + 1]);
    const lo = rtCell(nTrials - k, p.ndt, m.mdt_lower, m.vrt_lower, m.k3_lower, m.k4_lower, us[o + 2], us[o + 3]);
    cells.push({ n_upper: k, mean_rt: [up.mean_rt, lo.mean_rt], var_rt: [up.var_rt, lo.var_rt] });
  }
  return cells;
}


// The exact expected values for cells of n_trials trials: P(upper) and, per row (one in 3par; upper, lower in 4par),
// the mean of mean_rt (ndt plus the mean decision time), the mean of var_rt (the decision-time variance), the SD of
// mean_rt over cells and the covariance of mean_rt and var_rt. Given k rts the mean has variance VRT / k (the normal's
// sd^2 plus slope^2 times the gamma's variance W) and covariance k3 / k with the variance (slope times W); in 4par k is
// binomial, and a cell enters a row only with k >= 2, so the SD is sqrt(VRT E(1 / k | k >= 2)) and the covariance
// k3 E(1 / k | k >= 2), with share, P(k >= 2), the expected share of cells that have the row.
export function ezdmExpected(p, version, nTrials) {
  if (version !== "4par") {
    const m = ezdmMoments3par(p);
    return { pUpper: m.pC, rows: [{ mean: p.ndt + m.MDT, varRt: m.VRT, sdMean: Math.sqrt(m.VRT / nTrials), cov: m.k3 / nTrials, share: 1 }] };
  }
  const m = ezdmMoments4par(p), n = nTrials;
  // log k! for k = 0..n, summed once, for the binomial weights.
  const lf = [0];
  for (let i = 1; i <= n; i++) lf.push(lf[i - 1] + Math.log(i));
  const pmf = k => Math.exp(lf[n] - lf[k] - lf[n - k] + (k ? k * Math.log(m.pC) : 0) + (n - k ? (n - k) * Math.log1p(-m.pC) : 0));
  const row = (mdt, vrt, k3, count) => {
    let share = 0, inv = 0;
    for (let k = 0; k <= n; k++) {
      const c = count(k);
      if (c >= 2) { const w = pmf(k); share += w; inv += w / c; }
    }
    return { mean: p.ndt + mdt, varRt: vrt, sdMean: Math.sqrt(vrt * inv / share), cov: k3 * inv / share, share };
  };
  return { pUpper: m.pC, rows: [row(m.mdt_upper, m.vrt_upper, m.k3_upper, k => k), row(m.mdt_lower, m.vrt_lower, m.k3_lower, k => n - k)] };
}

// The same statistics for a sample of cells from ezdmCells(): P(upper) as the mean of n_upper / n_trials, and per row
// the mean of mean_rt and var_rt and the SD of mean_rt over the cells that have the row (count).
export function ezdmCellStats(cells, nTrials, version) {
  const pUpper = cells.reduce((a, c) => a + c.n_upper, 0) / (cells.length * nTrials);
  const four = version === "4par";
  const row = j => {
    const ok = cells.filter(c => !Number.isNaN(four ? c.mean_rt[j] : c.mean_rt));
    const means = ok.map(c => (four ? c.mean_rt[j] : c.mean_rt)), vars = ok.map(c => (four ? c.var_rt[j] : c.var_rt));
    const ms = meanSd(means);
    return { count: ok.length, mean: ms.mean, sdMean: ms.sd, varRt: meanSd(vars).mean };
  };
  return { pUpper, rows: four ? [row(0), row(1)] : [row(0)] };
}

// The bands of the ezdm page's across panel, 2 SD either side of the prediction as n_trials varies: P(upper) is
// binomial; a row's observed mean rt has variance VRT / (share n), share n being the row's expected count. dezdm()
// drops a row's rt terms below 2 responses, so a band starts at n0, the first n_trials from 3 whose printed call has
// 2 responses there (count(n), after rounding), and is not drawn (drawn false) when that is not below nMax.
// s: { pC, rows: [{ mean, vrt, share, count }] }, as the page's stats().
export function ezdmBands(s, nMax) {
  return {
    p: { centre: s.pC, half: n => 2 * Math.sqrt(s.pC * (1 - s.pC) / n) },
    rows: s.rows.map((row, j) => {
      let n0 = 3;
      while (n0 < nMax && row.count(n0) < 2) n0++;
      return { ...row, j, n0, drawn: n0 < nMax, half: n => 2 * Math.sqrt(row.vrt / (row.share * n)) };
    })
  };
}
