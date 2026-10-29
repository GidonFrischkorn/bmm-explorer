// What a screen reader gets from a plot: a name, a one-line summary that follows the controls, and a polite
// announcement of what a redraw changed. Pages call describePlot(svg, summary) after drawing an svg (a redraw
// clears it) and initA11y() once at the end. The summaries themselves are built in summaries.js.
import { el } from "./plot.js";
import { fmt } from "./widget.js";

const WAIT_MS = 800, MAX_WAIT_MS = 2500, REPEAT_MS = 100;

// Collects changed summaries and says them once the controls have been quiet for wait ms, and at least every
// maxWait ms while they keep moving, so a drag or a held arrow key is not read out frame by frame. The first
// summary of a key is the page loading, not news. Timers are injectable for the test.
export function announcer(say, { wait = WAIT_MS, maxWait = MAX_WAIT_MS, setTimer = setTimeout, clearTimer = clearTimeout,
  now = () => performance.now() } = {}) {
  const last = new Map(), changed = new Map();
  let timer = null, since = 0;
  const flush = (notice = "") => {
    timer = null;
    const text = [notice, ...changed.values()].filter(Boolean).join(" ");
    changed.clear();
    if (text) say(text);
  };
  return {
    update(key, text) {
      if (!last.has(key)) { last.set(key, text); return; }
      if (last.get(key) === text) return;
      last.set(key, text);
      changed.set(key, text);
      const t = now();
      if (timer === null) since = t; else clearTimer(timer);
      timer = setTimer(flush, Math.max(0, Math.min(wait, since + maxWait - t)));
    },
    // A notice that is not a plot summary goes out at once, ahead of whatever was waiting: the summaries that
    // follow a return to valid entries are read as the news they are.
    say(text) {
      if (timer !== null) clearTimer(timer);
      flush(text);
    }
  };
}

// Writes announcements into a live region. A polite region is re-read only when its text changes, so a text equal
// to the one it holds is written after a clear, later; a newer text cancels that late write.
export function liveWriter(node, later = f => setTimeout(f, REPEAT_MS)) {
  let n = 0;
  return text => {
    const mine = ++n;
    if (node.textContent !== text) { node.textContent = text; return; }
    node.textContent = "";
    later(() => { if (mine === n) node.textContent = text; });
  };
}

// The notices of the stale state, from the dashboard's state after each redraw: stale or not, and the names of the
// entries flagged invalid. Going stale names the entries; while stale, an entry that goes invalid as well is named,
// and so are those still invalid after one is fixed; leaving it says that the plots follow the controls again.
export function staleNotices() {
  let stale = false, was = [];
  const list = names => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]);
  return (now, invalid) => {
    const added = invalid.filter(x => !was.includes(x)), fixed = was.some(x => !invalid.includes(x)), before = stale;
    [stale, was] = [now, invalid];
    if (now && !before) return `${invalid.length ? `Not valid: ${list(invalid)}.` : "An entry is not valid."} The plots keep the last valid values.`;
    if (!now && before) return "All entries are valid again. The plots show the current values.";
    if (now && added.length) return `Also not valid: ${list(added)}.`;
    if (now && fixed && invalid.length) return `Still not valid: ${list(invalid)}.`;
    return null;
  };
}

// A focusable drawing that moves like a slider: its value rounded to what the page prints (a floating-point tail is
// read out digit by digit), its limits (without them a slider is read as 0 to 100) and the text a reader speaks.
export function sliderAria(value, min, max, text = fmt(value, 2)) {
  const r = v => Math.round(v * 100) / 100;
  return { "aria-valuenow": r(value), "aria-valuemin": r(min), "aria-valuemax": r(max), "aria-valuetext": text };
}

let speaker = null;
function speak() {
  if (!speaker) {
    const live = document.createElement("div");
    live.className = "ex-sr";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    document.body.appendChild(live);
    speaker = announcer(liveWriter(live));
  }
  return speaker;
}

// Gives svg its name (the aria-label in the page's markup, kept as the <title>) and the summary of what it
// shows now, and queues the summary for announcement. An svg with focusable parts is a group, not an image:
// an image has presentational children, which would hide its draggable handles.
export function describePlot(svg, summary) {
  const name = (svg.dataset.name ??= svg.getAttribute("aria-label") ?? svg.id);
  svg.setAttribute("role", svg.querySelector("[tabindex]") ? "group" : "img");
  svg.setAttribute("aria-label", name);
  svg.setAttribute("aria-describedby", `${svg.id}-desc`);
  const title = el("title", { id: `${svg.id}-title` }), desc = el("desc", { id: `${svg.id}-desc` });
  title.textContent = name;
  desc.textContent = summary;
  svg.prepend(title, desc);
  speak().update(svg.id, summary);
}

// Entries the page cannot draw grey the dashboard (ex-stale) and leave the plots as they were; the flagged boxes
// carry ex-invalid. Says when that starts, when it changes and when it ends. Only class changes on the dashboard
// and its inputs matter; the redrawn svgs inside it are skipped.
export function initA11y() {
  const dash = document.querySelector(".ex-dash");
  if (!dash) return;
  const next = staleNotices();
  const name = e => e.getAttribute("aria-label") ?? e.labels?.[0]?.textContent.trim() ?? e.id;
  const state = () => [dash.classList.contains("ex-stale"), [...dash.querySelectorAll("input.ex-invalid")].map(name)];
  next(...state());
  new MutationObserver(records => {
    if (!records.some(r => r.target === dash || r.target.tagName === "INPUT")) return;
    const text = next(...state());
    if (text) speak().say(text);
  }).observe(dash, { attributes: true, subtree: true, attributeFilter: ["class"] });
}
