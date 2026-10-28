// What a screen reader gets from a plot: a name, a one-line summary that follows the controls, and a polite
// announcement of what a redraw changed. Pages call describePlot(svg, summary) after drawing an svg (a redraw
// clears it) and initA11y() once at the end.
import { el } from "./plot.js";

const WAIT_MS = 800, MAX_WAIT_MS = 2500;

// Collects changed summaries and says them once the controls have been quiet for wait ms, and at least every
// maxWait ms while they keep moving, so a drag or a held arrow key is not read out frame by frame. The first
// summary of a key is the page loading, not news. Timers are injectable for the test.
export function announcer(say, { wait = WAIT_MS, maxWait = MAX_WAIT_MS, setTimer = setTimeout, clearTimer = clearTimeout,
  now = () => performance.now() } = {}) {
  const last = new Map(), changed = new Map();
  let timer = null, since = 0;
  const flush = () => {
    timer = null;
    const text = [...changed.values()].join(" ");
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
    // A notice that is not a plot summary goes out at once, with whatever was waiting.
    say(text) {
      if (timer !== null) clearTimer(timer);
      changed.set("", text);
      flush();
    }
  };
}

let live = null, speaker = null;
function speak() {
  if (!speaker) {
    live = document.createElement("div");
    live.className = "ex-sr";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    document.body.appendChild(live);
    speaker = announcer(text => { live.textContent = text; });
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

// Entries outside the allowed range grey the dashboard (ex-stale) and leave the plots as they were; say so.
export function initA11y() {
  const dash = document.querySelector(".ex-dash");
  if (!dash) return;
  let stale = dash.classList.contains("ex-stale");
  new MutationObserver(() => {
    const now = dash.classList.contains("ex-stale");
    if (now && !stale) speak().say("An entry is outside its allowed range. The plots keep the last valid values.");
    stale = now;
  }).observe(dash, { attributes: true, attributeFilter: ["class"] });
}
