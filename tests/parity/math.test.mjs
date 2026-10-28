import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "./helpers.mjs";
import { logPnorm, lgamma, qnorm, qgamma } from "../../js/lib/math.js";

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

// qnorm against R's qnorm(p), relative to |q|, with 1e-15 absolute near p = 0.5, where q passes through 0.
// The rational approximations are evaluated in R's order, so only a libm that rounds log() or sqrt() differently
// moves the result: a few units in the last place, below 1e-15.
const qcell = loadFixture("math").cells.find(c => c.fn === "qnorm");
if (!qcell?.x?.length || qcell.x.length !== qcell.q?.length) throw new Error("math.json: no qnorm cell with matching x and q");
qcell.x.forEach((p, i) => {
  test(`qnorm(${p}) matches R's qnorm`, () => {
    const ref = qcell.q[i], got = qnorm(p);
    assert.ok(Math.abs(got - ref) <= 1e-15 * Math.max(1, Math.abs(ref)), `qnorm(${p}) = ${got}, R ${ref}`);
  });
});

// qgamma against R's qgamma(p, shape), on the log scale: 1e-10 in log q, the contract for every density, from shapes
// below 0.5 (an ezdm boundary with 2 rts) to 1000 and quantiles out to 2^-33 and 1 - 2^-33, the uniforms a page can
// pass, then two points where an earlier port returned about 1e17, 2000 seeded points at shapes 0.04 to 0.3 and four
// subnormal answers (R/make_fixtures.R § math), which the port hits exactly. Measured: 1.7e-13 (shape 0.0434, p 8.7e-8,
// q 9.2e-164).
const gcell = loadFixture("math").cells.find(c => c.fn === "qgamma");
if (!gcell?.x?.length || gcell.x.length !== gcell.q?.length || gcell.x.length !== gcell.shape?.length) {
  throw new Error("math.json: no qgamma cell with matching x, shape and q");
}
gcell.x.forEach((p, i) => {
  test(`qgamma(${p}, shape ${gcell.shape[i]}) matches R's qgamma`, () => {
    const ref = gcell.q[i], got = qgamma(p, gcell.shape[i], gcell.args.rate);
    assert.ok(Math.abs(Math.log(got) - Math.log(ref)) <= 1e-10, `qgamma(${p}, ${gcell.shape[i]}) = ${got}, R ${ref}`);
  });
});
