// The announcer behind the live summaries (js/lib/a11y.js): what it says and when, how the live region repeats a text,
// the notices of the stale state, and the ARIA values of draggable drawings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { announcer, liveWriter, staleNotices, sliderAria } from "../../js/lib/a11y.js";

// A clock and a timer queue the test advances by hand.
function harness(opts = {}) {
  const clock = { t: 0 }, said = [], timers = [];
  const a = announcer(text => said.push(text), {
    wait: 800, maxWait: 2500, now: () => clock.t,
    setTimer: (f, ms) => { const timer = { f, at: clock.t + ms, live: true }; timers.push(timer); return timer; },
    clearTimer: timer => { timer.live = false; },
    ...opts
  });
  const advance = ms => {
    const end = clock.t + ms;
    for (;;) {
      const next = timers.filter(x => x.live && x.at <= end).sort((u, v) => u.at - v.at)[0];
      if (!next) break;
      clock.t = next.at; next.live = false; next.f();
    }
    clock.t = end;
  };
  return { a, said, advance, clock };
}

test("the first summary of a plot is the page loading and is not announced", () => {
  const h = harness();
  h.a.update("bars", "P(correct) 0.81");
  h.advance(5000);
  assert.deepEqual(h.said, []);
});

test("a changed summary is announced once the controls have been quiet", () => {
  const h = harness();
  h.a.update("bars", "P(correct) 0.81");
  h.a.update("bars", "P(correct) 0.78");
  h.advance(799);
  assert.deepEqual(h.said, []);
  h.advance(1);
  assert.deepEqual(h.said, ["P(correct) 0.78"]);
});

test("an unchanged summary says nothing", () => {
  const h = harness();
  h.a.update("bars", "P(correct) 0.81");
  h.a.update("bars", "P(correct) 0.81");
  h.advance(5000);
  assert.deepEqual(h.said, []);
});

test("a drag is one announcement of the last values, not one per frame", () => {
  const h = harness();
  h.a.update("bars", "0");
  for (let i = 1; i <= 20; i++) { h.advance(30); h.a.update("bars", String(i)); }
  assert.deepEqual(h.said, []);
  h.advance(800);
  assert.deepEqual(h.said, ["20"]);
});

test("a drag that never pauses is still announced every maxWait ms", () => {
  const h = harness();
  h.a.update("bars", "0");
  for (let i = 1; i <= 200; i++) { h.advance(30); h.a.update("bars", String(i)); }
  assert.ok(h.said.length >= 2 && h.said.length <= 3, `${h.said.length} announcements in 6 s of dragging`);
});

test("several plots that changed are announced together, in the order they changed", () => {
  const h = harness();
  h.a.update("bars", "a0"); h.a.update("across", "b0");
  h.a.update("bars", "a1"); h.a.update("across", "b1");
  h.advance(800);
  assert.deepEqual(h.said, ["a1 b1"]);
});

test("a notice goes out at once, ahead of what was waiting, and nothing is said twice", () => {
  const h = harness();
  h.a.update("bars", "a0"); h.a.update("bars", "a1");
  h.a.say("valid again");
  assert.deepEqual(h.said, ["valid again a1"]);
  h.advance(5000);
  assert.equal(h.said.length, 1);
});

test("the live region gets a new text at once, and a repeated one after a clear, so it is read again", () => {
  const node = { textContent: "" }, later = [];
  const write = liveWriter(node, f => later.push(f));
  write("Not valid: kappa.");
  assert.equal(node.textContent, "Not valid: kappa.");
  write("Not valid: kappa.");
  assert.equal(node.textContent, "", "cleared first");
  later.shift()();
  assert.equal(node.textContent, "Not valid: kappa.");
});

test("a newer text cancels the late write of a repeated one", () => {
  const node = { textContent: "" }, later = [];
  const write = liveWriter(node, f => later.push(f));
  write("a"); write("a"); write("b");
  later.forEach(f => f());
  assert.equal(node.textContent, "b");
});

test("the stale notices: going stale, another entry, one fixed, all fixed, stale again", () => {
  const next = staleNotices();
  assert.equal(next(false, []), null, "valid entries say nothing");
  assert.equal(next(true, ["kappa"]), "Not valid: kappa. The plots keep the last valid values.");
  assert.equal(next(true, ["kappa"]), null, "a redraw in the same state says nothing");
  assert.equal(next(true, ["kappa", "c", "a"]), "Also not valid: c and a.");
  assert.equal(next(true, ["kappa", "a"]), "Still not valid: kappa and a.");
  assert.equal(next(false, []), "All entries are valid again. The plots show the current values.");
  assert.equal(next(false, []), null);
  assert.equal(next(true, ["set size"]), "Not valid: set size. The plots keep the last valid values.");
  assert.equal(next(true, ["set size", "spacing in radians", "c"]), "Also not valid: spacing in radians and c.");
});

test("a stale state without a named entry still says so", () => {
  assert.equal(staleNotices()(true, []), "An entry is not valid. The plots keep the last valid values.");
});

test("sliderAria rounds the value and limits to two decimals and gives a text", () => {
  assert.deepEqual(sliderAria(0.6499999999999999, -Math.PI, Math.PI),
    { "aria-valuenow": 0.65, "aria-valuemin": -3.14, "aria-valuemax": 3.14, "aria-valuetext": "0.65" });
  assert.equal(sliderAria(-1.5, -4.5, 4.5)["aria-valuetext"], "−1.50");
  assert.equal(sliderAria(1.57, 0, 3.14, "90 degrees")["aria-valuetext"], "90 degrees");
});
