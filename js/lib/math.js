// Numerical helpers shared by the ported densities. Everything is on the log scale where bmm is.
export const LOG2PI = Math.log(2 * Math.PI);

// log I0(k): power series up to k = 100, Hankel's asymptotic series above (relative error < 1e-14 there).
export function logI0(k) {
  if (k > 100) {
    const s = 1 + 1 / (8 * k) + 9 / (128 * k * k) + 225 / (3072 * k ** 3) + 11025 / (98304 * k ** 4);
    return k - 0.5 * Math.log(2 * Math.PI * k) + Math.log(s);
  }
  let term = 1, sum = 1;
  const q = k * k / 4;
  for (let j = 1; j < 1000; j++) {
    term *= q / (j * j);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return Math.log(sum);
}

export const dvonmises = (x, mu, kappa) => kappa * Math.cos(x - mu) - LOG2PI - logI0(kappa);

export function logSumExp(v) {
  const m = Math.max(...v);
  if (m === -Infinity) return -Infinity;
  return m + Math.log(v.reduce((s, a) => s + Math.exp(a - m), 0));
}

export const linspace = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * i / (n - 1));

export const mapX = (x, f) => (Array.isArray(x) ? x.map(f) : f(x));

// log Phi(x), the lower tail of the standard normal on the log scale: R's pnorm(x, log.p = TRUE), ported
// from nmath/pnorm.c (Cody's rational approximations), so the far tails keep full relative precision.
const PN_A = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
const PN_B = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
const PN_C = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226,
  2494.5375852903726711, 6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
const PN_D = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755,
  18615.571640885098091, 34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
const PN_P = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466,
  2.9112874951168792e-5, 0.02307344176494017303];
const PN_Q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];

export function logPnorm(x) {
  const y = Math.abs(x);
  if (Number.isNaN(x)) return NaN;
  if (y <= 0.67448975) {
    let xnum = 0, xden = 0;
    if (y > Number.EPSILON / 2) {
      const xsq = x * x;
      xnum = PN_A[4] * xsq; xden = xsq;
      for (let i = 0; i < 3; i++) { xnum = (xnum + PN_A[i]) * xsq; xden = (xden + PN_B[i]) * xsq; }
    }
    return Math.log(0.5 + x * (xnum + PN_A[3]) / (xden + PN_B[3]));
  }
  let temp;
  if (y <= 5.656854249492380195206754896838) {
    let xnum = PN_C[8] * y, xden = y;
    for (let i = 0; i < 7; i++) { xnum = (xnum + PN_C[i]) * y; xden = (xden + PN_D[i]) * y; }
    temp = (xnum + PN_C[7]) / (xden + PN_D[7]);
  } else if (y < 1e170) {
    const xsq = 1 / (x * x);
    let xnum = PN_P[5] * xsq, xden = xsq;
    for (let i = 0; i < 4; i++) { xnum = (xnum + PN_P[i]) * xsq; xden = (xden + PN_Q[i]) * xsq; }
    temp = (0.398942280401432677939946059934 - xsq * (xnum + PN_P[4]) / (xden + PN_Q[4])) / y;
  } else {
    return x > 0 ? 0 : -Infinity;
  }
  // exp(-y^2 / 2) split as in R (y rounded to 1/16, then the remainder), so the square loses no digits.
  const xsq = Math.trunc(y * 16) / 16, del = (y - xsq) * (y + xsq);
  const logTail = -xsq * xsq / 2 - del / 2 + Math.log(temp);
  return x > 0 ? Math.log1p(-Math.exp(-xsq * xsq / 2) * Math.exp(-del / 2) * temp) : logTail;
}

// R's qnorm(p): Wichura's AS 241 (PPND16), the algorithm of nmath/qnorm.c, with its rational approximations in
// the same Horner order. The coefficients are the published ones, as GSL 2.6 also ships them.
const QN_A = [3.387132872796366608, 133.14166789178437745, 1971.5909503065514427, 13731.693765509461125,
  45921.953931549871457, 67265.770927008700853, 33430.575583588128105, 2509.0809287301226727];
const QN_B = [1, 42.313330701600911252, 687.1870074920579083, 5394.1960214247511077, 21213.794301586595867,
  39307.89580009271061, 28729.085735721942674, 5226.495278852854561];
const QN_C = [1.42343711074968357734, 4.6303378461565452959, 5.7694972214606914055, 3.64784832476320460504,
  1.27045825245236838258, 0.24178072517745061177, 0.0227238449892691845833, 7.7454501427834140764e-4];
const QN_D = [1, 2.05319162663775882187, 1.6763848301838038494, 0.68976733498510000455, 0.14810397642748007459,
  0.0151986665636164571966, 5.475938084995344946e-4, 1.05075007164441684324e-9];
const QN_E = [6.6579046435011037772, 5.4637849111641143699, 1.7848265399172913358, 0.29656057182850489123,
  0.026532189526576123093, 0.0012426609473880784386, 2.71155556874348757815e-5, 2.01033439929228813265e-7];
const QN_F = [1, 0.59983220655588793769, 0.13692988092273580531, 0.0148753612908506148525,
  7.868691311456132591e-4, 1.8463183175100546818e-5, 1.4215117583164458887e-7, 2.04426310338993978564e-15];
const ratio = (a, b, x) => {
  let u = a[7], v = b[7];
  for (let i = 6; i >= 0; i--) { u = u * x + a[i]; v = v * x + b[i]; }
  return u / v;
};

export function qnorm(p) {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) return q * ratio(QN_A, QN_B, 0.180625 - q * q);
  // r = sqrt(-log(min(p, 1 - p))): the tails, split at min(p, 1 - p) = exp(-25)
  const r = Math.sqrt(-Math.log(q > 0 ? 1 - p : p));
  const val = r <= 5 ? ratio(QN_C, QN_D, r - 1.6) : ratio(QN_E, QN_F, r - 5);
  return q < 0 ? -val : val;
}

// log(1 + exp(x)) with R's branches (nmath log1pexp), which plogis(log.p = TRUE) is built on.
export const log1pExp = x => (x <= 18 ? Math.log1p(Math.exp(x)) : x > 33.3 ? x : x + Math.exp(-x));
// log(1 - exp(x)) and log(exp(a) - exp(b)) for x, b - a <= 0, as bmm's log1m_exp() and log_diff_exp().
export const log1mExp = x => (x > -Math.LN2 ? Math.log(-Math.expm1(x)) : Math.log1p(-Math.exp(x)));
export const logDiffExp = (a, b) => a + log1mExp(b - a);

// log(k!) for a count k, summed: within 1.3e-15 of R's lgamma(k + 1) relative at k = 1000.
export function logFactorial(k) {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}

// Multinomial log probability of counts x under probs, as dmultinom(log = TRUE) returns it (dm3, dmpt).
// dmultinom() divides probs by their sum first, which matters where they come from a quadrature.
export function logMultinom(x, probs) {
  const total = probs.reduce((s, v) => s + v, 0);
  return logFactorial(x.reduce((p, q) => p + q, 0)) - x.reduce((s, k) => s + logFactorial(k), 0) +
    x.reduce((s, k, i) => s + (k > 0 ? k * Math.log(probs[i] / total) : 0), 0);
}

// Integral of exp(logf) over [lo, hi] by composite Simpson's rule; logf takes an array, as the ported
// densities do. n = 160 intervals over +-20 degrees is a step of 0.25 degrees, far below the narrowest
// von Mises the pages draw (sd 4.7 degrees at kappa 148).
export function integrateExp(logf, lo, hi, n = 160) {
  const h = (hi - lo) / n;
  const f = logf(linspace(lo, hi, n + 1)).map(Math.exp);
  return h / 3 * f.reduce((s, v, i) => s + v * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2), 0);
}

// log Gamma(x) for x > 0: Stirling's series from 10 on (last term below 1e-15 there), the recurrence
// Gamma(x) = Gamma(x + n) / (x (x + 1) ... (x + n - 1)) below. Held to R's lgamma() by math.test.mjs.
export function lgamma(x) {
  let shift = 0;
  while (x < 10) { shift += Math.log(x); x += 1; }
  const z2 = 1 / (x * x);
  const series = (1 / 12 + z2 * (-1 / 360 + z2 * (1 / 1260 + z2 * (-1 / 1680 + z2 * (1 / 1188 + z2 * (-691 / 360360 + z2 / 156)))))) / x;
  return (x - 0.5) * Math.log(x) - x + 0.5 * LOG2PI + series - shift;
}

// plogis(x, log.p = TRUE), which R computes as -log1pexp(-x).
export const logPlogis = x => -log1pExp(-x);
