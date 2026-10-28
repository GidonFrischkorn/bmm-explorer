// dashOpacity (js/lib/plot.js): a dashed reference curve keeps 3:1 against white, and is as faint as that allows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dashOpacity, SERIES } from "../../js/lib/plot.js";

// WCAG relative luminance, written out separately from the code under test.
const channel = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lumOf = rgb => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const contrastOnWhite = (hex, alpha) => 1.05 / (lumOf(rgbOf(hex).map(v => 255 + alpha * (v - 255))) + 0.05);

test("every series colour and the greys keep 3:1 as a dashed curve", () => {
  for (const hex of [...SERIES.slice(0, 4), "#595959", "#222222"]) {
    const a = dashOpacity(hex);
    assert.ok(a >= 0.6 && a <= 1, `${hex}: ${a}`);
    assert.ok(contrastOnWhite(hex, a) >= 3, `${hex} at ${a}: ${contrastOnWhite(hex, a).toFixed(2)}`);
  }
});

test("a dashed curve is no stronger than it must be", () => {
  assert.equal(dashOpacity("#222222"), 0.6);
  assert.ok(contrastOnWhite("#0072B2", dashOpacity("#0072B2") - 0.04) < 3.05);
  assert.equal(dashOpacity("#CC79A7"), 1, "Okabe-Ito purple is 3.06:1 at full strength, so no fading");
});
