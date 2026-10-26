import { test } from "node:test";
import { loadFixture, assertClose } from "./helpers.mjs";
import { dmixture2p, dmixture3p, dimm, dsdm } from "../../js/models/circular.js";
import { integrateExp } from "../../js/lib/math.js";

const fx = loadFixture("circular");
const impl = { dmixture2p, dmixture3p, dimm, dsdm };
const tol = { dmixture2p: 1e-10, dmixture3p: 1e-10, dimm: 1e-10, dsdm: 1e-9 };   // dsdm: quadrature vs integrate()

for (const cell of fx.cells.filter(c => c.fn !== "dimm_mass")) {
  test(`${cell.fn}(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
    assertClose(impl[cell.fn](cell.x, cell.args), cell.logd, tol[cell.fn], cell.fn);
  });
}

// P(lo < x < hi) under dimm, the IMM page's across-set-size measure, against integrate() over bmm's dimm().
for (const cell of fx.cells.filter(c => c.fn === "dimm_mass")) {
  const { lo, hi, ...pars } = cell.args;
  test(`dimm mass on [${lo.toFixed(3)}, ${hi.toFixed(3)}] (${JSON.stringify(pars)}) matches bmm ${fx.bmm_version}`, () => {
    assertClose([integrateExp(x => dimm(x, pars), lo, hi)], [cell.mass], 1e-9, "dimm_mass");
  });
}
