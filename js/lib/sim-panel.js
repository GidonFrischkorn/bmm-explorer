// The "simulate" switch in a page's prediction panel: whether it is on, how many trials, and the uniforms of the
// current sample. The uniforms stay until New sample, so a slider move reshapes the same sample; a larger n
// keeps the first draws and adds to them. Markup ids: <prefix>-sim (checkbox), -sim-n (select), -sim-new
// (button), -sim-text (the summary line).
import { uniforms } from "./random.js";
import { circularSim, circularStats, histogram } from "./simulate.js";
import { fmt } from "./widget.js";
import { DEG } from "./circular-plot.js";

const MAX_N = 1000, SEED = 437, BINS = 36;

export function simControls(prefix, redraw) {
  const $ = id => document.getElementById(`${prefix}-${id}`);
  const box = $("sim"), size = $("sim-n"), again = $("sim-new"), text = $("sim-text");
  const start = [...size.options].find(o => o.defaultSelected).value;
  let seed = SEED, us = uniforms(MAX_N, seed);
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
    reset() { box.checked = false; size.value = start; us = uniforms(MAX_N, seed = SEED); sync(); },
    text
  };
}

const deg = v => (Number.isFinite(v) ? `${fmt(v * DEG, 0)}°` : "∞");

// For a page with the switch on: the histogram heights for circularPlot's bars, and the summary line filled in.
// Off: no bars, and the line is hidden.
export function circularSimulation(sim, logd, window) {
  sim.text.hidden = !sim.on;
  if (!sim.on) return undefined;
  const model = circularSim(logd, window), draws = model.draw(sim.us), got = circularStats(draws, window);
  const e = model.expected;
  sim.text.textContent = `Expected (this sample of ${sim.n}): mean |error| ${deg(e.meanAbs)} (${deg(got.meanAbs)}), ` +
    `circular SD ${deg(e.circSd)} (${deg(got.circSd)}), within ±${deg(window)} ${fmt(e.within)} (${fmt(got.within)}).`;
  return histogram(draws, -Math.PI, Math.PI, BINS);
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
