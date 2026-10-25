import { test } from "node:test";
import { loadFixture, assertClose } from "./helpers.mjs";
import { dmixture2p, dmixture3p, dimm, dsdm } from "../../js/models/circular.js";

const fx = loadFixture("circular");
const impl = { dmixture2p, dmixture3p, dimm, dsdm };
const tol = { dmixture2p: 1e-10, dmixture3p: 1e-10, dimm: 1e-10, dsdm: 1e-9 };   // dsdm: quadrature vs integrate()

for (const cell of fx.cells) {
  test(`${cell.fn}(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
    assertClose(impl[cell.fn](cell.x, cell.args), cell.logd, tol[cell.fn], cell.fn);
  });
}
