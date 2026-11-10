// Controls shared by every page: coupled range + number inputs, parameter read/write, number formatting.
import { link, invlink } from "./links.js";

export const fmt = (v, digits = 2) => Number(v).toFixed(digits).replace("-", "−");

// A parameter value as printed in a page's R call: 3 significant digits, plain ASCII. A probability (zr)
// typed just below 1 would print as 1, which bmm rejects or scores as -Inf, so it takes as many more digits
// as keep it strictly inside (0, 1); a double needs at most 17.
export function rValue(x, prob = false) {
  for (let digits = 3; ; digits++) {
    const y = +x.toPrecision(digits);
    if (!prob || (y > 0 && y < 1) || digits >= 17) return y;
  }
}

// Slider scales. scaleOf(link) moves the slider in the units of one of bmm's links (js/lib/links.js), the scale
// bmm estimates the parameter on; the number field keeps the natural value, rounded to the 3 significant digits it
// shows, so the value used is the value seen. An angle (tan_half) stays on a linear slider: in tan_half units
// the slider would crowd -pi and pi into its ends.
export function scaleOf(name) {
  if (name === "tan_half") throw new Error("scaleOf: an angle (tan_half) takes a linear slider");
  link(name, 0.5); // throws for a name that is not one of bmm's links
  return { toRange: v => link(name, v), fromRange: r => +invlink(name, r).toPrecision(3) };
}
export const LINEAR = { toRange: v => v, fromRange: r => r };
// LOG for parameters bmm estimates on the log scale, LOGIT for probabilities on the logit scale (f, MPT parameters).
export const LOG = scaleOf("log");
export const LOGIT = scaleOf("logit");

// A slider and a number field that mirror each other; onInput fires on either. setBounds changes the
// limits (and the scale, when a page changes parametrisation) of both inputs together.
export function bindPair(rangeId, numberId, onInput, scale = LINEAR) {
  const range = document.getElementById(rangeId);
  const num = document.getElementById(numberId);
  // The slider follows the box only to a value it can show: an empty box, or a value <= 0 on the log
  // scale, would set it to NaN or -Infinity. The box keeps what was typed so the page can flag it.
  const follow = () => {
    const r = pair.scale.toRange(pair.value);
    if (Number.isFinite(r)) range.value = r;
    speak();
  };
  // A screen reader speaks a slider's own value, which on a log or logit slider is not the parameter: it gets the
  // box's number. The label already names the parameter.
  const speak = () => range.setAttribute("aria-valuetext", num.value === "" ? "no value" : num.value);
  const pair = {
    range, num, scale,
    // An empty box is no value, not 0 (+"" === 0).
    get value() { return num.value === "" ? NaN : +num.value; },
    set value(v) { num.value = v; range.value = pair.scale.toRange(v); speak(); },
    // min, max and step on the slider's scale; the box gets the same limits in natural units.
    setBounds({ min, max, step, scale: sc } = {}) {
      if (sc) pair.scale = sc;
      if (min !== undefined) { range.min = min; num.min = pair.scale.fromRange(min); }
      if (max !== undefined) { range.max = max; num.max = pair.scale.fromRange(max); }
      if (step !== undefined) { range.step = step; num.step = pair.scale === LINEAR ? step : "any"; }
      // The slider clamped its value to the old limits; the box holds the value in use.
      follow();
    }
  };
  range.addEventListener("input", () => { num.value = pair.scale.fromRange(+range.value); speak(); onInput(); });
  num.addEventListener("input", () => { follow(); onInput(); });
  return pair;
}

// ids: { paramName: [rangeId, numberId] } -> { paramName: pair }
export function bindParams(ids, onInput) {
  return Object.fromEntries(Object.entries(ids).map(([k, [r, n]]) => [k, bindPair(r, n, onInput)]));
}

export const readParams = pairs => Object.fromEntries(Object.entries(pairs).map(([k, p]) => [k, p.value]));

export function setParams(pairs, values) {
  for (const k in values) if (pairs[k]) pairs[k].value = values[k];
}

export const allFinite = obj => Object.values(obj).every(Number.isFinite);
