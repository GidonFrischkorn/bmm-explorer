// The "simulate" switch in a page's prediction panel: whether it is on, how many trials, and the uniforms of the
// current sample. The uniforms stay until New sample, so a slider move reshapes the same sample; a larger n
// keeps the first draws and adds to them. Markup ids: <prefix>-sim (checkbox), -sim-n (select), -sim-new
// (button), -sim-text (the summary line).
import { uniforms, SIM_SEED } from "./random.js";
import { circularSim, circularStats, histogram } from "./simulate.js";
import { fmt } from "./widget.js";
import { el, clipped } from "./plot.js";
import { DEG } from "./circular-plot.js";

const MAX_N = 1000, BINS = 36;

export function simControls(prefix, redraw) {
  const $ = id => document.getElementById(`${prefix}-${id}`);
  const box = $("sim"), size = $("sim-n"), again = $("sim-new"), text = $("sim-text");
  const start = [...size.options].find(o => o.defaultSelected).value;
  let seed = SIM_SEED, us = uniforms(MAX_N, seed);
  const sync = () => { size.disabled = again.disabled = !box.checked; };
  // The line hides here too: a page with invalid inputs does not redraw, and the line would stay.
  box.addEventListener("change", () => { sync(); text.hidden = !box.checked; redraw(); });
  size.addEventListener("change", redraw);
  again.addEventListener("click", () => { us = uniforms(MAX_N, ++seed); redraw(); });
  sync();
  return {
    get on() { return box.checked; },
    get n() { return +size.value; },
    get us() { return us.slice(0, +size.value); },
    reset() { box.checked = false; size.value = start; us = uniforms(MAX_N, seed = SIM_SEED); sync(); },
    text
  };
}

const deg = v => `${fmt(v * DEG, 0)}°`;
// Circular SD from the mean resultant length R. Below R = 0.05 (above 140°) only the bound is printed, so a nearly
// flat density does not show a large number that means little (492° for a uniform one, R = 1e-16 from the grid's
// round-off); below 1e-9 the density has no mean direction. The cap does not hide the small-sample bias: a uniform
// sample's R has a median of 0.118 at n 50, 0.084 at 100 and 0.059 at 200 (mean sqrt(pi / (4 n))), so it is capped
// in 12%, 22% and 39% of samples and otherwise shows a finite SD below the expected one; at n 500 and 1000 it is
// capped in 72% and 92% (20000 samples through this sampler). The (i) note explains the bias.
const sdText = st => {
  const R = Math.hypot(st.meanCos, st.meanSin);
  return R < 1e-9 ? "unbounded (R = 0)" : R < 0.05 ? "> 140°" : deg(st.circSd);
};

// For a page with the switch on: the histogram heights for circularPlot's bars, and the summary line filled in.
// Off: no bars, and the line is hidden.
export function circularSimulation(sim, logd, window) {
  sim.text.hidden = !sim.on;
  if (!sim.on) return undefined;
  const model = circularSim(logd, window), draws = model.draw(sim.us), got = circularStats(draws, window);
  const e = model.expected;
  sim.text.textContent = `Expected vs this sample of ${sim.n}: mean |error| ${deg(e.meanAbs)} vs ${deg(got.meanAbs)}, ` +
    `circular SD ${sdText(e)} vs ${sdText(got)}, within ±${deg(window)} ${fmt(e.within)} vs ${fmt(got.within)}.`;
  return histogram(draws, BINS);
}

// R lines that draw the same kind of sample with bmm and print the three statistics; call is the r*() call
// with n left as the variable, e.g. "rmixture2p(n, mu = 0, kappa = 5, p_mem = 0.6)"; window in radians.
export function simCode(n, call, window) {
  const w = Math.round(window * DEG);
  return `
# simulate ${n} trials and summarise their response errors (radians): mean |error|, circular SD, within +-${w} deg
n <- ${n}
y <- ${call}
c(mean_abs = mean(abs(y)), circ_sd = sqrt(-2 * log(Mod(mean(exp(1i * y))))), within_${w} = mean(abs(y) <= ${w} * pi / 180))`;
}

// "expected (sample)" for a share, as the summary lines print it.
export const pair = (e, got) => `${fmt(e)} (${fmt(got)})`;

// The sample's share on each predicted bar: a dark line across the bar with a white halo, so it reads over any
// fill. rects and sy come from barPlot; shares in the bars' order.
export function markBars(svg, rects, sy, shares) {
  rects.forEach((r, i) => {
    const x = +r.getAttribute("x"), w = +r.getAttribute("width"), y = sy(shares[i]);
    for (const [stroke, width] of [["#fff", 7], ["#000", 3]])
      el("line", { x1: x - 3, x2: x + w + 3, y1: y, y2: y, stroke, "stroke-width": width, class: "sim-mark", ...clipped(svg) }, svg);
  });
}

// The summary line: hidden when the switch is off, else text() (only computed then).
export function simLine(sim, text) {
  sim.text.hidden = !sim.on;
  if (sim.on) sim.text.textContent = text();
}

// The summary line of a categorical sample: each category's expected share and, in brackets, the sample's.
export const shareLine = (sim, labels, expected, shares) =>
  simLine(sim, () => `Expected (this sample of ${sim.n}): ${labels.map((l, i) => `${l} ${pair(expected[i], shares[i])}`).join(", ")}.`);
