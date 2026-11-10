// bmm's link table: the twelve element-wise links of link_transform(), each as f (native scale to parameter scale)
// and inv (back), with bmm's forms at the edges. tests/parity/links.test.mjs holds every link to values
// link_transform() computed. softmax is not here: it maps a group of weights at once, against a reference position
// (softmaxInv below, and each mixture page for the forward map).
import { log1pExp, logPnorm, mapX, qnorm } from "./math.js";

// log(expm1(x)) is Inf from x ~ 709, where it equals x to double precision: bmm returns x there. A NaN (x < 0) stays
// NaN; bmm returns NA for it.
const logExpm1 = x => {
  const y = Math.log(Math.expm1(x));
  return y === Infinity ? x : y;
};

export const LINKS = Object.freeze({
  identity: { f: x => x, inv: y => y },
  log: { f: Math.log, inv: Math.exp },
  // log1pExp (math.js) returns y above 33.3, where log(1 + exp(y)) equals y to double precision, and bmm's
  // .log1p_exp() returns y where it overflows: the same value on both sides.
  softplus: { f: logExpm1, inv: log1pExp },
  log1p: { f: Math.log1p, inv: Math.expm1 },
  logm1: { f: x => Math.log(x - 1), inv: y => Math.exp(y) + 1 },
  inverse: { f: x => 1 / x, inv: y => 1 / y },
  // y^2 on the way back, so a negative y returns its absolute value squared, as in bmm.
  sqrt: { f: Math.sqrt, inv: y => y * y },
  // R's qlogis() and plogis(), in their order of operations: 0 and 1 give -Inf and Inf.
  logit: { f: x => Math.log(x / (1 - x)), inv: y => 1 / (1 + Math.exp(-y)) },
  // R's qnorm() and pnorm(): pnorm as exp(log Phi), which the fixture holds to 1e-10 relative.
  probit: { f: qnorm, inv: y => Math.exp(logPnorm(y)) },
  // x is an angle: one outside -pi..pi has the eta of the same angle inside, and comes back as that angle.
  tan_half: { f: x => Math.tan(x / 2), inv: y => 2 * Math.atan(y) },
  loglog: { f: x => Math.log(-Math.log(x)), inv: y => Math.exp(-Math.exp(y)) },
  // The inverse as on bmm develop, -expm1(-exp(y)). CRAN 1.4.x computes 1 - exp(-exp(y)), which loses the
  // value below y ~ -37.5 (0 against exp(y)) and is off by more than 1e-10 relative below y ~ -15.
  cloglog: { f: x => Math.log(-Math.log1p(-x)), inv: y => -Math.expm1(-Math.exp(y)) },
});

export const LINK_NAMES = Object.freeze(Object.keys(LINKS));

// bmm reads a NULL link, a parameter that declares none, as identity; undefined and null here do the same.
function entry(name) {
  if (name === undefined || name === null) return LINKS.identity;
  if (!Object.hasOwn(LINKS, name)) {
    throw new Error(name === "softmax"
      ? 'link "softmax" maps a group of weights against a reference, not one value: use softmaxInv()'
      : `link "${name}" is not one of bmm's links (${LINK_NAMES.join(", ")})`);
  }
  return LINKS[name];
}

// x on the native scale to the parameter scale, and back; a number or an array.
export const link = (name, x) => mapX(x, entry(name).f);
export const invlink = (name, y) => mapX(y, entry(name).inv);

// Weights on the native scale to the softmax's parameter scale against the weight at index ref: log(w_i / w_ref),
// 0 at ref.
export function softmaxInv(weights, ref = 0) {
  if (!Number.isInteger(ref) || ref < 0 || ref >= weights.length) throw new Error(`softmaxInv: ref ${ref} is not an index of the weights`);
  return weights.map(w => Math.log(w / weights[ref]));
}
