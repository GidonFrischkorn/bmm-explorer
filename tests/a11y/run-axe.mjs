// axe-core on every rendered page, in every state listed in states.json, in headless Chrome, and the checks axe does
// not make (checks.mjs): the screen-reader layer after each state (and the return from a stale one), the keyboard focus
// marks, and a tablet pass.
//   node tests/a11y/run-axe.mjs [--site _site] [--page m3] [--out report.json]
// Fails (exit 1) on a serious or critical violation, on a failed check, on a rendered page that states.json does
// not list, on a state step that finds nothing to act on or a state whose `expect` does not hold, and on a script
// error. Moderate and minor violations and axe's "incomplete" results are printed, not failed on. axe.min.js comes
// from fetch-axe.mjs, checked against its pin.
import fs from "node:fs";
import path from "node:path";
import { serve, launch } from "./browser.mjs";
import { verifyAxe } from "./fetch-axe.mjs";
import { domChecks, expectations, inputValues, recovery, tabletChecks, mapLayout, focusWalk, focusMarks } from "./checks.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const siteDir = path.resolve(arg("site", "_site")), only = arg("page"), outFile = arg("out");
const spec = JSON.parse(fs.readFileSync(path.join(here, "states.json"), "utf8"));
const axeSource = fs.readFileSync(verifyAxe(), "utf8");
const FAIL = new Set(["serious", "critical"]);

// A page that exists in the render but not in states.json would go unchecked: every .html in the site, at any depth,
// except Quarto's own libraries.
const htmlUnder = dir => fs.readdirSync(path.join(siteDir, dir), { withFileTypes: true }).flatMap(e => {
  const rel = dir ? `${dir}/${e.name}` : e.name;
  if (e.isDirectory()) return rel === "site_libs" ? [] : htmlUnder(rel);
  return e.name.endsWith(".html") ? [rel.slice(0, -5)] : [];
});
const rendered = htmlUnder("");
const unlisted = rendered.filter(p => !(p in spec.pages));
if (unlisted.length) { console.error(`::error::pages without an entry in tests/a11y/states.json: ${unlisted.join(", ")}`); process.exit(1); }

// One step of a state, run in the page. Each throws when its target is missing or cannot take the value (a select
// without that option, a range outside its limits), so a renamed id fails the run instead of silently checking the
// default state.
const STEP = `(step) => {
  const need = sel => document.querySelector(sel) ?? (() => { throw new Error("no element for " + sel); })();
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  if (step.click) need(step.click).click();
  else if (step.note) need('button.ex-info[aria-controls="' + step.note + '"]').click();
  else if (step.range) { const e = need(step.range[0]); e.value = step.range[1];
    if (e.value !== String(step.range[1])) throw new Error(step.range[0] + " cannot take " + step.range[1]); fire(e, "input"); }
  else if (step.number) { const e = need(step.number[0]); e.value = step.number[1]; fire(e, "input"); }
  else if (step.select) { const e = need(step.select[0]);
    if (![...e.options].some(o => o.value === String(step.select[1]))) throw new Error(step.select[0] + " has no option " + step.select[1]);
    e.value = step.select[1]; fire(e, "change"); }
  else throw new Error("unknown step " + JSON.stringify(step));
}`;

const site = await serve(siteDir);
const { page, close } = await launch();
const report = [];
let failed = 0, tabletStates = 0;
// Dashboard pages, and those that were taken into a stale state and back: each dashboard page needs one.
const dashboards = new Set(), recovered = new Set();
const flag = (where, problems) => { for (const p of problems) { console.error(`::error::${where} ${p}`); failed++; } return problems.length; };
const selected = name => !only || name === only || name.endsWith(`/${only}`);
const states = entry => [{ name: "default", steps: [] }, ...(entry.states ?? [])];

// Load a page and bring it into a state: its steps, then its expectations. Returns the inputs' values at load.
async function enter(name, state) {
  page.logs.length = 0;
  await page.goto(`${site.url}/${name}.html`);
  const initial = await page.eval(inputValues);
  for (const step of state.steps) {
    try { await page.eval(`(${STEP})(${JSON.stringify(step)})`); }
    catch (e) { flag(`${name} [${state.name}]`, [`step ${JSON.stringify(step)}: ${e.message}`]); }
    await page.sleep(60);
  }
  await page.sleep(250);
  if (state.expect) flag(`${name} [${state.name}]`, await page.eval(expectations(state.expect)));
  return initial;
}

try {
  const [w, h] = spec.viewport;
  // Reduced motion: the axis jumps, so a state is settled as soon as its steps are done.
  await page.viewport(w, h, { reducedMotion: true });
  for (const [name, entry] of Object.entries(spec.pages)) {
    if (!selected(name)) continue;
    if (!rendered.includes(name)) { console.error(`::error::states.json lists ${name}, which was not rendered`); failed++; continue; }
    for (const state of states(entry)) {
      const initial = await enter(name, state);
      const res = await page.eval(`(async () => { ${axeSource}
        const r = await axe.run(document, { resultTypes: ["violations", "incomplete"] });
        const pick = x => ({ id: x.id, impact: x.impact, help: x.help, helpUrl: x.helpUrl,
          nodes: x.nodes.map(n => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\\n").slice(1).join(" ").trim() })) });
        return { version: axe.version, violations: r.violations.map(pick), incomplete: r.incomplete.map(pick) }; })()`);
      const checks = await page.eval(domChecks);
      // After the stale state has been checked as it is, put it back.
      const [dash, stale] = await page.eval(`[".ex-dash", ".ex-dash.ex-stale"].map(s => !!document.querySelector(s))`);
      if (dash) dashboards.add(name);
      if (stale) { checks.push(...await page.eval(recovery(initial))); recovered.add(name); }
      if (name === spec.map?.page && state.name === "default") checks.push(...await page.eval(mapLayout(true)));
      const bad = res.violations.filter(v => FAIL.has(v.impact)), rest = res.violations.filter(v => !FAIL.has(v.impact));
      const errors = page.logs.filter(l => !/favicon/.test(l));
      console.log(`${bad.length || errors.length || checks.length ? "FAIL" : "ok  "} ${name} [${state.name}]  serious/critical ${bad.length}, other ${rest.length}, incomplete ${res.incomplete.length}${errors.length ? `, script errors ${errors.length}` : ""}${checks.length ? `, failed checks ${checks.length}` : ""}`);
      for (const v of bad) { failed++; console.log(`  ${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`); for (const n of v.nodes.slice(0, 4)) console.log(`    ${n.target}  ${n.summary ?? ""}`); }
      for (const v of rest) console.log(`  ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map(n => n.target).join(" | ")}`);
      for (const v of res.incomplete) console.log(`  incomplete ${v.id}: ${v.nodes.length} node(s) ${v.nodes.slice(0, 2).map(n => n.target).join(" | ")}`);
      for (const l of errors) { failed++; console.log(`  ${l}`); }
      flag(`${name} [${state.name}]`, checks);
      report.push({ page: name, state: state.name, axe: res.version, ...res, errors, checks });
    }
  }

  for (const name of dashboards) if (!recovered.has(name)) flag(name, ["has no state with an entry out of range, so its stale and recovery notices go unchecked"]);

  // Keyboard focus, in the same laptop window: Tab through a dashboard, and the marks of draggable svg items. A
  // headless page does not have the window's focus, and without it :focus matches nothing.
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  for (const [name, entry] of Object.entries(spec.pages)) {
    if (!selected(name) || !entry.focus) continue;
    await page.goto(`${site.url}/${name}.html`);
    const problems = [...(entry.focus.walk ? await focusWalk(page) : [])];
    for (const sel of entry.focus.marks ?? []) problems.push(...await focusMarks(page, sel));
    console.log(`${problems.length ? "FAIL" : "ok  "} focus ${name}${entry.focus.walk ? " (Tab walk)" : ""}${entry.focus.marks ? ` (marks: ${entry.focus.marks.join(", ")})` : ""}`);
    flag(`focus ${name}`, problems);
  }

  // A tablet, held either way: the touch rules apply (44 px targets, the (i) hit areas) and the panels stack.
  for (const [tw, th] of spec.tablet.viewports) {
    await page.viewport(tw, th, { touch: true, reducedMotion: true });
    for (const [name, entry] of Object.entries(spec.pages)) {
      if (!selected(name)) continue;
      for (const state of states(entry).filter(s => spec.tablet.states.includes(s.name))) {
        await enter(name, state);
        const { out, minText } = await page.eval(tabletChecks);
        if (name === spec.map?.page && state.name === "default") out.push(...await page.eval(mapLayout(true)));
        const errors = page.logs.filter(l => !/favicon/.test(l));
        console.log(`${out.length || errors.length ? "FAIL" : "ok  "} ${tw}x${th} touch ${name} [${state.name}]${minText ? `  smallest svg text ${minText.toFixed(2)} px` : ""}`);
        for (const l of errors) { failed++; console.log(`  ${l}`); }
        flag(`${tw}x${th} touch ${name} [${state.name}]`, out);
        tabletStates++;
      }
    }
  }
  // Below tablet width the model map is a plain list.
  if (spec.map && selected(spec.map.page)) {
    const [nw, nh] = spec.map.narrow;
    await page.viewport(nw, nh, { reducedMotion: true });
    await page.goto(`${site.url}/${spec.map.page}.html`);
    flag(`${nw}x${nh} ${spec.map.page}`, await page.eval(mapLayout(false)));
  }
} finally {
  close(); site.close();
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(failed ? `\n${failed} problem(s)` : `\nno serious or critical violations and no failed check in ${report.length} page states; ${tabletStates} states at tablet size`);
process.exit(failed ? 1 : 0);
