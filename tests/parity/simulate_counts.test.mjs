// Simulated data on the categorical and signal detection pages against bmm: the proportions of a seeded sample of
// 1e5 trials, counted from the parity-tested probabilities, against a sample of the same size from bmm's r*().
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, loadFixtureSince } from "./helpers.mjs";
import { m3Probs, ssActs, csActs } from "../../js/models/m3.js";
import { mptProbs, mptCovariates } from "../../js/models/mpt.js";
import { SPAN_TREE } from "../../js/models/mpt-span-tree.js";
import { ynLogPOld, biasToCriterion, mafcPc, ratingLogProbs } from "../../js/models/sdt.js";
import { categoryCounts, splitTrials, shareBelow } from "../../js/lib/simulate.js";
import { uniforms } from "../../js/lib/random.js";

const fx = loadFixture("simulate_counts");
const nodes = loadFixtureSince("nodes");
const gh = nodes?.cells.find(c => c.fn === ".m3_gauss_rule");
const rules = nodes && { gh: nodes.cells.find(c => c.fn === ".mafc_gh"), gl: nodes.cells.find(c => c.fn === ".mafc_gl") };
// Two independent samples of the same size: the SE of their difference is sqrt(2) times one sample's SE.
const SE_LIMIT = 4 * Math.SQRT2;

// The explorer's shares of n trials over categories with these probabilities, from seeded uniforms.
const shares = (probs, n, seed = 437) => categoryCounts(probs, uniforms(n, seed)).map(k => k / n);
// Noise and signal trials split from one seeded stream of 2n uniforms, as the yes/no and rating pages split theirs.
const halves = n => splitTrials(uniforms(2 * n, 437));
// Cells that need bmm's quadrature nodes (the gaussian M3 rule; m-AFC under normal or logistic noise at m > 2).
const needsNodes = cell => cell.args.choice_rule === "gaussian" || cell.fn === "sdt_mafc";

// Every cell: its fixture shares and SEs ([{ p, se }]) and the explorer's shares, in the same order.
function compare(cell, n) {
  const a = cell.args;
  switch (cell.fn) {
    case "m3_ss": return [[cell], [shares(m3Probs(ssActs(a), [1, a.n_other, a.n_npl], a.choice_rule, gh), n)]];
    case "m3_cs": return [[cell], [shares(m3Probs(csActs(a), a.num_options, a.choice_rule, gh), n)]];
    case "mpt_span": return [[cell], [shares(mptProbs(SPAN_TREE, { Pi: a.Pi, Pb: a.Pb, ...mptCovariates(SPAN_TREE, a) }), n)]];
    case "sdt_yn": {
      const pars = { ...a, criterion: a.criterion ?? biasToCriterion(a.bias, a.d, a.sdratio) };
      return [[cell], [halves(n).map((us, s) => shareBelow(Math.exp(ynLogPOld(pars, s)), us))]];
    }
    case "sdt_mafc": return [[{ p: [cell.p].flat(), se: [cell.se].flat() }], [[shareBelow(mafcPc(a.d, a.m, a.dist, rules), uniforms(n, 437))]]];
    case "sdt_rating": return [[cell.noise, cell.signal],
      halves(n).map((us, s) => categoryCounts(ratingLogProbs(a.thresholds, a, s).map(Math.exp), us).map(k => k / n))];
  }
  throw new Error(`no explorer sampler for ${cell.fn}`);
}

for (const cell of fx.cells) {
  const skip = needsNodes(cell) && !nodes ? "needs bmm's quadrature nodes (nodes.json)" : false;
  test(`${cell.fn}(${JSON.stringify(cell.args)}): a sample of 1e5 trials matches bmm ${fx.bmm_version}'s r*() within ${SE_LIMIT.toFixed(2)} SE`, { skip }, () => {
    const [refs, gots] = compare(cell, 1e5);
    refs.forEach((ref, r) => ref.p.forEach((p, k) => {
      const got = gots[r][k], se = ref.se[k];
      if (se === 0) assert.equal(got, p, `${cell.fn} category ${k + 1}: explorer ${got}, bmm ${p}`);
      else assert.ok(Math.abs(got - p) <= SE_LIMIT * se, `${cell.fn} category ${k + 1}: explorer ${got}, bmm ${p}, ${((got - p) / se).toFixed(2)} SE apart`);
    }));
  });
}
