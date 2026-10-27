// CI: compare a freshly generated fixture directory with the committed one. Exit 1 on any cell that
// differs beyond tol, so a changed density in bmm is noticed; identical cells print nothing, and a sample from
// bmm's r*() that differs but agrees in distribution prints a line without failing (below).
import fs from "node:fs";
import path from "node:path";
import { absentReason, parseFixture, closeError, relScale, sampleError, SAMPLE_LIMIT } from "./helpers.mjs";
const [committed, fresh, tolArg] = process.argv.slice(2);
const tol = +(tolArg ?? 1e-10);
let bad = 0, sampled = 0;
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
  // simulate.json's sample.mean and sample.se are statistics of n draws from bmm's r*(), so they depend on the
  // exact random stream the sampler consumes: rsdm switching to inversion, another batch size in
  // rejection_sampling or another grid in rimm would change them with the distribution unchanged. Beyond tol,
  // a fresh sample mean passes within 5 SE of the committed cell's expected value, by the one-sample rule of
  // simulate.test.mjs (helpers.mjs, sampleError(): the committed sample.se for mean_abs, mean_cos and mean_sin, the
  // binomial SE of the committed expected.within for within, and equality where 5 SE is below one draw), and a
  // moment's SE passes within 0.15 relative of the committed one (over 1000 other streams it moved by up to 8.7%, the
  // SE of mean_cos in the SDM cell c 7.39, kappa 5.75); such a cell prints an informational line, so a change in bmm's
  // sampler is reported, not absorbed. The expected statistics (integrate() over d*()) stay at tol. A sample's
  // sample.se.within is sqrt(m (1 - m) / (n - 1)) of its own mean m (sd() over 0/1 values), so it is checked against
  // that, to 1e-9 relative, not against the committed SE, which would repeat the mean check.
  const SAMPLE_REL = 0.15, WITHIN_REL = 1e-9;
  const sampleOk = (key, x, y, ca, cb) => {
    const m = /^sample\.(mean|se)\.(.+)$/.exec(key);
    if (f !== "simulate.json" || !m || y.length !== 1) return false;
    if (m[1] === "mean") return sampleError(ca, m[2], y[0]) === null;
    if (m[2] === "within") {
      const n = ca.n, mb = cb.sample.mean.within;
      return cb.n === n && closeError(y[0], Math.sqrt(mb * (1 - mb) / (n - 1)), Math.abs(y[0]) || 1) <= WITHIN_REL;
    }
    return closeError(y[0], x[0], Math.abs(x[0]) || 1) <= SAMPLE_REL;
  };
  // simulate_counts.json holds one sample of n trials from bmm's r*() per cell, as shares p with their SE. Any change
  // to the random stream bmm consumes (R's rbinom() or rmultinom(), a loop in bmm vectorised, another RNGkind) moves
  // p by multiples of 1/n while the distribution stays: p is compared as two samples, within 4 sqrt(2) SE of the
  // committed cell, and se, a function of p, must be sqrt(p (1 - p) / n) of the fresh cell's p. The probabilities
  // r*() samples from, n and the seeds are compared at tol. A cell whose shares differ beyond tol but within that
  // bound is reported on its own line and does not fail, as below.
  const counts = f === "simulate_counts.json";
  a.cells.forEach((ca, i) => {
    const cb = b.cells[i], va = values(ca), vb = values(cb);
    const keys = [...new Set([...va.keys(), ...vb.keys()])];
    const diffs = keys.map(key => {
      const x = va.get(key), y = vb.get(key);
      if (!x || !y) return [key, `only in the ${x ? "committed" : "fresh"} cell`];
      if (x.length !== y.length) return [key, `${x.length} vs ${y.length} values`];
      if (counts && /(^|\.)se$/.test(key)) {
        const p = vb.get(key.replace(/se$/, "p"));
        if (!p) return [key, "no p beside se"];
        const worst = Math.max(0, ...y.map((v, k) => closeError(v, Math.sqrt(p[k] * (1 - p[k]) / cb.n))));
        return [key, worst <= tol ? null : `not sqrt(p (1 - p) / n) of the fresh p, max diff ${worst.toExponential(2)}`];
      }
      // the same non-finite value on both sides (-Inf, or NA from both bmm versions) agrees; closeError() fails any other
      const worst = Math.max(0, ...x.map((v, k) => Object.is(v, y[k]) ? 0 : closeError(y[k], v, scale(key, v))));
      if (worst <= tol) return [key, null];
      if (sampleOk(key, x, y, ca, cb)) return [key, "sample"];
      if (counts && /(^|\.)p$/.test(key)) {
        const se = va.get(key.replace(/p$/, "se"));
        const z = Math.max(0, ...x.map((v, k) => (se[k] > 0 ? Math.abs(y[k] - v) / se[k] : Object.is(v, y[k]) ? 0 : Infinity)));
        return [key, z <= 4 * Math.SQRT2 ? "sample" : `max diff ${worst.toExponential(2)}, ${z.toFixed(2)} SE`];
      }
      const why = f === "simulate.json" && /^sample\.mean\./.test(key) && y.length === 1 ? ` (${sampleError(ca, key.slice(12), y[0])})` : "";
      return [key, `max diff ${worst.toExponential(2)}${why}`];
    }).filter(([, d]) => d !== null);
    const fails = diffs.filter(([, d]) => d !== "sample");
    if (fails.length) {
      console.log(`${f} cell ${i} ${ca.fn}: ${fails.map(([k, d]) => `${k} ${d}`).join("; ")} (bmm ${a.bmm_version} vs ${b.bmm_version})`);
      bad++;
    } else if (diffs.length) {
      sampled++;
      console.log(`${f} cell ${i} ${ca.fn}: bmm's ${counts ? "r*()" : `r${ca.fn}()`} draws a different stream; the sample agrees (`
        + (counts ? "shares within 4 sqrt(2) SE of the committed sample" : `means within ${SAMPLE_LIMIT} SE of the expected values, binomial for within; SEs within ${SAMPLE_REL}`)
        + `) (${diffs.map(([k]) => k).join(", ")}; bmm ${a.bmm_version} vs ${b.bmm_version})`);
    }
  });
}
console.log(bad ? `${bad} differing cell(s) or missing file(s)`
  : `fixtures agree within ${tol}` + (sampled ? `, except ${sampled} r*() sample(s) that agree in distribution` : ""));
process.exit(bad ? 1 : 0);
