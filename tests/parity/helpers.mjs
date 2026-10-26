import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const dir = process.env.BMM_FIXTURES ?? path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
// A fixture without cells would let its tests pass without running one.
export function loadFixture(name) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));
  if (!Array.isArray(fx.cells) || fx.cells.length === 0) throw new Error(`${name}.json holds no cells`);
  return fx;
}

// Fixtures that need a bmm function newer than the oldest bmm the script runs on, with the bmm version
// that ships it. Only these may be absent, and only when an older bmm wrote the directory.
export const SINCE = { nodes: "1.4.1", mpt: "1.4.1", sdt: "1.4.1" };
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
  const v = JSON.parse(fs.readFileSync(path.join(fixtureDir, "circular.json"), "utf8")).bmm_version;
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

export function assertClose(got, ref, tol, label) {
  assert.equal(got.length, ref.length, `${label}: length`);
  let worst = 0;
  got.forEach((g, i) => { worst = Math.max(worst, Math.abs(g - ref[i])); });
  assert.ok(worst <= tol, `${label}: max abs error ${worst.toExponential(2)} > ${tol}`);
  return worst;
}

// The same, relative to |ref| where |ref| > 1: log probabilities in a far tail reach -1e12, where an absolute
// tolerance is below one unit in the last place. Where |ref| <= 1 it is the absolute tolerance above.
export function assertCloseRel(got, ref, tol, label) {
  assert.equal(got.length, ref.length, `${label}: length`);
  let worst = 0;
  got.forEach((g, i) => { worst = Math.max(worst, Math.abs(g - ref[i]) / Math.max(1, Math.abs(ref[i]))); });
  assert.ok(worst <= tol, `${label}: max error ${worst.toExponential(2)} > ${tol} (relative beyond 1)`);
  return worst;
}
