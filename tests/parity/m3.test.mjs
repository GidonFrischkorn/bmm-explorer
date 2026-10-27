import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, loadFixtureSince, assertClose } from "./helpers.mjs";
import { m3Probs, ssActs, csActs, defaultB } from "../../js/models/m3.js";

const fx = loadFixture("m3");
const gh = loadFixtureSince("nodes")?.cells.find(c => c.fn === ".m3_gauss_rule");
for (const cell of fx.cells) {
  test(`${cell.fn} ${JSON.stringify(cell.args)} matches bmm ${fx.bmm_version}`, () => {
    const { args } = cell;
    // The page takes b from defaultB(); the cell records bmm's mod$fixed_parameters$b.
    assert.equal(defaultB(args.choice_rule), args.b, `b under the ${args.choice_rule} rule`);
    const probs = cell.fn === "m3_ss"
      ? m3Probs(ssActs(args), [1, args.n_other, args.n_npl], args.choice_rule, gh)
      : m3Probs(csActs(args), args.num_options, args.choice_rule, gh);
    // The gaussian rule is a quadrature on bmm's nodes and is compared on the log scale, where bmm
    // computes it; the closed-form rules on the probability scale.
    if (args.choice_rule === "gaussian") assertClose(probs.map(Math.log), cell.probs.map(Math.log), 1e-10, cell.fn);
    else assertClose(probs, cell.probs, 1e-12, cell.fn);
  });
}
