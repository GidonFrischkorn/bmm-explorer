// Simulated data on the circular pages against bmm: the expected statistics against integrate() over bmm's d*(),
// and the statistics of a seeded sample against a sample from bmm's r*() of the same size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, assertClose } from "./helpers.mjs";
import { dmixture2p, dmixture3p, dimm, dsdm } from "../../js/models/circular.js";
import { circularSim, circularStats } from "../../js/lib/simulate.js";
import { uniforms } from "../../js/lib/random.js";

const fx = loadFixture("simulate");
const D = { mixture2p: dmixture2p, mixture3p: dmixture3p, imm: dimm, sdm: dsdm };
const W20 = 20 * Math.PI / 180;
const KEYS = [["mean_abs", "meanAbs"], ["mean_cos", "meanCos"], ["mean_sin", "meanSin"], ["within", "within"]];
// Two independent samples of the same size: the SE of their difference is sqrt(2) times one sample's SE.
const SE_LIMIT = 4 * Math.SQRT2;
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

  test(`${label}: a sample of ${cell.n} draws matches r${cell.fn}() within ${SE_LIMIT.toFixed(2)} SE`, () => {
    const got = circularStats(sim.draw(uniforms(cell.n, 437)), W20);
    for (const [r, k] of KEYS) {
      // A statistic that does not vary in bmm's sample (every draw within +-20 deg) has to be equal.
      if (cell.sample.se[r] === 0) {
        assert.equal(got[k], cell.sample.mean[r], `${r}: explorer ${got[k]}, bmm ${cell.sample.mean[r]}`);
        continue;
      }
      const z = (got[k] - cell.sample.mean[r]) / cell.sample.se[r];
      assert.ok(Math.abs(z) <= SE_LIMIT, `${r}: explorer ${got[k]}, bmm ${cell.sample.mean[r]}, ${z.toFixed(2)} SE apart`);
    }
  });
}
