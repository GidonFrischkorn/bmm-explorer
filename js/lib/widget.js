// Controls shared by every page: coupled range + number inputs, parameter read/write, number formatting.

export const fmt = (v, digits = 2) => Number(v).toFixed(digits).replace("-", "−");

// Slider scales. LOG moves the slider in log units for parameters bmm estimates on the log scale; the
// number field keeps the natural value, rounded to what it shows, so the value used is the value seen.
export const LINEAR = { toRange: v => v, fromRange: r => r };
export const LOG = { toRange: Math.log, fromRange: r => +Math.exp(r).toPrecision(3) };
// LOGIT does the same for probabilities bmm estimates on the logit scale (f, MPT parameters).
export const LOGIT = { toRange: v => Math.log(v / (1 - v)), fromRange: r => +(1 / (1 + Math.exp(-r))).toPrecision(3) };

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
  };
  const pair = {
    range, num, scale,
    // An empty box is no value, not 0 (+"" === 0).
    get value() { return num.value === "" ? NaN : +num.value; },
    set value(v) { num.value = v; range.value = pair.scale.toRange(v); },
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
  range.addEventListener("input", () => { num.value = pair.scale.fromRange(+range.value); onInput(); });
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
