// Simulated data on the circular pages against bmm: the expected statistics against integrate() over bmm's d*(),
// and the statistics of a seeded sample, and of bmm's sample from r*() of the same size, against those expected values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, assertClose, sampleError, SAMPLE_LIMIT } from "./helpers.mjs";
import { dmixture2p, dmixture3p, dimm, dsdm } from "../../js/models/circular.js";
import { circularSim, circularStats } from "../../js/lib/simulate.js";
import { uniforms } from "../../js/lib/random.js";

const fx = loadFixture("simulate");
const D = { mixture2p: dmixture2p, mixture3p: dmixture3p, imm: dimm, sdm: dsdm };
const W20 = 20 * Math.PI / 180;
const KEYS = [["mean_abs", "meanAbs"], ["mean_cos", "meanCos"], ["mean_sin", "meanSin"], ["within", "within"]];
// Each sample is held to the exact expected values within SAMPLE_LIMIT (5) SE (helpers.mjs, sampleError()), not to
// the other sample, whose own error would eat into the limit. Each cell draws from its own seed (cell.seed, the one
// bmm's sample was drawn with in R), so the cells' errors are independent.
// The expected statistics are Simpson sums on the page's 4097-point grid, not adaptive quadrature: within 1e-9
// of integrate() except for the most peaked densities, 1.1e-8 at the SDM page's corner (c 20, kappa 50; a
// mean |error| of 0.015 rad). 8193 points would reach 7e-10 there but double the IMM page's sampling cost.
const TOL_EXPECTED = 2e-8;

for (const cell of fx.cells) {
  const sim = circularSim(x => D[cell.fn](x, cell.args), W20);
  const label = `${cell.fn}(${JSON.stringify(cell.args)})`;

  test(`${label}: expected statistics match integrate() over bmm ${fx.bmm_version}`, () => {
    assertClose(KEYS.map(([, k]) => sim.expected[k]), KEYS.map(([r]) => cell.expected[r]), TOL_EXPECTED, cell.fn);
  });

  test(`${label}: a sample of ${cell.n} draws is within ${SAMPLE_LIMIT} SE of the expected statistics`, () => {
    const got = circularStats(sim.draw(uniforms(cell.n, cell.seed)), W20);
    const errs = KEYS.map(([r, k]) => sampleError(cell, r, got[k])).filter(e => e);
    assert.ok(errs.length === 0, `explorer: ${errs.join("; ")}`);
  });

  // bmm's r*() against its own d*(): the committed sample, or in CI the fresh one, so the sample the SEs come from is
  // itself held to the expected values.
  test(`${label}: r${cell.fn}()'s sample is within ${SAMPLE_LIMIT} SE of the expected statistics`, () => {
    const errs = KEYS.map(([r]) => sampleError(cell, r, cell.sample.mean[r])).filter(e => e);
    assert.ok(errs.length === 0, `bmm: ${errs.join("; ")}`);
  });
}
