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

// Multinomial log probability of counts x under probs, as dmultinom(log = TRUE) returns it (dm3, dmpt).
// dmultinom() divides probs by their sum first, which matters where they come from a quadrature.
export function logMultinom(x, probs) {
  const lfact = k => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const total = probs.reduce((s, v) => s + v, 0);
  return lfact(x.reduce((p, q) => p + q, 0)) - x.reduce((s, k) => s + lfact(k), 0) +
    x.reduce((s, k, i) => s + (k > 0 ? k * Math.log(probs[i] / total) : 0), 0);
}
