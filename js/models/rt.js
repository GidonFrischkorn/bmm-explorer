// Ports of bmm's response-time densities: the EZ diffusion map and dezdm() (R/ezdm.R), dcswald()
// (R/cswald.R) and dddm(), which bmm hands to rtdists::ddiffusion(). Times in seconds, bmm's argument
// names. Held to bmm by tests/parity/rt.test.mjs.
import { LOG2PI, lgamma, log1mExp, logPlogis, logPnorm, mapX } from "../lib/math.js";

// --- EZ diffusion: moments of the first-passage time --------------------------------------------------

// Taylor coefficients of log(sinh(x) / x) in x^2, bmm's .EZDM_LOG_SINHC_COEF; the test checks the copy.
export const LOG_SINHC_COEF = [
  0.16666666666666666, -0.0055555555555555558, 0.00035273368606701942, -2.6455026455026456e-05,
  2.1377799155576935e-06, -1.803670234005331e-07, 1.5661391322766983e-08, -1.3884130493737299e-09,
  1.2504359176004997e-10, -1.1402575602296091e-11, 1.0502923908637557e-12, -9.7548778415937001e-14,
  9.1234682308590966e-15, -8.5837197618956095e-16, 8.117318009727788e-17, -7.7105275141162718e-18];

// Derivatives of t coth(t) as bmm's .ezdm_cgf_derivatives(); above t = 30 coth and csch^2 are 1 and 0
// to double precision.
function cgfDerivatives(t) {
  if (t > 30) return { P: t, Q: -t, R: 3 * t, S: -15 * t };
  const coth = 1 / Math.tanh(t), cschSq = 1 / Math.sinh(t) ** 2, tSq = t * t, tCubed = tSq * t, p = t * coth;
  return {
    P: p, Q: -p - tSq * cschSq, R: 3 * p + 3 * tSq * cschSq + 2 * tCubed * coth * cschSq,
    S: -(15 * p + 15 * tSq * cschSq + 12 * tCubed * coth * cschSq + 2 * tSq * tSq * cschSq * (2 + 3 * cschSq))
  };
}

const factorial = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

// First four cumulants of the decision time to the boundary at distance b from the start (b0 is the
// boundary separation), w = drift^2 / s^4. Near zero drift the closed form cancels; bmm switches to the
// power series in w there (b0 sqrt(w) < 0.7), and so does this port.
function cumulants(b, b0, w, s) {
  if (b0 * Math.sqrt(w) < 0.7) {
    const J = LOG_SINHC_COEF.length, bSq = b * b, b0Sq = b0 * b0;
    const diff = [];
    let pb = bSq, pb0 = b0Sq;
    for (let j = 0; j < J; j++) { diff.push(LOG_SINHC_COEF[j] * (pb - pb0)); pb *= bSq; pb0 *= b0Sq; }
    const cumulant = n => {
      let acc = diff[J - 1] * (factorial(J) / factorial(J - n));
      for (let j = J - 1; j >= n; j--) acc = acc * w + diff[j - 1] * (factorial(j) / factorial(j - n));
      return (-1) ** n * (2 / s ** 2) ** n * acc;
    };
    return { MDT: cumulant(1), VRT: cumulant(2), k3: cumulant(3), k4: cumulant(4) };
  }
  const rw = Math.sqrt(w), atB = cgfDerivatives(b * rw), atB0 = cgfDerivatives(b0 * rw);
  return {
    MDT: (atB0.P - atB.P) / (s ** 2 * w), VRT: (atB.Q - atB0.Q) / (s ** 4 * w ** 2),
    k3: (atB0.R - atB.R) / (s ** 6 * w ** 3), k4: (atB.S - atB0.S) / (s ** 8 * w ** 4)
  };
}

// Probability of reaching the boundary at distance b (separation b0), k = drift / s^2; bmm's .ezdm_pc().
function pc(b, b0, k) {
  const u = -2 * k * b, u0 = -2 * k * b0;
  const ratio = x => 1 + x * (1 / 2 + x * (1 / 6 + x / 24));
  if (Math.abs(u0) < 1e-4) return b / b0 * ratio(u) / ratio(u0);
  if (u0 > 0) return Math.exp(u - u0) * Math.expm1(-u) / Math.expm1(-u0);
  return Math.expm1(u) / Math.expm1(u0);
}

// The forward EZ map, 3par: one start halfway between the boundaries, so both responses share the
// decision-time distribution. pC is P(upper), MDT and VRT the mean and variance of the decision time.
export function ezdmMoments3par({ drift, bound, s = 1 }) {
  return { pC: pc(bound / 2, bound, drift / s ** 2), ...cumulants(bound / 2, bound, drift ** 2 / s ** 4, s) };
}

// 4par: the start at zr * bound, so each boundary has its own decision-time moments.
export function ezdmMoments4par({ drift, bound, zr = 0.5, s = 1 }) {
  const bUpper = zr * bound, bLower = bound - bUpper, w = drift ** 2 / s ** 4;
  const up = cumulants(bUpper, bound, w, s), lo = cumulants(bLower, bound, w, s);
  return {
    pC: pc(bUpper, bound, drift / s ** 2),
    mdt_upper: up.MDT, mdt_lower: lo.MDT, vrt_upper: up.VRT, vrt_lower: lo.VRT,
    k3_upper: up.k3, k3_lower: lo.k3, k4_upper: up.k4, k4_lower: lo.k4
  };
}

// --- dezdm(): log likelihood of the summary statistics ---------------------------------------------------

const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
const binomialLogit = (k, n, logitPc) => lchoose(n, k) + k * logPlogis(logitPc) + (n - k) * logPlogis(-logitPc);
const logDgamma = (x, shape, rate) => shape * Math.log(rate) + (shape - 1) * Math.log(x) - rate * x - lgamma(shape);
const logDnorm = (x, mean, sd) => -0.5 * LOG2PI - Math.log(sd) - 0.5 * ((x - mean) / sd) ** 2;

// The sampling distribution of the observed mean and variance of n RTs, bmm's .ez_rt_terms(): the variance is
// gamma(shape, rate) with mean VRT, the mean normal given the variance, with mean ndt + MDT + slope (var - VRT)
// and SD sd. dezdm() and rezdm() both use it.
export function ezRtTerms(VRT, k3, k4, n) {
  const W = k4 / n + 2 * VRT ** 2 / (n - 1), shape = VRT ** 2 / W, cov = k3 / n;
  return { shape, rate: shape / VRT, slope: cov / W, sd: Math.sqrt(VRT / n - cov ** 2 / W) };
}

function rtTerms(meanRt, varRt, n, ndt, MDT, VRT, k3, k4) {
  const t = ezRtTerms(VRT, k3, k4, n);
  return logDgamma(varRt, t.shape, t.rate) + logDnorm(meanRt, ndt + MDT + t.slope * (varRt - VRT), t.sd);
}

// logit P(upper) in 4par, bmm's .ezdm_logit_pc(), stable for either sign of the drift.
function logitPc(bUpper, bLower, k) {
  const up = 2 * k * bUpper, lo = 2 * k * bLower;
  const logRatio = x => Math.log1p(x * (1 / 2 + x * (1 / 6 + x / 24)));
  if (Math.abs(up + lo) < 1e-4) return Math.log(bUpper / bLower) + up + logRatio(-up) - logRatio(-lo);
  if (k > 0) return up + log1mExp(-up) - log1mExp(-lo);
  if (k < 0) return lo + log1mExp(up) - log1mExp(lo);
  return NaN;
}

// One cell. 3par takes the mean and variance of all RTs; 4par takes [upper, lower] for each, and a boundary
// with fewer than 2 responses, or a missing statistic (NaN or null), drops out of the RT terms, as in bmm.
export function dezdm({ mean_rt, var_rt, n_upper, n_trials, drift, bound, ndt, zr = 0.5, s = 1, version = "3par" }) {
  if (version === "3par") {
    const m = ezdmMoments3par({ drift, bound, s });
    return binomialLogit(n_upper, n_trials, drift * bound / s ** 2) +
      rtTerms(mean_rt, var_rt, n_trials, ndt, m.MDT, m.VRT, m.k3, m.k4);
  }
  const m = ezdmMoments4par({ drift, bound, zr, s }), num = v => (v === null ? NaN : v);
  let ll = binomialLogit(n_upper, n_trials, logitPc(zr * bound, (1 - zr) * bound, drift / s ** 2));
  [["upper", n_upper, 0], ["lower", n_trials - n_upper, 1]].forEach(([side, n, i]) => {
    const mean = num(mean_rt[i]), v = num(var_rt[i]);
    if (n >= 2 && !Number.isNaN(mean) && !Number.isNaN(v))
      ll += rtTerms(mean, v, n, ndt, m[`mdt_${side}`], m[`vrt_${side}`], m[`k3_${side}`], m[`k4_${side}`]);
  });
  return ll;
}

// --- dcswald(): the censored shifted Wald -------------------------------------------------------------------

// Wald (inverse Gaussian) first-passage density to a boundary at distance bound, and its log survival
// function, as bmm's .dwald() and .pwald(lower.tail = FALSE). t is the decision time (rt - ndt).
const logDwald = (t, drift, bound, s) =>
  Math.log(bound) - 0.5 * Math.log(2 * Math.PI * t ** 3) - Math.log(s) - (bound - drift * t) ** 2 / (2 * s ** 2 * t);

function logSwald(t, drift, bound, s) {
  const z1 = (drift * t - bound) / (s * Math.sqrt(t)), z2 = -(drift * t + bound) / (s * Math.sqrt(t));
  const upper = logPnorm(-z1), a2 = 2 * drift * bound / s ** 2 + logPnorm(z2);
  return upper + log1mExp(a2 - upper);
}

// response 1 (upper) or 0 (lower). "simple": one accumulator to the correct boundary at distance bound;
// a lower response is censored and enters with log P(no upper response by rt). "crisk": two accumulators
// race from zr * bound to the boundaries, each response's density times the other's survival.
// Before ndt the response cannot have happened: log density -Inf, or log 1 for a censored response.
export function dcswald(x, { response, drift, bound, ndt, zr = 0.5, s = 1, version = "simple" }) {
  return mapX(x, rt => {
    const t = rt - ndt;
    if (!(t > 0)) return version === "simple" && response === 0 ? 0 : -Infinity;
    if (version === "simple") return response === 1 ? logDwald(t, drift, bound, s) : logSwald(t, drift, bound, s);
    const toLower = bound * zr, toUpper = bound - bound * zr;
    return response === 1
      ? logDwald(t, drift, toUpper, s) + logSwald(t, -drift, toLower, s)
      : logDwald(t, -drift, toLower, s) + logSwald(t, drift, toUpper, s);
  });
}

// --- dddm(): Wiener first-passage density, as rtdists computes it ----------------------------------------------

// rtdists::ddiffusion() runs fast-dm's C code (Voss & Voss). Without trial-to-trial variability it sums
// the small-time or the large-time series of the first-passage density, whichever needs fewer terms. Both
// term counts hold the sum to a tolerance of 1e-6 / prefactor, an absolute error of about 1e-6 on the
// density. That truncation is part of what bmm returns: in the far tails, where the density is far below
// 1e-6, it moves the log density away from the exact value. The port repeats fast-dm's term counts and
// operation order, so it returns what bmm does.
const FASTDM_EPSILON = 1e-6;

function fastdmSmall(ta, zr, N) {
  let sum = 0;
  // C's N / 2 truncates toward zero.
  for (let i = -Math.trunc(N / 2); i <= Math.trunc(N / 2); i++) {
    const d = 2 * i + zr;
    sum += Math.exp(-d * d / (2 * ta)) * d;
  }
  return sum / Math.sqrt(2 * Math.PI * ta * ta * ta);
}

function fastdmLarge(ta, zr, N) {
  let sum = 0;
  for (let i = 1; i <= N; i++) {
    const d = i * Math.PI;
    sum += Math.exp(-0.5 * d * d * ta) * Math.sin(d * zr) * i;
  }
  return sum * Math.PI;
}

// fast-dm's g_minus_no_var(): density at the lower boundary, decision time t, start zr (relative).
function fastdmLower(t, a, zr, v) {
  const ta = t / (a * a);
  const factor = Math.exp(-a * zr * v - 0.5 * v * v * t) / (a * a);
  if (factor === Infinity) return 0;
  const eps = FASTDM_EPSILON / factor;
  // fast-dm's first bound uses t, not t / a^2; kept, since it decides the term count.
  let nLarge = Math.ceil(1 / (Math.PI * Math.sqrt(t)));
  if (Math.PI * ta * eps < 1) nLarge = Math.max(nLarge, Math.ceil(Math.sqrt(-2 * Math.log(Math.PI * ta * eps) / (Math.PI * Math.PI * ta))));
  const nSmall = 2 * Math.sqrt(2 * Math.PI * ta) * eps < 1
    ? Math.ceil(Math.max(Math.sqrt(ta) + 1, 2 + Math.sqrt(-2 * ta * Math.log(2 * eps * Math.sqrt(2 * Math.PI * ta)))))
    : 2;
  return factor * (nSmall < nLarge ? fastdmSmall(ta, zr, nSmall) : fastdmLarge(ta, zr, nLarge));
}

// response 1 (upper) or 0 (lower); bmm passes z = zr * bound and rtdists divides by bound again, so the
// port does too. s is 1 in dddm(). The upper boundary is the lower one with the start and drift mirrored.
export function dddm(x, { response, drift, bound, ndt, zr = 0.5 }) {
  const zrel = zr * bound / bound;
  return mapX(x, rt => {
    const t = rt - ndt;
    if (!(t > 0)) return -Infinity;
    return Math.log(Math.abs(response === 1 ? fastdmLower(t, bound, 1 - zrel, -drift) : fastdmLower(t, bound, zrel, drift)));
  });
}
