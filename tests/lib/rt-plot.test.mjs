// The y limit of the mirrored density panel (js/lib/rt-plot.js): the curves set it, a simulated sample raises it by
// at most half again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { densityLimit, mirroredDensity } from "../../js/lib/rt-plot.js";

const curves = [0.2, 1.9, 2, 0.4, NaN, Infinity];

test("without bars the limit is the highest finite curve value", () => {
  assert.equal(densityLimit(curves), 2);
  assert.equal(densityLimit(curves, []), 2);
  assert.equal(densityLimit([NaN, -Infinity]), 1e-9);
});

test("bars below the curves leave the limit at the curves", () => {
  assert.equal(densityLimit(curves, [0, 0.5, 1.99]), 2);
});

test("bars between 1 and 1.5 times the curves raise the limit to the highest bar", () => {
  assert.equal(densityLimit(curves, [0.3, 2.6, 1]), 2.6);
  assert.equal(densityLimit(curves, [3]), 3);
});

test("bars above 1.5 times the curves raise the limit to 1.5 times the curves", () => {
  assert.equal(densityLimit(curves, [0.3, 3.01, 9]), 3);
  assert.equal(densityLimit(curves, [NaN, 40]), 3);
});

// mirroredDensity() asks its axis for densityLimit() over the curves of both responses and the bars of both; the axis
// stub stops it there, before anything is drawn.
test("mirroredDensity sizes its axis by densityLimit over both responses' curves and bars", () => {
  const stop = new Error("stop"), asked = [];
  const axis = { next(max) { asked.push(max); throw stop; } };
  const spec = (bars) => ({ upper: [{ y: [0.5, 1.2] }], lower: [{ y: [2, NaN] }], bars, axis });
  for (const bars of [undefined, { edges: [0, 1, 2], upper: [2.6, 0], lower: [0, 1] }, { edges: [0, 1, 2], upper: [0, 1], lower: [0, 9] }]) {
    assert.throws(() => mirroredDensity(null, spec(bars)), e => e === stop);
  }
  assert.deepEqual(asked, [2, 2.6, 3]);
});
