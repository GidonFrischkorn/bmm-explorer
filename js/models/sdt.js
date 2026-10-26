// Ports of bmm's signal detection models (R/distributions.R): yes/no (dsdt_yn), m-AFC (dsdt_mafc) and
// confidence rating (dsdt_rating), under its four evidence distributions, plus sdt_d(), sdt_criterion() and
// sdt_bias(). Parameters as bmm takes them in the d*() functions: d, criterion, sdratio on the natural scale.
// Held to bmm by tests/parity/sdt.test.mjs.
import { logPnorm, qnorm, log1pExp, log1mExp, logDiffExp, logFactorial, logSumExp } from "../lib/math.js";

// The evidence distributions in standard form (location 0, scale 1), as in bmm's .sdt_dists: log cdf, log
// survival function, quantile function, and the density the pages draw.
export const DISTS = {
  normal: {
    lcdf: logPnorm, lccdf: x => logPnorm(-x), qf: qnorm,
    pdf: x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
  },
  gumbel_min: {
    lcdf: x => log1mExp(-Math.exp(x)), lccdf: x => -Math.exp(x), qf: p => Math.log(-Math.log(1 - p)),
    pdf: x => Math.exp(x - Math.exp(x))
  },
  gumbel_max: {
    lcdf: x => -Math.exp(-x), lccdf: x => log1mExp(-Math.exp(-x)), qf: p => -Math.log(-Math.log(p)),
    pdf: x => Math.exp(-x - Math.exp(-x))
  },
  logistic: {
    lcdf: x => -log1pExp(-x), lccdf: x => -log1pExp(x), qf: p => Math.log(p / (1 - p)),
    pdf: x => { const e = Math.exp(-Math.abs(x)); return e / (1 + e) ** 2; }
  }
};

// d is d_a: the distance between the noise and signal locations over the root-mean-square of their scales.
// In noise units that distance is d * sqrt((1 + sdratio^2) / 2), which is d itself at sdratio 1.
export const separation = (d, sdratio = 1) => d * Math.sqrt((1 + sdratio ** 2) / 2);
// bias is the same boundary measured from the midpoint between the two locations.
export const biasToCriterion = (bias, d, sdratio = 1) => bias + separation(d, sdratio) / 2;
export const criterionToBias = (criterion, d, sdratio = 1) => criterion - separation(d, sdratio) / 2;

// The evidence distribution of a trial: noise (stimulus 0) at 0 with scale 1, signal (1) at the separation
// with scale sdratio. Its density at x, for the pages' drawings.
export function evidencePdf(x, { d, sdratio = 1, dist }, stimulus) {
  const scale = stimulus === 1 ? sdratio : 1;
  return DISTS[dist].pdf((x - separation(d, sdratio) * stimulus) / scale) / scale;
}

const lchoose = (n, k) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);

// Yes/no: log P("old") on a noise or signal trial is the log probability that the evidence exceeds the
// criterion, .sdt_log_p_old(.sdt_eta()); log P("new") its complement.
const ynEta = ({ d, criterion, sdratio = 1 }, stimulus) =>
  (separation(d, sdratio) * stimulus - criterion) / (stimulus === 1 ? sdratio : 1);
export const ynLogPOld = (pars, stimulus) => DISTS[pars.dist].lccdf(-ynEta(pars, stimulus));
export const ynLogPNew = (pars, stimulus) => DISTS[pars.dist].lcdf(-ynEta(pars, stimulus));

// dsdt_yn(n_old, n_trials, stimulus, d, criterion, sdratio, dist, log = TRUE); a zero count contributes
// nothing even where its log probability is -Inf.
export function dsdtYn(nOld, nTrials, stimulus, pars) {
  const lo = ynLogPOld(pars, stimulus), ln = ynLogPNew(pars, stimulus);
  return lchoose(nTrials, nOld) + (nOld ? nOld * lo : 0) + (nTrials - nOld ? (nTrials - nOld) * ln : 0);
}

// The ROC: (false-alarm rate, hit rate) for every criterion, from both rates at 1 to both at 0. The sweep runs
// between the 1e-6 and 1 - 1e-6 quantiles of the two distributions, with the corners added.
export function ynRoc({ d, sdratio = 1, dist }, n = 241) {
  const D = DISTS[dist], delta = separation(d, sdratio);
  const lo = Math.min(D.qf(1e-6), delta + sdratio * D.qf(1e-6));
  const hi = Math.max(D.qf(1 - 1e-6), delta + sdratio * D.qf(1 - 1e-6));
  const pts = Array.from({ length: n }, (_, i) => {
    const k = lo + (hi - lo) * i / (n - 1);
    return [Math.exp(D.lccdf(k)), Math.exp(D.lccdf((k - delta) / sdratio))];
  });
  return [[1, 1], ...pts, [0, 0]];
}

// sdt_d(), sdt_criterion(), sdt_bias(): the equal-variance values one (hit, false-alarm) pair implies.
export const sdtD = (hit, fa, dist) => DISTS[dist].qf(1 - fa) - DISTS[dist].qf(1 - hit);
export const sdtCriterion = (hit, fa, dist) => DISTS[dist].qf(1 - fa);
export const sdtBias = (hit, fa, dist) => (DISTS[dist].qf(1 - fa) + DISTS[dist].qf(1 - hit)) / 2;

// m-AFC: logit P(correct), .mafc_logit_pc_r(). The target's evidence has to exceed that of all m - 1
// distractors. Closed forms for the two Gumbel distributions and for normal noise at m = 2; otherwise bmm's
// quadrature rules from nodes.json ({ gh, gl }, each { nodes, weights }): Gauss-Hermite for normal noise,
// Gauss-Legendre on [0, 1] for logistic noise. The logit keeps P(correct) resolved where it rounds to 1.
export function mafcLogitPc(d, m, dist, rules) {
  if (dist === "gumbel_max") return d - Math.log(m - 1);
  if (dist === "gumbel_min") {
    // P(correct) = prod_k k / (k + exp(-d)), summed on the log scale as bmm does: log1p((1 / k) * exp(-d))
    const e = Math.exp(-d);
    let s = 0;
    for (let k = 1; k < m; k++) s += Math.log1p((1 / k) * e);
    return -s - Math.log(-Math.expm1(-s));
  }
  if (dist === "normal" && m === 2) return logPnorm(d / Math.SQRT2) - logPnorm(-d / Math.SQRT2);
  if (!rules) throw new Error("m-AFC with normal (m > 2) or logistic noise needs bmm's quadrature rules (nodes.json)");
  const { nodes, weights } = dist === "normal" ? rules.gh : rules.gl;
  const z = dist === "normal" ? nodes : nodes.map(DISTS.logistic.qf);
  const lc = z.map(x => DISTS[dist].lcdf(x + d) * (m - 1));
  const logPc = logSumExp(weights.map((w, i) => Math.log(w) + lc[i]));
  // The complement summed term by term, all positive; the weights sum to 1 only to rounding.
  const comp = weights.reduce((s, w, i) => s + w * -Math.expm1(lc[i]), 0);
  return logPc - Math.log(Math.min(comp, 1));
}

// bmm's .log1p_exp(): log1p(exp(x)), falling back to x where exp(x) overflows.
const log1pExpOr = x => { const v = Math.log1p(Math.exp(x)); return v < Infinity ? v : x; };
export const mafcPc = (d, m, dist, rules) => Math.exp(-log1pExpOr(-mafcLogitPc(d, m, dist, rules)));

// dsdt_mafc(n_correct, n_trials, m, d, dist, log = TRUE), the binomial taken on the logit (.dbinom_logit).
export function dsdtMafc(nCorrect, nTrials, m, d, dist, rules) {
  const lg = mafcLogitPc(d, m, dist, rules);
  return lchoose(nTrials, nCorrect) - (nCorrect === 0 ? 0 : nCorrect * log1pExpOr(-lg)) -
    (nCorrect === nTrials ? 0 : (nTrials - nCorrect) * log1pExpOr(lg));
}

// The d at which P(correct) with m alternatives under dist equals a target logit, by bisection: logit P(correct)
// increases with d under every distribution. The bracket doubles outward until it encloses the target, as a typed
// d can sit far outside the slider. NaN where no d reaches the target: an infinite target, or one beyond the
// logits the distribution resolves before they jump to -Inf or Inf (gumbel_min below d = -709.78, where exp(-d)
// overflows; normal's quadrature from d = 48.25).
export function mafcMatchD(logitTarget, m, dist, rules) {
  if (!Number.isFinite(logitTarget)) return NaN;
  if (dist === "gumbel_max") return logitTarget + Math.log(m - 1);
  const f = d => mafcLogitPc(d, m, dist, rules);
  let lo = -1, hi = 1;
  while (f(lo) > logitTarget && lo > -1e9) lo *= 2;
  while (f(hi) < logitTarget && hi < 1e9) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-13 * Math.max(1, Math.abs(lo + hi)); i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < logitTarget) lo = mid; else hi = mid;
  }
  const d = (lo + hi) / 2;
  // A bracket that closed on a jump to -Inf or Inf, or never enclosed the target, leaves the logit off it.
  return Math.abs(f(d) - logitTarget) <= 1e-8 * Math.max(1, Math.abs(logitTarget)) ? d : NaN;
}

// Density of the strongest of the m - 1 distractors, (m - 1) f(x) F(x)^(m - 2): the competitor the target has
// to beat, as bmm's latent_sdt(show_competitors = TRUE) draws it.
export const maxCompetitorPdf = (x, m, dist) =>
  (m - 1) * DISTS[dist].pdf(x) * Math.exp((m - 2) * DISTS[dist].lcdf(x));

// Rating: log probabilities of the K categories between K - 1 ordered thresholds, measured from the noise
// location, .sdt_category_log_probs(). An interval above 0 is the difference of two upper tails, one below it
// of two lower tails, so a category that still has mass keeps it where both cdf values round to one number.
export function ratingLogProbs(thresholds, { d, sdratio = 1, dist }, stimulus) {
  const D = DISTS[dist];
  const shift = separation(d, sdratio) * stimulus, scale = stimulus === 1 ? sdratio : 1;
  const eta = thresholds.map(t => (t - shift) / scale);
  const lower = [-Infinity, ...eta], upper = [...eta, Infinity];
  return lower.map((lo, j) => {
    const v = lo > 0 ? logDiffExp(D.lccdf(lo), D.lccdf(upper[j])) : logDiffExp(D.lcdf(upper[j]), D.lcdf(lo));
    return Number.isNaN(v) ? -Infinity : v;
  });
}

// dsdt_rating(counts, stimulus, d, thresholds, sdratio, dist, log = TRUE) for one row of counts.
export function dsdtRating(counts, stimulus, thresholds, pars) {
  const lp = ratingLogProbs(thresholds, pars, stimulus);
  return logFactorial(counts.reduce((s, k) => s + k, 0)) - counts.reduce((s, k) => s + logFactorial(k), 0) +
    counts.reduce((s, k, j) => s + (k === 0 ? 0 : k * lp[j]), 0);
}

// Where bmm's default threshold_type ("parsimonious") puts the K - 1 thresholds: criterion + exp(spacing) *
// log(k / (K - k)). At the prior means (criterion 0.5, spacing 0) these are the rating page's start values.
export const parsimoniousThresholds = (K, criterion = 0.5, spacing = 0) =>
  Array.from({ length: K - 1 }, (_, i) => criterion + Math.exp(spacing) * Math.log((i + 1) / (K - i - 1)));

// Thresholds as threshold_type = "log_distance" parameters: the criterion (the middle threshold for even K, the
// centre of the middle category for odd K) and the log widths of the K - 2 intervals between thresholds.
export function toLogDistance(thresholds) {
  const K = thresholds.length + 1, lo = (K - 1) >> 1;
  return {
    criterion: K % 2 === 0 ? thresholds[K / 2 - 1] : (thresholds[lo - 1] + thresholds[lo]) / 2,
    deltas: thresholds.slice(1).map((t, i) => Math.log(t - thresholds[i]))
  };
}

// And back, as bmm builds them (.sdt_assemble_thresholds() on exp(deltas)): outward from the criterion by
// cumulative interval widths.
export function fromLogDistance(criterion, deltas) {
  const K = deltas.length + 2, K1 = K - 1, inc = deltas.map(Math.exp), thr = new Array(K1);
  let lo, hi;
  if (K % 2 === 0) {
    lo = hi = K / 2;
    thr[hi - 1] = criterion;
  } else {
    lo = (K - 1) / 2;
    hi = lo + 1;
    thr[lo - 1] = criterion - inc[lo - 1] / 2;
    thr[hi - 1] = criterion + inc[lo - 1] / 2;
  }
  for (let j = hi + 1, cum = 0; j <= K1; j++) { cum += inc[j - 2]; thr[j - 1] = thr[hi - 1] + cum; }
  for (let j = lo - 1, cum = 0; j >= 1; j--) { cum += inc[j - 1]; thr[j - 1] = thr[lo - 1] - cum; }
  return thr;
}
