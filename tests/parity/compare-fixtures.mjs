// CI: compare a freshly generated fixture directory with the committed one. Exit 1 on any cell that
// differs beyond tol, so a changed density in bmm is noticed; identical cells print nothing.
import fs from "node:fs";
import path from "node:path";
import { absentReason, parseFixture, closeError, relScale } from "./helpers.mjs";
const [committed, fresh, tolArg] = process.argv.slice(2);
const tol = +(tolArg ?? 1e-10);
let bad = 0;
// Every number a cell holds is compared (logd, probs, nodes, ...), except the evaluation points x. parseFixture()
// reads jsonlite's "-Inf", "Inf", "NaN" and "NA" as numbers, so they are compared too.
const values = cell => Object.entries(cell).filter(([k, v]) => k !== "args" && k !== "x" && typeof v !== "string")
  .flatMap(([, v]) => [v].flat());
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
  // 1e-8 at a log density of -100 pass.
  const scale = { "math.json": v => Math.max(2 ** -1022, Math.abs(v)), "sdt.json": relScale }[f] ?? (() => 1);
  a.cells.forEach((ca, i) => {
    const va = values(ca), vb = values(b.cells[i]);
    // the same non-finite value on both sides (-Inf, or NA from both bmm versions) agrees; closeError() fails any other
    const worst = va.length === vb.length
      ? Math.max(0, ...va.map((v, k) => Object.is(v, vb[k]) ? 0 : closeError(vb[k], v, scale(v))))
      : Infinity;
    if (!(worst <= tol)) { console.log(`${f} cell ${i} ${ca.fn}: max diff ${worst.toExponential(2)} (bmm ${a.bmm_version} vs ${b.bmm_version})`); bad++; }
  });
}
console.log(bad ? `${bad} differing cell(s) or missing file(s)` : `fixtures agree within ${tol}`);
process.exit(bad ? 1 : 0);
