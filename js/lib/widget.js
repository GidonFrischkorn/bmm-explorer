// Controls shared by every page: coupled range + number inputs, parameter read/write, number formatting.

export const fmt = (v, digits = 2) => Number(v).toFixed(digits).replace("-", "−");

// A slider and a number field that mirror each other; onInput fires on either.
export function bindPair(rangeId, numberId, onInput) {
  const range = document.getElementById(rangeId);
  const num = document.getElementById(numberId);
  range.addEventListener("input", () => { num.value = range.value; onInput(); });
  num.addEventListener("input", () => { range.value = num.value; onInput(); });
  return { range, num, get value() { return +num.value; }, set value(v) { range.value = num.value = v; } };
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
