// Simulated data on the categorical and signal detection pages against bmm. Per cell: the probabilities the page
// computes against those bmm's r*() samples from, bmm's sample of 1e5 trials against those probabilities, and the
// sample the page's own sampling function draws from the cell's seed against bmm's sample.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, loadFixtureSince, assertCloseRel } from "./helpers.mjs";
import { m3Probs, ssActs, csActs, defaultB } from "../../js/models/m3.js";
import { mptProbs, mptCovariates } from "../../js/models/mpt.js";
import { SPAN_TREE } from "../../js/models/mpt-span-tree.js";
import { ynLogPOld, biasToCriterion, mafcPc, ratingLogProbs } from "../../js/models/sdt.js";
import { categoricalShares, ynSample, ratingSample, mafcSample } from "../../js/lib/simulate.js";
import { uniforms } from "../../js/lib/random.js";

const fx = loadFixture("simulate_counts");
const nodes = loadFixtureSince("nodes");
const gh = nodes?.cells.find(c => c.fn === ".m3_gauss_rule");
const rules = nodes && { gh: nodes.cells.find(c => c.fn === ".mafc_gh"), gl: nodes.cells.find(c => c.fn === ".mafc_gl") };
// Log probabilities as sdt.test.mjs and m3.test.mjs hold them: 1e-10 absolute (the quadratures run on bmm's nodes).
const TOL = 1e-10;
// bmm's sample against fixed probabilities: one random side, 4 SE. The page's sample against bmm's: two independent
// samples, 4 sqrt(2) SE. The SE is the exact one, sqrt(p (1 - p) / n) from the page's probability, so a category of
// probability 0 or 1 must match exactly. A rare category is held loosely relative to its own size (at p = 0.001 and
// n = 1e5, 4 SE is 40% of p, and 4 sqrt(2) SE, the page's sample against bmm's, 57%); its probability is held at TOL
// by the first check, and the samples only confirm that both sides draw a multinomial on it.
const Z = 4, Z2 = 4 * Math.SQRT2;
// Cells that need bmm's quadrature nodes (the gaussian M3 rule; m-AFC under normal or logistic noise at m > 2).
const needsNodes = cell => cell.args.choice_rule === "gaussian" || cell.fn === "sdt_mafc";

// The page's probabilities, flat in the fixture's order (yes/no: false alarms, hits; rating: noise, then signal
// categories), and the sample its sampling function draws from uniforms(trials, seed), in the same order.
// yes/no and rating draw n noise and n signal trials, so 2n uniforms.
function explorer(cell) {
  const a = cell.args, us = k => uniforms(k * cell.n, cell.seed);
  switch (cell.fn) {
    case "m3_ss": case "m3_cs": {
      const b = defaultB(a.choice_rule);
      const probs = cell.fn === "m3_ss"
        ? m3Probs(ssActs({ ...a, b }), [1, a.n_other, a.n_npl], a.choice_rule, gh)
        : m3Probs(csActs({ ...a, b }), a.num_options, a.choice_rule, gh);
      return { probs, sample: categoricalShares(probs, us(1)) };
    }
    case "mpt_span": {
      const probs = mptProbs(SPAN_TREE, { Pi: a.Pi, Pb: a.Pb, ...mptCovariates(SPAN_TREE, a) });
      return { probs, sample: categoricalShares(probs, us(1)) };
    }
    case "sdt_yn": {
      const v = { d: a.d, sdratio: a.sdratio, dist: a.dist, criterion: a.criterion ?? biasToCriterion(a.bias, a.d, a.sdratio) };
      const rates = [0, 1].map(stim => Math.exp(ynLogPOld(v, stim)));
      return { probs: rates, sample: ynSample(rates, us(2)) };
    }
    case "sdt_mafc": {
      const pc = mafcPc(a.d, a.m, a.dist, rules);
      return { probs: [pc], sample: [mafcSample(pc, us(1))] };
    }
    case "sdt_rating": {
      const probs = [0, 1].map(stim => ratingLogProbs(a.thresholds, a, stim).map(Math.exp));
      return { probs: probs.flat(), sample: ratingSample(probs, us(2)).flat() };
    }
  }
  throw new Error(`no explorer sampler for ${cell.fn}`);
}
// bmm's side in the same flat order: the probabilities its r*() samples from, and its sample's shares.
const bmm = cell => cell.fn === "sdt_rating"
  ? { probs: [...cell.noise.probs, ...cell.signal.probs], p: [...cell.noise.p, ...cell.signal.p] }
  : { probs: [cell.probs].flat(), p: [cell.p].flat() };

// Each share within z SE of its reference, the SE from the page's probability.
function assertShares(got, ref, probs, n, z, label) {
  probs.forEach((pr, k) => {
    const se = Math.sqrt(pr * (1 - pr) / n);
    if (se === 0) assert.equal(got[k], ref[k], `${label}, category ${k + 1}: ${got[k]} vs ${ref[k]}`);
    else assert.ok(Math.abs(got[k] - ref[k]) <= z * se, `${label}, category ${k + 1}: ${got[k]} vs ${ref[k]}, ${((got[k] - ref[k]) / se).toFixed(2)} SE apart`);
  });
}

for (const cell of fx.cells) {
  const skip = needsNodes(cell) && !nodes ? "needs bmm's quadrature nodes (nodes.json)" : false;
  const label = `${cell.fn}(${JSON.stringify(cell.args)})`;
  test(`${label}: the page's probabilities are those bmm ${fx.bmm_version}'s r*() samples from`, { skip }, () => {
    assertCloseRel(explorer(cell).probs.map(Math.log), bmm(cell).probs.map(Math.log), TOL, "log probabilities");
  });
  test(`${label}: bmm's sample of 1e5 trials lies within ${Z} SE of the page's probabilities`, { skip }, () => {
    const { probs } = explorer(cell);
    assertShares(bmm(cell).p, probs, probs, cell.n, Z, "bmm's sample");
  });
  test(`${label}: the page's sample of 1e5 trials (seed ${cell.seed}) matches bmm's within ${Z2.toFixed(2)} SE`, { skip }, () => {
    const { probs, sample } = explorer(cell);
    assertShares(sample, bmm(cell).p, probs, cell.n, Z2, "page's sample");
  });
}
