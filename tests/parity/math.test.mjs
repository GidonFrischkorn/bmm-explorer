import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "./helpers.mjs";
import { logPnorm } from "../../js/lib/math.js";

// logPnorm against R's pnorm(x, log.p = TRUE), relative to |log Phi| at every point. In the lower tail
// log Phi reaches -5e9 (x = -1e5), where an absolute 1e-10 is below one unit in the last place; in the upper
// tail it is the tail probability itself (-6e-16 at x = 8, -6e-300 at x = 37), which an absolute tolerance
// could not see at all. The floor at the smallest normal double (2^-1022) only matters where R returns 0
// (x >= 38.5), so there the port must return 0 too. 1e-13 leaves room for a libm that rounds exp() or log()
// differently.
const cell = loadFixture("math").cells.find(c => c.fn === "pnorm");
// A cell without points would pass without testing anything.
if (!cell?.x?.length || cell.x.length !== cell.logd?.length) throw new Error("math.json: no pnorm cell with matching x and logd");
cell.x.forEach((x, i) => {
  test(`logPnorm(${x}) matches pnorm(log.p = TRUE)`, () => {
    const ref = cell.logd[i], got = logPnorm(x);
    assert.ok(Math.abs(got - ref) <= 1e-13 * Math.max(2 ** -1022, Math.abs(ref)), `logPnorm(${x}) = ${got}, R ${ref}`);
  });
});
