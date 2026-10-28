// axe-core on every rendered page, in every state listed in states.json, in headless Chrome.
//   node tests/a11y/run-axe.mjs [--site _site] [--page m3] [--out report.json]
// Fails (exit 1) on a serious or critical violation, on a rendered page that states.json does not list, on a
// state step that finds nothing to act on, and on a script error. Moderate and minor violations and axe's
// "incomplete" results are printed, not failed on. axe.min.js comes from fetch-axe.mjs, checked against its pin.
import fs from "node:fs";
import path from "node:path";
import { serve, launch } from "./browser.mjs";
import { verifyAxe } from "./fetch-axe.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const siteDir = path.resolve(arg("site", "_site")), only = arg("page"), outFile = arg("out");
const spec = JSON.parse(fs.readFileSync(path.join(here, "states.json"), "utf8"));
const axeSource = fs.readFileSync(verifyAxe(), "utf8");
const FAIL = new Set(["serious", "critical"]);

// A page that exists in the render but not in states.json would go unchecked.
const rendered = ["index", "about", ...fs.readdirSync(path.join(siteDir, "models")).filter(f => f.endsWith(".html")).map(f => `models/${f.slice(0, -5)}`)];
const unlisted = rendered.filter(p => !(p in spec.pages));
if (unlisted.length) { console.error(`::error::pages without an entry in tests/a11y/states.json: ${unlisted.join(", ")}`); process.exit(1); }

// One step of a state, run in the page. Each throws when its target is missing, so a renamed id fails the run
// instead of silently checking the default state.
const STEP = `(step) => {
  const need = sel => document.querySelector(sel) ?? (() => { throw new Error("no element for " + sel); })();
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  if (step.click) need(step.click).click();
  else if (step.note) need('button.ex-info[aria-controls="' + step.note + '"]').click();
  else if (step.range) { const e = need(step.range[0]); e.value = step.range[1]; fire(e, "input"); }
  else if (step.number) { const e = need(step.number[0]); e.value = step.number[1]; fire(e, "input"); }
  else if (step.select) { const e = need(step.select[0]); e.value = step.select[1]; fire(e, "change"); }
  else throw new Error("unknown step " + JSON.stringify(step));
}`;

const site = await serve(siteDir);
const { page, close } = await launch();
const report = [];
let failed = 0;
try {
  const [w, h] = spec.viewport;
  // Reduced motion: the axis jumps, so a state is settled as soon as its steps are done.
  await page.viewport(w, h, { reducedMotion: true });
  for (const [name, entry] of Object.entries(spec.pages)) {
    if (only && name !== only && !name.endsWith(`/${only}`)) continue;
    if (!rendered.includes(name)) { console.error(`::error::states.json lists ${name}, which was not rendered`); failed++; continue; }
    for (const state of [{ name: "default", steps: [] }, ...(entry.states ?? [])]) {
      page.logs.length = 0;
      await page.goto(`${site.url}/${name}.html`);
      for (const step of state.steps) {
        try { await page.eval(`(${STEP})(${JSON.stringify(step)})`); }
        catch (e) { console.error(`::error::${name} [${state.name}] step ${JSON.stringify(step)}: ${e.message}`); failed++; }
        await page.sleep(60);
      }
      await page.sleep(250);
      const res = await page.eval(`(async () => { ${axeSource}
        const r = await axe.run(document, { resultTypes: ["violations", "incomplete"] });
        const pick = x => ({ id: x.id, impact: x.impact, help: x.help, helpUrl: x.helpUrl,
          nodes: x.nodes.map(n => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\\n").slice(1).join(" ").trim() })) });
        return { version: axe.version, violations: r.violations.map(pick), incomplete: r.incomplete.map(pick) }; })()`);
      const bad = res.violations.filter(v => FAIL.has(v.impact)), rest = res.violations.filter(v => !FAIL.has(v.impact));
      const errors = page.logs.filter(l => !/favicon/.test(l));
      console.log(`${bad.length || errors.length ? "FAIL" : "ok  "} ${name} [${state.name}]  serious/critical ${bad.length}, other ${rest.length}, incomplete ${res.incomplete.length}${errors.length ? `, script errors ${errors.length}` : ""}`);
      for (const v of bad) { failed++; console.log(`  ${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`); for (const n of v.nodes.slice(0, 4)) console.log(`    ${n.target}  ${n.summary ?? ""}`); }
      for (const v of rest) console.log(`  ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map(n => n.target).join(" | ")}`);
      for (const v of res.incomplete) console.log(`  incomplete ${v.id}: ${v.nodes.length} node(s) ${v.nodes.slice(0, 2).map(n => n.target).join(" | ")}`);
      for (const l of errors) { failed++; console.log(`  ${l}`); }
      report.push({ page: name, state: state.name, axe: res.version, ...res, errors });
    }
  }
} finally {
  close(); site.close();
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(failed ? `\n${failed} problem(s)` : `\nno serious or critical violations in ${report.length} page states`);
process.exit(failed ? 1 : 0);
