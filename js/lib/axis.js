// Axes from 0 to a round limit, and limits that move as little as they can while a slider is dragged.

// A round upper limit and 3 to 5 ticks for an axis starting at 0.
export function niceAxis(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const n = Math.ceil(max / step - 1e-9);
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / mag === 2.5 ? 1 : 0));
  return { ylim: [0, n * step], yticks: Array.from({ length: n + 1 }, (_, i) => +(i * step).toFixed(digits)) };
}

// The limit stays while the data fill more than half of it: a curve that grows and shrinks around a round
// value would otherwise make the axis jump back and forth.
const SHRINK = 0.5;
export function holdAxis(shown, max, nice = niceAxis) {
  const want = nice(max);
  if (!shown) return want;
  const top = shown.ylim[1];
  return want.ylim[1] > top || want.ylim[1] <= SHRINK * top ? want : shown;
}

const EASE_MS = 200;
const ease = u => 1 - (1 - u) ** 3;
// One frame per redraw function, however many of its axes are moving.
const queued = new Set();
function schedule(redraw, frame) {
  if (queued.has(redraw)) return;
  queued.add(redraw);
  frame(() => { queued.delete(redraw); redraw(); });
}
const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;

// One per panel axis. axis.next(max) returns the axis to draw now, { ylim, yticks }. When the limit has to
// change, it eases there over the next frames, each a call of redraw (the page's draw, which calls next
// again); while it moves, the ticks keep the coarser of the two steps while it gives two ticks above 0, so
// that they neither crowd nor vanish. With reduced motion the limit changes at once. nice maps the data
// maximum to a round axis. axis.reset() forgets the limit, for a panel that starts to plot another quantity
// (a model version, a parametrization).
export function autoAxis(redraw, { nice = m => niceAxis(m * 1.05), now = () => performance.now(),
  frame = f => requestAnimationFrame(f), still = reducedMotion } = {}) {
  let target = null, from = null, t0 = 0;
  const stepOf = a => a.yticks[1] - a.yticks[0];
  const topAt = t => from.top + (target.ylim[1] - from.top) * ease(Math.min(1, (t - t0) / EASE_MS));
  return {
    reset() { target = from = null; },
    next(max) {
      // Nothing to hold to (no data drawn): the plain axis, and the held one stays for the next call.
      if (!Number.isFinite(max)) return nice(max);
      const t = now(), want = holdAxis(target, max, nice);
      if (want.ylim[1] !== target?.ylim[1]) {
        from = target && !still() ? { top: from ? topAt(t) : target.ylim[1], step: Math.max(stepOf(target), from?.step ?? 0) } : null;
        target = want;
        t0 = t;
      }
      if (!from || t - t0 >= EASE_MS) {
        from = null;
        return target;
      }
      schedule(redraw, frame);
      const top = topAt(t), steps = [from.step, stepOf(target)].sort((u, v) => v - u);
      const step = steps.find(s => top / s >= 2 - 1e-9) ?? steps[1];
      return { ylim: [0, top], yticks: Array.from({ length: Math.floor(top / step + 1e-9) + 1 }, (_, i) => +(i * step).toPrecision(12)) };
    }
  };
}
