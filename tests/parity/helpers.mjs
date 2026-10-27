import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const dir = process.env.BMM_FIXTURES ?? path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
// jsonlite writes a non-finite double as a string ("-Inf", "Inf", "NaN", and "NA" for R's NA), even inside a
// numeric array; read back as numbers, a -Inf from bmm is compared rather than turned into NaN by subtraction.
const NONFINITE = { "Inf": Infinity, "-Inf": -Infinity, "NaN": NaN, "NA": NaN };
export const parseFixture = text => JSON.parse(text, (k, v) => typeof v === "string" && v in NONFINITE ? NONFINITE[v] : v);
// A fixture without cells would let its tests pass without running one.
export function loadFixture(name) {
  const fx = parseFixture(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));
  if (!Array.isArray(fx.cells) || fx.cells.length === 0) throw new Error(`${name}.json holds no cells`);
  return fx;
}

// Fixtures that need a bmm function newer than the oldest bmm the script runs on, with the bmm version
// that ships it. Only these may be absent, and only when an older bmm wrote the directory.
export const SINCE = { nodes: "1.4.1", mpt: "1.4.1", sdt: "1.4.1", rt: "1.4.1" };
// Version strings compared numerically per component, so "1.4.1.9000" (develop) counts as >= "1.4.1". A
// version that is not dotted integers throws: read as older, it would turn a missing fixture into a skip.
const versionParts = v => {
  if (!/^\d+(\.\d+)*$/.test(v)) throw new Error(`bmm version "${v}" is not of the form 1.4.1`);
  return v.split(".").map(Number);
};
export function versionAtLeast(v, min) {
  const a = versionParts(v), b = versionParts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}
// Why a fixture file is absent from a directory: null if an older bmm legitimately wrote none, else the
// error to report. circular.json is written by every bmm, so it carries the directory's bmm version.
export function absentReason(fixtureDir, name) {
  const v = parseFixture(fs.readFileSync(path.join(fixtureDir, "circular.json"), "utf8")).bmm_version;
  return SINCE[name] && !versionAtLeast(v, SINCE[name]) ? null
    : `${name}.json is missing, although bmm ${v} wrote these fixtures` + (SINCE[name] ? ` (bmm writes it from ${SINCE[name]} on)` : "");
}
// null (the test skips) when an older bmm wrote no such fixture; a missing file from a newer bmm throws, so a
// lost density fails instead of passing as a skip.
export function loadFixtureSince(name) {
  if (fs.existsSync(path.join(dir, name + ".json"))) return loadFixture(name);
  const err = absentReason(dir, name);
  if (err) throw new Error(err);
  return null;
}

// |got - ref| / scale. Equal infinities agree (0); an infinity against a finite value, or a NaN on either side, is
// an infinite error, so it fails every tolerance.
export function closeError(g, r, scale = 1) {
  if (g === r) return 0;
  const e = Math.abs(g - r) / scale;
  return Number.isNaN(e) ? Infinity : e;
}

export function assertClose(got, ref, tol, label) {
  assert.equal(got.length, ref.length, `${label}: length`);
  const worst = Math.max(0, ...got.map((g, i) => closeError(g, ref[i])));
  assert.ok(worst <= tol, `${label}: max abs error ${worst.toExponential(2)} > ${tol}`);
  return worst;
}

// The same up to |ref| = REL_FLOOR, and beyond it relative: the error is divided by |ref| / REL_FLOOR, so tol 1e-10
// allows 1e-10 absolute up to 1e3 and 1e-13 relative above. Log probabilities in the Gumbel tails reach -7.5e177,
// where an absolute tolerance is below one unit in the last place. Against sdt.json the SDT port is within 2.3e-13
// absolute up to |ref| 1e3 and 2.2e-16 relative above it, so both sides keep a margin of a few hundred.
export const REL_FLOOR = 1e3;
export const relScale = r => Math.max(1, Math.abs(r) / REL_FLOOR);
export function assertCloseRel(got, ref, tol, label) {
  assert.equal(got.length, ref.length, `${label}: length`);
  const worst = Math.max(0, ...got.map((g, i) => closeError(g, ref[i], relScale(ref[i]))));
  assert.ok(worst <= tol, `${label}: max error ${worst.toExponential(2)} > ${tol} (absolute, per ${REL_FLOOR} of |ref| beyond)`);
  return worst;
}

// A statistic r of a simulate.json cell's n draws (from bmm's r*() or the explorer's sampler) against the cell's
// exact expected value, integrate() over bmm's d*(): null within SAMPLE_LIMIT SE, else the reason. One sample against
// a fixed value, so no second sample's error eats into the limit. The SE of mean_abs, mean_cos and mean_sin is the
// cell's sample.se (bmm's sample of the same n from the same distribution); a moment whose sample.se is exactly 0
// has to equal bmm's sample.mean. within is a share of n 0/1 draws: its SE is the binomial sqrt(E (1 - E) / n) of
// E = expected.within clamped to [0, 1] (integrate() puts it 2e-12 above 1 at sdm c 15), not the sample's own, which
// at mixture2p kappa 148, p_mem 1 (E n = 2.4 draws outside +-20 deg) rests on one or two draws. Where the limit is
// below one draw, SAMPLE_LIMIT SE < 1 / n, i.e. n E (1 - E) < 1 / SAMPLE_LIMIT^2 = 0.04, the share has to be round(E),
// 0 or 1: mixture3p with p_nt 1 (E 4.3e-126) and the SDM cells with kappa 50 (1 - E = 3.0e-14 at c 20, E clamped to 1
// at c 15). A draw on the other side has probability about n E (1 - E) there, below 3.1e-9 in these cells.
export const SAMPLE_LIMIT = 5;
export function sampleError(cell, r, value) {
  const n = cell.n, E = Math.min(1, Math.max(0, cell.expected.within));
  const se = r === "within" ? Math.sqrt(E * (1 - E) / n) : cell.sample.se[r];
  if (r === "within" && SAMPLE_LIMIT * se < 1 / n) {
    return value === Math.round(E) ? null : `within ${value}, expected ${cell.expected.within}: ${SAMPLE_LIMIT} SE is below one draw, so it must be ${Math.round(E)}`;
  }
  if (r !== "within" && se === 0) {
    return Object.is(value, cell.sample.mean[r]) ? null : `${r} ${value}, bmm's sample ${cell.sample.mean[r]} with SE 0`;
  }
  const z = (value - cell.expected[r]) / se;
  return Math.abs(z) <= SAMPLE_LIMIT ? null : `${r} ${value}, expected ${cell.expected[r]}, ${Number.isNaN(z) ? "NaN" : z.toFixed(2)} SE apart`;
}
