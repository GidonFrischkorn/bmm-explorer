// Port of bmm's M3 category probabilities (.compute_m3_probability_vector in R/distributions.R).
// acts and numOptions are arrays in the order of the response categories.
// Held to bmm by tests/parity/m3.test.mjs.

export function m3Probs(acts, numOptions, choiceRule = "simple") {
  const weighted = acts.map((A, k) => (choiceRule === "softmax" ? Math.exp(A) : A) * numOptions[k]);
  const total = weighted.reduce((p, q) => p + q, 0);
  return weighted.map(v => v / total);
}

// Default activation functions of m3(version = "ss"): corr = b + a + c, other = b + a, npl = b.
// bmm fixes b at 0.1 for the simple rule and 0 for softmax.
export const ssActs = ({ a, c, b }) => [b + a + c, b + a, b];

// m3(version = "cs"), categories in bmm's required order: correct, dist_context (distractor close in
// context, filtered by f), other, dist_other, npl.
export const csActs = ({ a, c, f, b }) => [b + a + c, b + f * a + f * c, b + a, b + f * a, b];

export const defaultB = choiceRule => (choiceRule === "softmax" ? 0 : 0.1);

// Multinomial log probability of counts x under probs, as dm3() returns it (dmultinom, log = TRUE).
export function logMultinom(x, probs) {
  const n = x.reduce((p, q) => p + q, 0);
  const lgamma1p = k => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  return lgamma1p(n) - x.reduce((s, k) => s + lgamma1p(k), 0) + x.reduce((s, k, i) => s + (k > 0 ? k * Math.log(probs[i]) : 0), 0);
}
