// Mixture weights as stacked bars, one row per setting (now, prior): target first, then each
// non-target, then guessing. Shared by the mixture pages; the colours are the density plots'.
import { el, clear } from "./plot.js";

export const WEIGHT_COLOR = { target: "#0072B2", nt: "#D55E00", guess: "#595959" };

// rows: [{ label, weights, opacity }]; the first and last weight are target (named first, "T" unless a
// model calls it otherwise) and guessing.
export function weightBars(svg, rows, first = "T") {
  clear(svg);
  const h = 30 * rows.length + 4;
  svg.setAttribute("viewBox", `0 0 500 ${h}`);
  const x0 = 64, W = 422;
  rows.forEach(({ label, weights, opacity }, r) => {
    const y = 4 + 30 * r;
    el("text", { x: x0 - 8, y: y + 20, "text-anchor": "end", class: "tick" }, svg).textContent = label;
    let x = x0;
    weights.forEach((w, i) => {
      const last = i === weights.length - 1, width = w * W;
      const fill = i === 0 ? WEIGHT_COLOR.target : last ? WEIGHT_COLOR.guess : WEIGHT_COLOR.nt;
      // Neighbouring non-targets alternate in shade so the segments stay countable.
      el("rect", { x, y, width, height: 26, fill, "fill-opacity": i > 0 && !last && i % 2 === 0 ? opacity * 0.6 : opacity,
        stroke: "#fff", "stroke-width": 1.5 }, svg);
      if (width > 26) el("text", { x: x + width / 2, y: y + 19, "text-anchor": "middle", class: "ex-seg" + (opacity < 1 ? " ex-seg-dim" : "") }, svg)
        .textContent = i === 0 ? first : last ? "G" : i + 1;
      x += width;
    });
  });
}
