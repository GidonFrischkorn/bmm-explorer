// The sampler's parts (js/lib/simulate.js, js/lib/random.js): inversion, seeding, histogram.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inverseCdf, circularSim, histogram, SIM_GRID, categoryCounts, splitTrials } from "../../js/lib/simulate.js";
import { uniforms, mulberry32, SIM_SEED } from "../../js/lib/random.js";
import { dvonmises, integrateExp } from "../../js/lib/math.js";

test("inverseCdf inverts a uniform density exactly", () => {
  const q = inverseCdf(SIM_GRID, SIM_GRID.map(() => 1 / (2 * Math.PI)));
  for (const u of [0, 0.1, 0.5, 0.731, 0.999]) assert.ok(Math.abs(q(u) - (-Math.PI + 2 * Math.PI * u)) < 1e-12, `u = ${u}`);
});

// The density is taken as linear within each grid cell, so the quantile's probability is off by up to about
// 7.0e-6 at kappa exp(5) = 148.4 (u near 0.84), the top of the pages' kappa sliders: far below 1/1000, the
// resolution of the largest sample a page draws.
test("inverseCdf of a von Mises: the integral up to each quantile is its probability", () => {
  for (const kappa of [0.5, 7.39, Math.exp(5)]) {
    const logd = x => x.map(v => dvonmises(v, 0, kappa));
    const q = inverseCdf(SIM_GRID, logd(SIM_GRID).map(Math.exp));
    for (const u of [0.02, 0.25, 0.5, 0.841, 0.9, 0.995]) {
      const mass = integrateExp(logd, -Math.PI, q(u), 4000);
      assert.ok(Math.abs(mass - u) < 1e-5, `kappa ${kappa}, u ${u}: mass ${mass}`);
    }
  }
});

test("draws are monotone in the uniforms, so a sample keeps its order as the density changes", () => {
  const us = uniforms(500, 1).sort((a, b) => a - b);
  for (const kappa of [1, 20]) {
    const xs = circularSim(x => x.map(v => dvonmises(v, 0.3, kappa)), 0.35).draw(us);
    assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1]));
  }
});

test("the same seed gives the same uniforms, another seed others", () => {
  assert.deepEqual(uniforms(5, 437), uniforms(5, 437));
  assert.notDeepEqual(uniforms(5, 437), uniforms(5, 438));
  const u = mulberry32(437)();
  assert.ok(u >= 0 && u < 1);
});

test("histogram bins are centred on the target, and the bin at +-180 degrees wraps", () => {
  const d = Math.PI / 180, draws = [-Math.PI, Math.PI, 179.9 * d, -175.1 * d, 174.9 * d, -174.9 * d, -4.9 * d, 0, 4.9 * d, 5.1 * d, -1];
  const h = histogram(draws, 36), w = 2 * Math.PI / 36, count = i => Math.round(h[i] * draws.length * w);
  assert.ok(Math.abs(h.reduce((s, v) => s + v * w, 0) - 1) < 1e-12);
  assert.equal(count(18), 3);  // centred on 0: -4.9, 0, 4.9
  assert.equal(count(19), 1);  // centred on 10: 5.1
  assert.equal(count(0), 4);   // centred on +-180: -180, 180, 179.9, -175.1
  assert.equal(count(35), 1);  // centred on 170: 174.9
  assert.equal(count(1), 1);   // centred on -170: -174.9
  assert.equal(count(12), 1);  // centred on -60: -1 rad = -57.3
});

test("categoryCounts puts each uniform in the category whose cumulative probability first exceeds it", () => {
  assert.deepEqual(categoryCounts([0.2, 0.3, 0.5], [0, 0.19, 0.2, 0.49, 0.5, 0.99]), [2, 2, 2]);
  assert.deepEqual(categoryCounts([2, 3, 5], [0.1, 0.45, 0.9]), [1, 1, 1], "probabilities are renormalised");
  const us = uniforms(1000, 5), a = categoryCounts([0.5, 0.5], us), b = categoryCounts([0.52, 0.48], us);
  assert.equal(a[0] + a[1], 1000);
  const moved = us.filter(u => u >= 0.5 && u < 0.52).length;
  assert.equal(b[0] - a[0], moved, "a shifted boundary moves only the trials between the old and the new boundary");
});

// Kolmogorov-Smirnov statistic of a sample against the uniform distribution, scaled by sqrt(n).
const ksUniform = us => {
  const s = [...us].sort((a, b) => a - b), n = s.length;
  return Math.sqrt(n) * Math.max(...s.map((u, i) => Math.max((i + 1) / n - u, u - i / n)));
};
test("the pages' start sample is a typical draw at every sample size, as a whole and in both halves", () => {
  const us = uniforms(1000, SIM_SEED);
  for (const n of [50, 100, 200, 500, 1000]) {
    const sample = us.slice(0, n);
    [sample, ...splitTrials(sample)].forEach((part, i) => {
      const k = ksUniform(part);
      assert.ok(k < 0.83, `n = ${n}, ${["all trials", "noise half", "signal half"][i]}: sqrt(n) D = ${k.toFixed(3)}`);
    });
  }
});
