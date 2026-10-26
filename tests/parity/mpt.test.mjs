import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtureIfPresent, assertClose } from "./helpers.mjs";
import { mptProbs, mptCovariates, dmpt, branchString } from "../../js/models/mpt.js";
import { SPAN_TREE, spanTreeToM3 } from "../../js/models/mpt-span-tree.js";
import { m3Probs, ssActs } from "../../js/models/m3.js";

// mpt.json is written only by a bmm that has dmpt(); without it the cells are skipped, not failed.
const fx = loadFixtureIfPresent("mpt");
if (!fx) {
  test("mpt fixtures", { skip: "mpt.json absent: the bmm that wrote the fixtures has no dmpt()" }, () => {});
} else {
  test(`span tree branches match the tree bmm ${fx.bmm_version} evaluated`, () => {
    for (const cat of SPAN_TREE.categories) assert.equal(branchString(SPAN_TREE, cat), fx.branches[cat], cat);
  });
  for (const cell of fx.cells) {
    const { Pm, Pb, n_other, n_npl } = cell.args;
    const values = { Pm, Pb, ...mptCovariates(SPAN_TREE, { n_other, n_npl }) };
    test(`${cell.fn} ${JSON.stringify(cell.args)} matches bmm ${fx.bmm_version}`, () => {
      assertClose(mptProbs(SPAN_TREE, values), cell.probs, 1e-12, "probs");
      assertClose([dmpt(cell.counts, SPAN_TREE, values)], [cell.logd], 1e-10, "dmpt");
    });
    // The equivalence the page states: M3's simple rule with the mapped a and c gives bmm's MPT probabilities.
    test(`${cell.fn} ${JSON.stringify(cell.args)} equals M3 simple at the mapped a, c`, () => {
      const probs = m3Probs(ssActs({ ...spanTreeToM3(cell.args), b: 0.1 }), [1, n_other, n_npl], "simple");
      assertClose(probs, cell.probs, 1e-12, "m3 simple");
    });
  }
}
