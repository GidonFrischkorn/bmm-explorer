// Port of bmm's M3 category probabilities (.compute_m3_probability_vector in R/distributions.R).
// acts and numOptions are arrays in the order of the response categories.
// Held to bmm by tests/parity/m3.test.mjs.
import { logPnorm, logSumExp } from "../lib/math.js";

// gh: bmm's quadrature rule for the gaussian rule ({ nodes, log_w, log_Phi }, .m3_gauss_rule()), which
// R/make_fixtures.R writes to nodes.json; only the gaussian rule needs it.
export function m3Probs(acts, numOptions, choiceRule = "simple", gh) {
  if (choiceRule === "gaussian") return m3GaussLogP(acts, numOptions, gh).map(Math.exp);
  const weighted = acts.map((A, k) => (choiceRule === "softmax" ? Math.exp(A) : A) * numOptions[k]);
  const total = weighted.reduce((p, q) => p + q, 0);
  return weighted.map(v => v / total);
}

// Default activation functions of m3(version = "ss"): corr = b + a + c, other = b + a, npl = b.
export const ssActs = ({ a, c, b }) => [b + a + c, b + a, b];

// m3(version = "cs"), categories in bmm's required order: correct, dist_context (distractor close in
// context, filtered by f), other, dist_other, npl.
export const csActs = ({ a, c, f, b }) => [b + a + c, b + f * a + f * c, b + a, b + f * a, b];

// bmm fixes b at 0.1 under the simple rule and at 0 under softmax and gaussian.
export const defaultB = choiceRule => (choiceRule === "simple" ? 0.1 : 0);

// Gaussian (Thurstonian) rule, .m3_gauss_logp_r(): each candidate of category j draws A_j + N(0, 1) and
// the largest wins, P(k) = n_k E_z[Phi(z)^(n_k - 1) prod_{j != k} Phi(z + A_k - A_j)^n_j], z ~ N(0, 1),
// by bmm's Gauss-Hermite rule. As in bmm, a category with fewer than 0.5 options is absent: it does
// not compete, and its own log probability is -100.
export function m3GaussLogP(acts, numOptions, gh) {
  if (!gh) throw new Error("the gaussian rule needs bmm's quadrature nodes (nodes.json)");
  return acts.map((Ak, k) => {
    const nk = numOptions[k];
    if (!(nk >= 0.5)) return -100;
    const terms = gh.nodes.map((z, q) => {
      let t = gh.log_w[q] + (nk - 1) * gh.log_Phi[q];
      acts.forEach((Aj, j) => { if (j !== k && numOptions[j] >= 0.5) t += numOptions[j] * logPnorm(Ak - Aj + z); });
      return t;
    });
    return Math.log(nk) + logSumExp(terms);
  });
}
