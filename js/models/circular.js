// Ports of bmm's circular densities (R/distributions.R): dmixture2p, dmixture3p, dimm, dsdm.
// Log densities, bmm's argument names, x in radians. Held to bmm by tests/parity/circular.test.mjs.
import { LOG2PI, dvonmises, logSumExp, mapX, logI0 } from "../lib/math.js";

const LOG_UNIF = -LOG2PI;   // dunif(x, -pi, pi, log = TRUE)

export function dmixture2p(x, { mu = 0, kappa = 5, p_mem = 0.6 } = {}) {
  return mapX(x, xi => logSumExp([Math.log(p_mem) + dvonmises(xi, mu, kappa), Math.log(1 - p_mem) + LOG_UNIF]));
}

// mu[0] is the target, mu[1..] the non-targets, which share p_nt equally (bmm: p_nt / (length(mu) - 1)).
export function dmixture3p(x, { mu = [0, 2, -1.5], kappa = 5, p_mem = 0.6, p_nt = 0.2 } = {}) {
  mu = [].concat(mu);
  const nNt = mu.length - 1;
  const logPnt = Math.log(p_nt / nNt);
  return mapX(x, xi => logSumExp([
    Math.log(p_mem) + dvonmises(xi, mu[0], kappa),
    ...mu.slice(1).map(m => logPnt + dvonmises(xi, m, kappa)),
    Math.log(1 - p_mem - p_nt) + LOG_UNIF
  ]));
}

// Activation weights as in dimm(): c * exp(-s * dist) + a per item, b for the background.
export function immWeights({ dist, c, a, b, s }) {
  const w = dist.map(d => c * Math.exp(-s * d) + a).concat([b]);
  const total = w.reduce((p, q) => p + q, 0);
  return w.map(v => v / total);
}

// mu and dist may be scalars, as in bmm (set size 1).
export function dimm(x, { mu = [0, 2, -1.5], dist = [0, 0.5, 2], c = 5, a = 2, b = 1, s = 2, kappa = 5 } = {}) {
  mu = [].concat(mu); dist = [].concat(dist);
  const p = immWeights({ dist, c, a, b, s });
  const logP = p.map(Math.log);
  return mapX(x, xi => logSumExp([
    ...mu.map((m, i) => logP[i] + dvonmises(xi, m, kappa)),
    logP[mu.length] + LOG_UNIF
  ]));
}

// SDM numerator on the log scale, bmm's two parametrisations (.dsdm_numer_sqrtexp, .dsdm_numer_bessel).
export function sdmLogNumer(x, mu, c, kappa, parametrization = "sqrtexp") {
  const shape = Math.exp(kappa * (Math.cos(x - mu) - 1));
  if (parametrization === "bessel") return c * shape / (2 * Math.PI * Math.exp(logI0scaled(kappa)));
  return c * shape * Math.sqrt(kappa) / Math.sqrt(2 * Math.PI);
}
// besselI(kappa, 0, expon.scaled = TRUE) on the log scale
const logI0scaled = k => logI0(k) - k;

// The normaliser is the integral of exp(numerator) over the circle. bmm uses stats::integrate on a
// half period; the integrand is smooth and periodic, so an equispaced sum over the full period
// converges exponentially in n. n = 1024 gives 5e-13 against bmm's quadrature (spike, 2026-10-25).
export function sdmLogDenom(mu, c, kappa, parametrization = "sqrtexp", n = 1024) {
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp(sdmLogNumer(-Math.PI + 2 * Math.PI * i / n, mu, c, kappa, parametrization));
  return Math.log(s * 2 * Math.PI / n);
}

export function dsdm(x, { mu = 0, c = 3, kappa = 3.5, parametrization = "sqrtexp" } = {}) {
  const logDenom = sdmLogDenom(mu, c, kappa, parametrization);
  return mapX(x, xi => sdmLogNumer(xi, mu, c, kappa, parametrization) - logDenom);
}
