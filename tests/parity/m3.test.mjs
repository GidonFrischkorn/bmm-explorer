import { test } from "node:test";
import { loadFixture, assertClose } from "./helpers.mjs";
import { m3Probs, ssActs, csActs } from "../../js/models/m3.js";

const fx = loadFixture("m3");
for (const cell of fx.cells) {
  test(`${cell.fn} ${JSON.stringify(cell.args)} matches bmm ${fx.bmm_version}`, () => {
    const { args } = cell;
    const probs = cell.fn === "m3_ss"
      ? m3Probs(ssActs(args), [1, args.n_other, args.n_npl], args.choice_rule)
      : m3Probs(csActs(args), args.num_options, args.choice_rule);
    assertClose(probs, cell.probs, 1e-12, cell.fn);
  });
}
