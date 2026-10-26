// CI: compare a freshly generated fixture directory with the committed one. Exit 1 on any cell that
// differs beyond tol, so a changed density in bmm is noticed; identical cells print nothing.
import fs from "node:fs";
import path from "node:path";
import { absentReason } from "./helpers.mjs";
const [committed, fresh, tolArg] = process.argv.slice(2);
const tol = +(tolArg ?? 1e-10);
let bad = 0;
// Every number a cell holds is compared (logd, probs, nodes, ...), except its args and the evaluation points
// x, including numbers inside objects (the EZ moments are an object of arrays).
const numbers = v => (v !== null && typeof v === "object" ? Object.values(v).flatMap(numbers) : typeof v === "string" ? [] : [v]);
const values = cell => Object.entries(cell).filter(([k]) => k !== "args" && k !== "x").flatMap(([, v]) => numbers(v));
for (const f of fs.readdirSync(committed).filter(n => n.endsWith(".json"))) {
  // R/make_fixtures.R writes no file for a density an older bmm lacks (mpt.json before dmpt()); any other
  // missing file is a failure, as in the parity tests.
  if (!fs.existsSync(path.join(fresh, f))) {
    const err = absentReason(fresh, path.basename(f, ".json"));
    console.log(err ?? `${f}: not written by this older bmm, skipped`);
    if (err) bad++;
    continue;
  }
  const a = JSON.parse(fs.readFileSync(path.join(committed, f))), b = JSON.parse(fs.readFileSync(path.join(fresh, f)));
  if (a.cells.length !== b.cells.length) { console.log(`${f}: ${a.cells.length} vs ${b.cells.length} cells`); bad++; continue; }
  // math.json holds log Phi down to -5e9, where tol is far below one unit in the last place and another libm
  // would differ: there the difference is relative to the value, as in math.test.mjs.
  a.cells.forEach((ca, i) => {
    const va = values(ca), vb = values(b.cells[i]);
    const worst = va.length === vb.length
      ? Math.max(...va.map((v, k) => Math.abs(v - vb[k]) / (f === "math.json" ? Math.max(2 ** -1022, Math.abs(v)) : 1)))
      : Infinity;
    if (!(worst <= tol)) { console.log(`${f} cell ${i} ${ca.fn}: max diff ${worst.toExponential(2)} (bmm ${a.bmm_version} vs ${b.bmm_version})`); bad++; }
  });
}
console.log(bad ? `${bad} differing cell(s) or missing file(s)` : `fixtures agree within ${tol}`);
process.exit(bad ? 1 : 0);
