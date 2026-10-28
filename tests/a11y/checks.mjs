// What axe does not check, asserted in the same Chrome session by run-axe.mjs. Each check returns a list of problems
// (empty: passed); run-axe.mjs prints each as an ::error:: line and fails the run.
//   domChecks: the screen-reader layer of the dashboard after each state (value texts, plot summaries, the live
//     region, the stale notice).
//   expectations: a state's `expect` in states.json, so a step that misses its target's effect fails by design.
//   recovery: a stale state put back to valid entries leaves the stale state and announces it.
//   tabletChecks: a touch window, 1024 x 768 and 768 x 1024 (no horizontal scroll, 44 px targets, (i) hit areas clear
//     of other controls, rendered svg text size).
//   focusWalk, focusMarks: the keyboard focus ring reached by real Tab presses, and the marks of draggable svg items.
//   mapLayout: the landing page's model map, cards from 768 px, a plain list below.

const MIN_TARGET = 44, MIN_TEXT_PX = 11.5;

// Screen-reader layer. stale: whether to wait for the stale notice (the dashboard is greyed); the notice goes out
// through the live region after the page's MutationObserver fires, so it is polled for, not read once.
export const domChecks = `(async () => {
  const out = [], dash = document.querySelector(".ex-dash");
  if (!dash) return out;
  const num = v => v !== null && v !== "" && Number.isFinite(+v);
  for (const r of dash.querySelectorAll('input[type="range"]')) {
    const t = r.getAttribute("aria-valuetext"), box = document.getElementById(r.id + "-num");
    if (!t) out.push("range #" + r.id + " has no aria-valuetext");
    else if (box && t !== (box.value === "" ? "no value" : box.value)) out.push("range #" + r.id + ' aria-valuetext "' + t + '" is not its box\\'s "' + box.value + '"');
  }
  // Decorations (a legend's dash sample) are hidden from the reader and need no summary.
  for (const s of dash.querySelectorAll("svg")) {
    if (s.closest('[aria-hidden="true"]')) continue;
    const id = s.id ? "svg #" + s.id : "an svg without an id";
    const kids = [...s.children], titles = kids.filter(k => k.tagName === "title"), descs = kids.filter(k => k.tagName === "desc");
    const desc = descs[0]?.textContent.trim() ?? "";
    if (!s.id) { out.push(id + " in the dashboard"); continue; }
    if (titles.length !== 1) out.push(id + " has " + titles.length + " <title> children");
    if (descs.length !== 1 || !desc) out.push(id + " has " + descs.length + " <desc> children" + (descs.length === 1 ? ", empty" : ""));
    else if (/NaN|undefined|null|\\[object/.test(desc)) out.push(id + ' summary reads "' + desc.slice(0, 80) + '"');
    else if (s.getAttribute("aria-describedby") !== descs[0].id) out.push(id + " aria-describedby does not point to its <desc>");
    if (!s.getAttribute("aria-label")) out.push(id + " has no aria-label");
    const role = s.querySelector("[tabindex]") ? "group" : "img";
    if (s.getAttribute("role") !== role) out.push(id + " role " + s.getAttribute("role") + ", expected " + role);
  }
  for (const k of dash.querySelectorAll("svg [role=slider]")) {
    const id = k.closest("svg").id + " slider " + JSON.stringify(k.getAttribute("aria-label"));
    const [now, min, max] = ["aria-valuenow", "aria-valuemin", "aria-valuemax"].map(a => k.getAttribute(a));
    if (!k.getAttribute("aria-label")) out.push(id + " has no aria-label");
    if (!k.getAttribute("aria-valuetext")) out.push(id + " has no aria-valuetext");
    if (![now, min, max].every(num)) out.push(id + " valuenow/min/max " + [now, min, max].join("/"));
    else if (+min >= +max) out.push(id + " valuemin " + min + " is not below valuemax " + max);
    else if (String(now).replace(/^-/, "").split(".")[1]?.length > 2) out.push(id + " aria-valuenow " + now + " is not rounded");
    if (k.getAttribute("tabindex") !== "0") out.push(id + " is not in the tab order");
  }
  const live = document.querySelectorAll('.ex-sr[aria-live="polite"]');
  if (live.length !== 1) { out.push(live.length + " polite .ex-sr live regions"); return out; }
  if (dash.classList.contains("ex-stale")) {
    const t0 = performance.now();
    while (!/plots keep the last valid values/.test(live[0].textContent) && performance.now() - t0 < 2000) await new Promise(r => setTimeout(r, 50));
    if (!/plots keep the last valid values/.test(live[0].textContent)) out.push('the dashboard is stale and the live region holds "' + live[0].textContent.slice(0, 80) + '", not the stale notice');
  }
  return out;
})()`;

// The values of the dashboard's inputs, by id, to put a stale state back afterwards.
export const inputValues = `Object.fromEntries([...document.querySelectorAll(".ex-dash input[id]")].map(e => [e.id, e.value]))`;

// A stale dashboard fixed back: every number box that differs from its value at load gets that value again, as a user
// would type it. The dashboard must leave the stale state and the live region must say so (a11y.js, staleNotices).
export const recovery = initial => `(async () => {
  const out = [], dash = document.querySelector(".ex-dash"), live = document.querySelector('.ex-sr[aria-live="polite"]');
  for (const [id, v] of Object.entries(${JSON.stringify(initial)})) {
    const e = document.getElementById(id);
    if (e?.type === "number" && e.value !== v) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  const t0 = performance.now();
  while (!/All entries are valid again/.test(live?.textContent) && performance.now() - t0 < 2000) await new Promise(r => setTimeout(r, 50));
  if (dash.classList.contains("ex-stale")) out.push("the dashboard is still stale after its entries were put back");
  if (!/All entries are valid again/.test(live?.textContent)) out.push('entries put back, and the live region holds "' + (live?.textContent ?? "").slice(0, 80) + '", not the recovery notice');
  return out;
})()`;

// A state's expect: a selector that must match, or [selector, property, value] that must hold on its first match.
// Two properties are the check's own: "visible" (the element takes up space: not hidden, not in a hidden row) and
// "text" (its text contains the value).
export const expectations = list => `(() => {
  const out = [];
  for (const x of ${JSON.stringify(list)}) {
    const [sel, prop, want] = Array.isArray(x) ? x : [x];
    const e = document.querySelector(sel);
    if (!e) { out.push("expect: no element for " + sel); continue; }
    if (prop === undefined) continue;
    const got = prop === "visible" ? e.getClientRects().length > 0 : prop === "text" ? e.textContent : e[prop];
    if (prop === "text" ? !got.includes(want) : got !== want) out.push("expect: " + sel + " " + prop + " is " + JSON.stringify(got) + ", not " + JSON.stringify(want));
  }
  return out;
})()`;

// Tablet window. Every point probed with elementFromPoint is scrolled into view first: a point outside the window
// hits nothing. The (i) button's target is its ::after, so its size is measured by hit testing along the two axes
// through its centre.
export const tabletChecks = `(() => {
  const out = [], MIN = ${MIN_TARGET}, MIN_TEXT = ${MIN_TEXT_PX};
  const scroll = document.documentElement.scrollWidth - innerWidth;
  if (scroll > 0) out.push("horizontal scroll of " + scroll + " px at " + innerWidth + " px");
  const dash = document.querySelector(".ex-dash");
  if (!dash) return { out };
  const shown = e => e.getClientRects().length > 0;
  const name = e => e.id ? "#" + e.id : e.tagName.toLowerCase() + ' "' + e.textContent.trim().slice(0, 24) + '"';
  for (const e of dash.querySelectorAll('input[type="range"], input[type="number"], select, button, .btn')) {
    if (!shown(e) || e.classList.contains("ex-info")) continue;
    const h = e.getBoundingClientRect().height;
    if (h < MIN - 0.01) out.push(name(e) + " is " + h.toFixed(1) + " px tall");
  }
  for (const e of dash.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
    if (!shown(e)) continue;
    const t = e.closest("label") ?? e.labels?.[0] ?? e, h = t.getBoundingClientRect().height;
    if (h < MIN - 0.01) out.push("the label of " + name(e) + " is " + h.toFixed(1) + " px tall");
  }
  for (const b of dash.querySelectorAll("button.ex-info")) {
    if (!shown(b)) continue;
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reach = (dx, dy) => { let k = 0; while (k < 60 && document.elementFromPoint(cx + dx * (k + 1), cy + dy * (k + 1)) === b) k++; return k; };
    const w = reach(-1, 0) + reach(1, 0) + 1, h = reach(0, -1) + reach(0, 1) + 1;
    if (w < MIN - 1 || h < MIN - 1) out.push("the hit area of " + b.getAttribute("aria-controls") + "'s (i) is " + w + " x " + h + " px");
  }
  for (const e of dash.querySelectorAll("input, select, label")) {
    if (!shown(e)) continue;
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect(), own = e.tagName === "LABEL" ? e.closest(".ex-label")?.querySelector(".ex-info") : null;
    let n = 0;
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const hit = document.elementFromPoint(r.left + r.width * i / 6, r.top + r.height * j / 6)?.closest?.(".ex-info");
      if (hit && hit !== own) n++;
    }
    if (n) out.push(n + "/25 points of " + name(e) + " land on an (i) button that is not its own");
  }
  let min = { px: Infinity };
  for (const t of dash.querySelectorAll("svg text")) {
    if (!shown(t) || !t.textContent.trim() || getComputedStyle(t).display === "none") continue;
    const m = t.getScreenCTM(), px = parseFloat(getComputedStyle(t).fontSize) * Math.hypot(m.a, m.b);
    if (px < min.px) min = { px, where: t.ownerSVGElement.id + ' "' + t.textContent.trim().slice(0, 16) + '"' };
  }
  if (min.px < MIN_TEXT) out.push("svg text renders at " + min.px.toFixed(2) + " px (" + min.where + "), below " + MIN_TEXT);
  scrollTo(0, 0);
  return { out, minText: min.px };
})()`;

// The model map's list on the landing page: two columns of cards from 768 px, a plain list below.
export const mapLayout = grid => `(() => {
  const ul = document.querySelector(".model-map > ul");
  if (!ul) return ["no .model-map > ul on the landing page"];
  const cs = getComputedStyle(ul), cols = cs.gridTemplateColumns.split(" ").length;
  const ok = ${grid} ? cs.display === "grid" && cols === 2 : cs.display === "block";
  return ok ? [] : [".model-map > ul at " + innerWidth + " px is display " + cs.display + (cs.display === "grid" ? " with " + cols + " columns" : "") + ", expected ${grid ? "a 2-column grid" : "a block list"}"];
})()`;

const FOCUSED = `(() => {
  const e = document.activeElement, cs = getComputedStyle(e);
  const kind = e.matches('input[type="range"]') ? "range" : e.matches(".ex-info") ? "(i)" : e.matches(".btn") ? ".btn" : null;
  return { inDash: !!e.closest(".ex-dash"), inSvg: !!e.ownerSVGElement, kind,
    name: e.id ? "#" + e.id : e.tagName.toLowerCase() + ' "' + (e.getAttribute("aria-label") ?? e.textContent.trim()).slice(0, 24) + '"',
    outline: cs.outlineStyle + " " + parseFloat(cs.outlineWidth), solid: cs.outlineStyle === "solid" && parseFloat(cs.outlineWidth) >= 2 };
})()`;

// Real Tab presses from the top of the page through the dashboard: every html control there shows a solid ring of
// at least 2 px, and the walk reaches a range, a .btn and an (i).
export async function focusWalk(page) {
  const out = [], seen = new Set();
  await page.eval("(document.activeElement?.blur(), scrollTo(0, 0), true)");
  let entered = false;
  for (let i = 0; i < 250; i++) {
    await page.key("Tab");
    const f = await page.eval(FOCUSED);
    if (!f.inDash) { if (entered) break; continue; }
    entered = true;
    if (f.inSvg) continue;
    if (!f.solid) out.push(`focus on ${f.name} shows outline ${f.outline}, not a solid ring of 2 px or more`);
    if (f.kind) seen.add(f.kind);
  }
  for (const k of ["range", ".btn", "(i)"]) if (!seen.has(k)) out.push(`Tab never reached a ${k} in the dashboard`);
  return out;
}

// A draggable svg item has no outline that every browser draws; its focus mark is its own paint.
export async function focusMarks(page, selector) {
  return page.eval(`(sel => {
    const e = document.querySelector(sel);
    if (!e) return ["no element for " + sel];
    const paint = () => { const cs = getComputedStyle(e); return [cs.stroke, cs.strokeWidth, cs.fill, cs.fillOpacity].join(" "); };
    document.activeElement?.blur();
    const before = paint();
    e.focus({ preventScroll: true });
    if (document.activeElement !== e) return [sel + " does not take focus"];
    const after = paint();
    e.blur();
    return before === after ? [sel + " looks the same focused and not (" + after + ")"] : [];
  })(${JSON.stringify(selector)})`);
}
