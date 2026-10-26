import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "./helpers.mjs";
import { logPnorm, lgamma } from "../../js/lib/math.js";

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

// lgamma against R's lgamma(), relative to max(1, |lgamma|): near 1 and 2, where lgamma is 0, the recurrence
// subtracts two values near 15 and keeps an absolute error of a few 1e-15.
const lg = loadFixture("math").cells.find(c => c.fn === "lgamma");
if (!lg?.x?.length || lg.x.length !== lg.logd?.length) throw new Error("math.json: no lgamma cell with matching x and logd");
lg.x.forEach((x, i) => {
  test(`lgamma(${x}) matches R`, () => {
    const ref = lg.logd[i], got = lgamma(x);
    assert.ok(Math.abs(got - ref) <= 1e-13 * Math.max(1, Math.abs(ref)), `lgamma(${x}) = ${got}, R ${ref}`);
  });
});
