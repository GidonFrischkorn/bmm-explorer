// The axis that holds its limit (js/lib/axis.js): when it changes, and how it eases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { niceAxis, holdAxis, autoAxis } from "../../js/lib/axis.js";

test("niceAxis gives a round limit and 3 to 5 ticks from 0", () => {
  assert.deepEqual(niceAxis(0.9), { ylim: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1] });
  assert.deepEqual(niceAxis(3.3), { ylim: [0, 4], yticks: [0, 1, 2, 3, 4] });
  for (const m of [0.013, 0.47, 1.9, 7.4, 61]) {
    const { ylim, yticks } = niceAxis(m);
    assert.ok(ylim[1] >= m && yticks.length >= 3 && yticks.length <= 6, `${m}: ${yticks}`);
  }
});

test("holdAxis keeps the limit while the data fill more than half of it", () => {
  const shown = niceAxis(0.9);
  for (const m of [0.95, 0.6, 0.45]) assert.equal(holdAxis(shown, m), shown, `max ${m}`);
  assert.equal(holdAxis(shown, 1.2).ylim[1], niceAxis(1.2).ylim[1]);
  assert.equal(holdAxis(shown, 0.2).ylim[1], niceAxis(0.2).ylim[1]);
  assert.deepEqual(holdAxis(null, 0.9), shown);
});

// A clock and a frame queue the test advances by hand.
function harness(still = false) {
  const clock = { t: 0 }, frames = [];
  let redraws = 0;
  const axis = autoAxis(() => { redraws++; }, {
    nice: niceAxis, now: () => clock.t, frame: f => frames.push(f), still: () => still
  });
  const tick = ms => { clock.t += ms; frames.splice(0).forEach(f => f()); };
  return { axis, clock, frames, tick, redraws: () => redraws };
}

test("autoAxis eases to a new limit and stops at it", () => {
  const h = harness();
  assert.equal(h.axis.next(0.9).ylim[1], 1);
  const first = h.axis.next(3.3);
  assert.equal(first.ylim[1], 1, "the first frame still shows the old limit");
  assert.equal(h.frames.length, 1, "one redraw is queued");
  h.tick(100);
  const mid = h.axis.next(3.3);
  assert.ok(mid.ylim[1] > 1 && mid.ylim[1] < 4, `halfway: ${mid.ylim[1]}`);
  assert.ok(mid.yticks.every(v => v <= mid.ylim[1]), "no tick above the limit");
  h.tick(100);
  assert.deepEqual(h.axis.next(3.3), niceAxis(3.3));
  h.tick(16);
  assert.equal(h.frames.length, 0, "no redraw after the limit is reached");
});

test("autoAxis restarts from where it is when the target changes mid-way", () => {
  const h = harness();
  h.axis.next(0.9);
  h.axis.next(3.3);
  h.tick(100);
  const mid = h.axis.next(3.3).ylim[1];
  const turned = h.axis.next(0.3).ylim[1];
  assert.ok(Math.abs(turned - mid) < 1e-12, "no jump when the target turns");
  h.tick(250);
  assert.equal(h.axis.next(0.3).ylim[1], niceAxis(0.3).ylim[1]);
});

test("every frame of an ease has ticks above 0, growing and shrinking", () => {
  for (const [a, b] of [[0.4, 2], [2, 0.4], [0.9, 61], [61, 0.9]]) {
    const h = harness();
    h.axis.next(a);
    for (let t = 0; t <= 200; t += 10) {
      const { ylim, yticks } = h.axis.next(b);
      assert.ok(yticks.length >= 3 && yticks.at(-1) <= ylim[1] + 1e-12, `${a} -> ${b} at ${t} ms: ${yticks} under ${ylim[1]}`);
      h.tick(10);
    }
  }
});

test("after reset the next limit is drawn at once, with no hold or ease from the old one", () => {
  const h = harness();
  h.axis.next(3.3);
  h.axis.reset();
  assert.deepEqual(h.axis.next(1.9), niceAxis(1.9));
  assert.equal(h.frames.length, 0);
});

test("autoAxis jumps at once under reduced motion", () => {
  const h = harness(true);
  h.axis.next(0.9);
  assert.deepEqual(h.axis.next(3.3), niceAxis(3.3));
  assert.equal(h.frames.length, 0);
});

test("one frame per redraw function, however many axes move", () => {
  const frames = [], redraw = () => {}, opts = { now: () => 0, frame: f => frames.push(f), still: () => false };
  const a = autoAxis(redraw, opts), b = autoAxis(redraw, opts);
  a.next(0.9); b.next(0.9);
  a.next(3.3); b.next(3.3);
  assert.equal(frames.length, 1);
});
