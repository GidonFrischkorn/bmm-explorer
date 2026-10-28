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

// log P(a, x) and log Q(a, x), the regularised incomplete gamma function and its complement: the series for P
// below x = a + 1, the continued fraction for Q (modified Lentz) above, each the other's log1m beyond its range.
// Both sum to relative 1e-17, so a tail probability keeps its digits where 1 - P would not. Also d log P / d log x
// and d log Q / d log x (in absolute value), x f(x) / P and x f(x) / Q with f the gamma(a, 1) density: x f(x) is
// exp(front), so the one the branch sums is 1 / sum or 1 / h; written so, -x does not cancel against log Q's own -x.
function logGammaTails(a, x) {
  if (x <= 0) return { lower: -Infinity, upper: 0, dlower: Infinity, dupper: 0 };
  const front = a * Math.log(x) - x - lgamma(a);
  if (x < a + 1) {
    let term = 1 / a, sum = term;
    for (let n = 1; n < 100000 && term > sum * 1e-17; n++) { term *= x / (a + n); sum += term; }
    const lower = front + Math.log(sum), upper = log1mExp(lower);
    return { lower, upper, dlower: 1 / sum, dupper: Math.exp(lower - upper) / sum };
  }
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 100000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-17) break;
  }
  const upper = front + Math.log(h), lower = log1mExp(upper);
  return { lower, upper, dlower: Math.exp(upper - lower) / h, dupper: 1 / h };
}

// qgamma(p, shape, rate) as R computes it: the x with P(shape, rate x) = p. Newton's method on y = log x, against
// whichever tail is the smaller (p itself below 0.5, 1 - p above, exact there). The root is kept in a bracket: a step
// that leaves it, or one after which |g| has not halved, is replaced by bisection, and while one side of the bracket
// is still open a step moves y by at most 2. It stops when a step moves y by less than 1e-14 (below the smallest
// normal double, also by less than the grid of 2^-1074 there) and returns NaN if 200 steps do not get there. The start
// is Wilson and Hilferty's cube for shape >= 1 (or, in the lower tail where that cube is negative, the leading term of
// the series). Below shape 1 it is the series' leading term, x^a / Gamma(a + 1) = p,
// which lies below the root because that term bounds P from above; in the upper tail the larger of it and the root of
// Q's leading asymptotic term, x^(a - 1) e^-x / Gamma(a) = 1 - p, which lies above the root for a < 1.
// Held to R's qgamma() by math.test.mjs, 1e-10 on the log scale.
export function qgamma(p, shape, rate = 1) {
  if (Number.isNaN(p) || p < 0 || p > 1 || !(shape > 0) || !(rate > 0)) return NaN;
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  const upperTail = p > 0.5, target = upperTail ? Math.log1p(-p) : Math.log(p);
  const series = (Math.log(p) + lgamma(shape + 1)) / shape;
  let y;
  if (shape >= 1) {
    const z = qnorm(p), wh = shape * (1 - 1 / (9 * shape) + z / (3 * Math.sqrt(shape))) ** 3;
    y = wh > 0 ? Math.log(wh) : series;
  } else {
    y = series;
    if (upperTail) {
      let x = -target - lgamma(shape);
      for (let k = 0; k < 3 && x > 1; k++) x = -target + (shape - 1) * Math.log(x) - lgamma(shape);
      if (x > Math.exp(y)) y = Math.log(x);
    }
  }
  // A series start below the smallest double is the root to that precision (the leading term is exact there): 0, as R.
  if (Math.exp(y) === 0) return 0;
  let lo = -Infinity, hi = Infinity, last = Infinity;
  for (let i = 0; i < 200; i++) {
    // g increases with y: log P - log p in the lower tail, log(1 - p) - log Q in the upper one; dg its slope.
    // Below the smallest normal double x lies on a grid of 2^-1074, and g is evaluated there: y moves to log x, so that
    // the step starts where g was evaluated, and the root is scaled by the rate before it is rounded to the grid.
    const x = Math.exp(y), sub = x > 0 && x < 2.2250738585072014e-308;
    if (sub) y = Math.log(x);
    const t = logGammaTails(shape, x), root = v => (sub ? Math.exp(v - Math.log(rate)) : Math.exp(v) / rate);
    const gy = upperTail ? target - t.upper : t.lower - target, dg = upperTail ? t.dupper : t.dlower;
    if (gy === 0) return root(y);
    if (gy > 0) hi = Math.min(hi, y); else lo = Math.max(lo, y);
    const closed = Number.isFinite(lo) && Number.isFinite(hi);
    const tol = 1e-14 * Math.max(1, Math.abs(y));
    let next = y - gy / dg;
    // A step shorter than that grid would leave x, and so g, where they are, or return to it: the root is that close.
    if (Math.abs(next - y) < tol || (sub && Math.abs(next - y) < Number.MIN_VALUE / x)) return root(next);
    if (closed && (!(next > lo && next < hi) || Math.abs(gy) > 0.5 * last)) next = (lo + hi) / 2;
    else if (!closed) next = Math.min(y + 2, Math.max(y - 2, Number.isNaN(next) ? (gy > 0 ? -Infinity : Infinity) : next));
    last = Math.abs(gy);
    if (Math.abs(next - y) < tol) return root(next);
    y = next;
  }
  return NaN;
}
