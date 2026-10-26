// CI: compare a freshly generated fixture directory with the committed one. Exit 1 on any cell that
// differs beyond tol, so a changed density in bmm is noticed; identical cells print nothing.
import fs from "node:fs";
import path from "node:path";
const [committed, fresh, tolArg] = process.argv.slice(2);
const tol = +(tolArg ?? 1e-10);
let bad = 0;
// Every number a cell holds is compared (logd, probs, nodes, ...), except the evaluation points x.
const values = cell => Object.entries(cell).filter(([k, v]) => k !== "args" && k !== "x" && typeof v !== "string")
  .flatMap(([, v]) => [v].flat());
for (const f of fs.readdirSync(committed).filter(n => n.endsWith(".json"))) {
  // R/make_fixtures.R writes no file for a density the installed bmm lacks (mpt.json without dmpt()); the
  // parity tests skip it as well.
  if (!fs.existsSync(path.join(fresh, f))) { console.log(`${f}: not written by this bmm, skipped`); continue; }
  const a = JSON.parse(fs.readFileSync(path.join(committed, f))), b = JSON.parse(fs.readFileSync(path.join(fresh, f)));
  if (a.cells.length !== b.cells.length) { console.log(`${f}: ${a.cells.length} vs ${b.cells.length} cells`); bad++; continue; }
  a.cells.forEach((ca, i) => {
    const va = values(ca), vb = values(b.cells[i]);
    const worst = va.length === vb.length ? Math.max(...va.map((v, k) => Math.abs(v - vb[k]))) : Infinity;
    if (!(worst <= tol)) { console.log(`${f} cell ${i} ${ca.fn}: max abs diff ${worst.toExponential(2)} (bmm ${a.bmm_version} vs ${b.bmm_version})`); bad++; }
  });
}
console.log(bad ? `${bad} differing cell(s)` : `fixtures agree within ${tol}`);
process.exit(bad ? 1 : 0);
