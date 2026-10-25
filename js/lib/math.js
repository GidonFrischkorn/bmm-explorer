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
