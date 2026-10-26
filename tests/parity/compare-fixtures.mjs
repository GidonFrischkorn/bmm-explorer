// CI: compare a freshly generated fixture directory with the committed one. Exit 1 on any cell that
// differs beyond tol, so a changed density in bmm is noticed; identical cells print nothing.
import fs from "node:fs";
import path from "node:path";
import { absentReason, parseFixture, closeError, relScale } from "./helpers.mjs";
const [committed, fresh, tolArg] = process.argv.slice(2);
const tol = +(tolArg ?? 1e-10);
let bad = 0;
// Every number a cell holds is compared (logd, probs, nodes, ...), except its args and the evaluation points
// x, key by key: a point that moves from logd to zero_x changes the length of both keys, which a single list
// of the cell's numbers would notice only through shifted positions. Objects are walked to their arrays (the
// EZ moments are an object of arrays, compared per moment). parseFixture() reads jsonlite's "-Inf", "Inf",
// "NaN" and "NA" as numbers, so they are compared too.
const numbers = v => (v !== null && typeof v === "object" ? Object.values(v).flatMap(numbers) : typeof v === "string" ? [] : [v]);
const leaves = (v, key) => v !== null && typeof v === "object" && !Array.isArray(v)
  ? Object.entries(v).flatMap(([k, w]) => leaves(w, `${key}.${k}`)) : [[key, numbers(v)]];
const values = cell => new Map(Object.entries(cell).filter(([k]) => k !== "args" && k !== "x").flatMap(([k, v]) => leaves(v, k)));
for (const f of fs.readdirSync(committed).filter(n => n.endsWith(".json"))) {
  // R/make_fixtures.R writes no file for a density an older bmm lacks (mpt.json before dmpt()); any other
  // missing file is a failure, as in the parity tests.
  if (!fs.existsSync(path.join(fresh, f))) {
    const err = absentReason(fresh, path.basename(f, ".json"));
    console.log(err ?? `${f}: not written by this older bmm, skipped`);
    if (err) bad++;
    continue;
  }
  const a = parseFixture(fs.readFileSync(path.join(committed, f), "utf8")), b = parseFixture(fs.readFileSync(path.join(fresh, f), "utf8"));
  if (a.cells.length !== b.cells.length) { console.log(`${f}: ${a.cells.length} vs ${b.cells.length} cells`); bad++; continue; }
  // math.json holds log Phi down to -5e9 and sdt.json log probabilities down to -7.5e177, where tol is far below one
  // unit in the last place and another libm would differ: there the difference is relative to the value, as in
  // math.test.mjs and sdt.test.mjs. sdt.json is scaled as assertCloseRel() scales it, absolute up to |value| 1e3 and
  // relative per 1e3 beyond: up to 1e3, 1e-10 is about 900 units in the last place, room for a libm that rounds exp()
  // or log() differently, and beyond, 1e-13 relative is about 450; a relative scale from 1 on would let a change of
  // 1e-8 at a log density of -100 pass. The EZ cumulants in rt.json (moments.k3, k4 and their _upper/_lower parts)
  // reach 2e4 at bound 4.48, s 0.7, drift -0.1, where one unit in the last place of sinh() between two libms (macOS
  // R vs glibc on the CI runner) moves k4 by 4e-8: they are compared relative to |committed value| (absolute where
  // it is 0), as in rt.test.mjs; every other rt.json value stays absolute.
  const scale = (key, v) => f === "math.json" ? Math.max(2 ** -1022, Math.abs(v)) : f === "sdt.json" ? relScale(v)
    : f === "rt.json" && /(^|\.)k[34](_|$)/.test(key) && v !== 0 ? Math.abs(v) : 1;
  a.cells.forEach((ca, i) => {
    const va = values(ca), vb = values(b.cells[i]);
    const keys = [...new Set([...va.keys(), ...vb.keys()])];
    const diffs = keys.map(key => {
      const x = va.get(key), y = vb.get(key);
      if (!x || !y) return [key, `only in the ${x ? "committed" : "fresh"} cell`];
      if (x.length !== y.length) return [key, `${x.length} vs ${y.length} values`];
      // the same non-finite value on both sides (-Inf, or NA from both bmm versions) agrees; closeError() fails any other
      const worst = Math.max(0, ...x.map((v, k) => Object.is(v, y[k]) ? 0 : closeError(y[k], v, scale(key, v))));
      return [key, worst <= tol ? null : `max diff ${worst.toExponential(2)}`];
    }).filter(([, d]) => d !== null);
    if (diffs.length) {
      console.log(`${f} cell ${i} ${ca.fn}: ${diffs.map(([k, d]) => `${k} ${d}`).join("; ")} (bmm ${a.bmm_version} vs ${b.bmm_version})`);
      bad++;
    }
  });
}
console.log(bad ? `${bad} differing cell(s) or missing file(s)` : `fixtures agree within ${tol}`);
process.exit(bad ? 1 : 0);
