// dashOpacity (js/lib/plot.js): a dashed reference curve keeps 3:1 against white, and is as faint as that allows; linePlot
// draws its dashed series with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dashOpacity, linePlot, SERIES } from "../../js/lib/plot.js";
import { stubDom } from "./dom-stub.mjs";

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

test("linePlot draws a dashed series at dashOpacity of its colour, and a solid one at full strength", () => {
  const svg = stubDom()("t");
  const x = [0, 1], y = [0, 1];
  linePlot(svg, { W: 100, H: 100, margin: { l: 10, r: 10, t: 10, b: 10 }, xlim: [0, 1], ylim: [0, 1], xticks: [], yticks: [],
    series: [{ x, y, color: "#0072B2", dashed: true }, { x, y, color: "#D55E00", dashed: true }, { x, y, dashed: true }, { x, y, color: "#0072B2" }] });
  const paths = svg.findAll(e => e.getAttribute("class") === "series");
  assert.equal(paths.length, 4);
  assert.equal(+paths[0].getAttribute("stroke-opacity"), dashOpacity("#0072B2"));
  assert.equal(+paths[1].getAttribute("stroke-opacity"), dashOpacity("#D55E00"));
  assert.equal(+paths[2].getAttribute("stroke-opacity"), dashOpacity(SERIES[2]), "a series without a colour takes its default one");
  assert.ok(paths[0].getAttribute("stroke-dasharray"));
  assert.equal(paths[3].getAttribute("stroke-opacity"), null);
});
