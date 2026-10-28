// The announcer behind the live summaries (js/lib/a11y.js): what it says and when.
import { test } from "node:test";
import assert from "node:assert/strict";
import { announcer } from "../../js/lib/a11y.js";

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

test("a notice goes out at once with what was waiting, and nothing is said twice", () => {
  const h = harness();
  h.a.update("bars", "a0"); h.a.update("bars", "a1");
  h.a.say("out of range");
  assert.deepEqual(h.said, ["a1 out of range"]);
  h.advance(5000);
  assert.equal(h.said.length, 1);
});
