// Controls shared by every page: coupled range + number inputs, parameter read/write, number formatting.

export const fmt = (v, digits = 2) => Number(v).toFixed(digits).replace("-", "−");

// Slider scales. LOG moves the slider in log units for parameters bmm estimates on the log scale; the
// number field keeps the natural value, rounded to what it shows, so the value used is the value seen.
export const LINEAR = { toRange: v => v, fromRange: r => r };
export const LOG = { toRange: Math.log, fromRange: r => +Math.exp(r).toPrecision(3) };

// A slider and a number field that mirror each other; onInput fires on either. `scale` can be
// swapped at run time (pair.scale = LOG) when a page changes parametrisation.
export function bindPair(rangeId, numberId, onInput, scale = LINEAR) {
  const range = document.getElementById(rangeId);
  const num = document.getElementById(numberId);
  const pair = {
    range, num, scale,
    get value() { return +num.value; },
    set value(v) { num.value = v; range.value = pair.scale.toRange(v); }
  };
  range.addEventListener("input", () => { num.value = pair.scale.fromRange(+range.value); onInput(); });
  num.addEventListener("input", () => { range.value = pair.scale.toRange(+num.value); onInput(); });
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
