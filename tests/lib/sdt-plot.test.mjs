// The draggable boundary lines of latentPlot (js/lib/sdt-plot.js) as sliders: the value a reader hears, its limits,
// and the focus kept across a redraw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDom } from "./dom-stub.mjs";
import { latentPlot } from "../../js/lib/sdt-plot.js";

const svgOf = stubDom();
const draw = (svg, lines) => latentPlot(svg, { xlim: [-7.5, 9.5], xticks: [0], curves: [{ f: () => 0.3, color: "#0072B2" }], lines });
const bands = svg => svg.findAll(e => e.getAttribute("role") === "slider");

test("a line's value is rounded to what the page prints, with limits and a value text", () => {
  const svg = svgOf("latent");
  draw(svg, [{ x: 0.6499999999999999, drag: true, aria: "criterion" }]);
  const [b] = bands(svg);
  assert.equal(b.getAttribute("aria-label"), "criterion");
  assert.equal(b.getAttribute("aria-valuenow"), "0.65");
  assert.equal(b.getAttribute("aria-valuetext"), "0.65");
  assert.equal(b.getAttribute("aria-valuemin"), "-7.5", "without given limits, the x axis");
  assert.equal(b.getAttribute("aria-valuemax"), "9.5");
});

test("a line that sets another value (bias) reports that value and the limits the page enforces", () => {
  const svg = svgOf("latent");
  draw(svg, [{ x: 1.15, drag: true, aria: "bias", value: 0.65, min: -4.5, max: 4.5 }, { x: 0.5, label: "midpoint" }]);
  const b = bands(svg);
  assert.equal(b.length, 1, "a line without drag is no slider");
  assert.deepEqual(["aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-valuetext"].map(k => b[0].getAttribute(k)),
    ["0.65", "-4.5", "4.5", "0.65"]);
});

test("the focused line keeps the focus when the plot is redrawn", () => {
  const svg = svgOf("latent");
  const lines = x => [{ x: -1, drag: true, aria: "threshold 1" }, { x, drag: true, aria: "threshold 2" }];
  draw(svg, lines(1));
  bands(svg)[1].focus();
  draw(svg, lines(1.05));
  assert.equal(document.activeElement.getAttribute("aria-label"), "threshold 2");
  assert.equal(document.activeElement.getAttribute("aria-valuenow"), "1.05");
});
