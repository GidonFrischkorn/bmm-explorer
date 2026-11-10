import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtureSince, closeError } from "./helpers.mjs";
import { LINKS, LINK_NAMES, link, invlink, softmaxInv } from "../../js/lib/links.js";
import { LINEAR, LOG, LOGIT, scaleOf } from "../../js/lib/widget.js";

// bmm's link_transform() (R/make_fixtures.R § links): for each of the twelve links a forward cell (x native, y on the
// parameter scale) and an inverse cell (x on the parameter scale, y native), and one cell with a NULL link.
const fx = loadFixtureSince("links");

// Every value relative to |bmm's value|, floored at the smallest normal double (2^-1022), so a value bmm returns as
// 0 has to be 0 here and a tiny one (exp(-40) = 4.2e-18, log1p(1e-8)) has to keep its digits: an absolute floor of
// 1e-12 would let log(1 + exp(-40)) = 0 or exp(1e-8) - 1, the naive forms, pass. NaN (also bmm's NA, which softplus
// returns out of range) has to be NaN, an infinity the same infinity (closeError).
const TOL = 1e-10;
const relError = (g, r) => (Number.isNaN(r) ? (Number.isNaN(g) ? 0 : Infinity) : closeError(g, r, Math.max(2 ** -1022, Math.abs(r))));

if (fx) {
  for (const cell of fx.cells) {
    if (cell.x.length === 0 || cell.x.length !== cell.y.length) throw new Error(`links.json: cell ${cell.link} without matching x and y`);
    const name = cell.link ?? "NULL";
    test(`${name} ${cell.inverse ? "inverse" : "forward"} matches link_transform()`, () => {
      const got = cell.inverse ? invlink(cell.link, cell.x) : link(cell.link, cell.x);
      cell.x.forEach((x, i) => {
        const e = relError(got[i], cell.y[i]);
        assert.ok(e <= TOL, `${name}${cell.inverse ? " inverse" : ""}(${x}) = ${got[i]}, bmm ${cell.y[i]} (relative error ${e})`);
      });
    });
  }

  test("LINK_NAMES is the set of links bmm's link_transform() was called with", () => {
    const named = new Set(fx.cells.map(c => c.link).filter(l => l !== null));
    assert.deepEqual([...LINK_NAMES].sort(), [...named].sort());
    assert.equal(LINK_NAMES.length, 12);
  });

  // invlink(link(x)) = x for every native value of a forward cell where the link is finite: within -pi..pi for tan_half,
  // which reads x as an angle and returns the angle inside that range.
  for (const name of LINK_NAMES) {
    test(`${name}: invlink(link(x)) returns x`, () => {
      const cell = fx.cells.find(c => c.link === name && !c.inverse);
      const xs = cell.x.filter(x => Number.isFinite(link(name, x)) && (name !== "tan_half" || Math.abs(x) < Math.PI));
      assert.ok(xs.length >= 3, `${name}: ${xs.length} interior points`);
      for (const x of xs) {
        const back = invlink(name, link(name, x)), e = closeError(back, x, Math.max(2 ** -1022, Math.abs(x)));
        assert.ok(e <= 1e-12, `${name}: invlink(link(${x})) = ${back} (relative error ${e})`);
      }
    });
  }
}

test("softmax is not a link: it needs every weight of a group at once", () => {
  assert.ok(!("softmax" in LINKS));
  assert.ok(!LINK_NAMES.includes("softmax"));
  assert.throws(() => link("softmax", 0.5), /softmax/);
  assert.throws(() => invlink("softmax", 0.5), /softmax/);
});

test("an unknown link throws; a missing one is identity, as bmm reads a NULL link", () => {
  assert.throws(() => link("exp", 1), /exp/);
  assert.throws(() => invlink("Log", 1), /Log/);
  assert.equal(link(undefined, -2.5), -2.5);
  assert.equal(invlink(null, 3), 3);
  assert.deepEqual(link(undefined, [1, 2]), [1, 2]);
});

test("softmaxInv: log(w_i / w_ref), and the softmax of it returns the weights", () => {
  const w = [0.2, 0.3, 0.5];
  const eta = softmaxInv(w, 0);
  assert.equal(eta[0], 0);
  assert.ok(Math.abs(eta[1] - Math.log(1.5)) < 1e-15 && Math.abs(eta[2] - Math.log(2.5)) < 1e-15);
  const e = eta.map(Math.exp), s = e.reduce((a, b) => a + b, 0);
  e.forEach((v, i) => assert.ok(Math.abs(v / s - w[i]) < 1e-15));
  assert.equal(softmaxInv(w, 2)[2], 0);
  assert.throws(() => softmaxInv(w, 3), /ref/);
});

// LOG and LOGIT are now built from the link table. A page's slider and number field must show what they showed before,
// so both maps are compared bit for bit with the definitions they replace, over every slider position a page's step
// reaches (-12 to 12 in steps of 0.001) and over natural values from 1e-6 to 1e6 and from 0.0005 to 0.9995.
test("LOG and LOGIT map slider and number field exactly as before", () => {
  const oldLOG = { toRange: Math.log, fromRange: r => +Math.exp(r).toPrecision(3) };
  const oldLOGIT = { toRange: v => Math.log(v / (1 - v)), fromRange: r => +(1 / (1 + Math.exp(-r))).toPrecision(3) };
  for (let i = -12000; i <= 12000; i++) {
    const r = i / 1000;
    assert.ok(Object.is(LOG.fromRange(r), oldLOG.fromRange(r)), `LOG.fromRange(${r})`);
    assert.ok(Object.is(LOGIT.fromRange(r), oldLOGIT.fromRange(r)), `LOGIT.fromRange(${r})`);
  }
  for (let i = -6000; i <= 6000; i++) {
    const v = 10 ** (i / 1000);
    assert.ok(Object.is(LOG.toRange(v), oldLOG.toRange(v)), `LOG.toRange(${v})`);
  }
  for (let i = 1; i < 2000; i++) {
    const v = i / 2000;
    assert.ok(Object.is(LOGIT.toRange(v), oldLOGIT.toRange(v)), `LOGIT.toRange(${v})`);
  }
  assert.equal(LINEAR.fromRange(0.12345), 0.12345);
});

test("scaleOf: slider in link units, number field in natural units to 3 significant digits", () => {
  const s = scaleOf("softplus");
  assert.equal(s.toRange(2), link("softplus", 2));
  assert.equal(s.fromRange(link("softplus", 2.34567)), 2.35);
  assert.throws(() => scaleOf("tan_half"), /tan_half/);
  assert.throws(() => scaleOf("softmax"), /softmax/);
});
