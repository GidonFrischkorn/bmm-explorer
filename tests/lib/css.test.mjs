// css/explorer.css is plain CSS with no nesting: every block closes, rules sit at top level or directly in one at-rule,
// and the landing-page map is styled at every width (its card layout is a min-width query of its own). An unclosed
// block is not a syntax error a browser reports: it pulls every later rule into the open one, which is how the map once
// ended up applying only at tablet width.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Blocks of a stylesheet: prelude, line, the preludes of the blocks around it; plus the blocks left open at the end and
// the line of any closing brace that has no block to close.
function blocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m.replace(/[{}]/g, " "));
  const out = [], open = [], stray = [];
  let line = 1, from = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") line++;
    else if (c === "{") {
      const b = { prelude: src.slice(from, i).replace(/\s+/g, " ").trim(), line, within: open.map(o => o.prelude) };
      out.push(b); open.push(b); from = i + 1;
    } else if (c === "}") {
      if (!open.pop()) stray.push(line);
      from = i + 1;
    } else if (c === ";") from = i + 1;
  }
  return { blocks: out, open, stray };
}

const css = fs.readFileSync(new URL("../../css/explorer.css", import.meta.url), "utf8");
const { blocks: all, open, stray } = blocks(css);

test("every block in explorer.css closes, and no brace closes nothing", () => {
  assert.deepEqual(open.map(b => `line ${b.line}: ${b.prelude}`), [], "blocks still open at the end of the file");
  assert.deepEqual(stray, [], "lines with a closing brace that closes nothing");
});

test("rules sit at top level or directly in one at-rule", () => {
  const nested = all.filter(b => b.within.length > 1 || (b.within.length === 1 && !b.within[0].startsWith("@")));
  assert.deepEqual(nested.map(b => `line ${b.line}: ${b.prelude} inside ${b.within.join(" > ")}`), []);
});

test("the landing-page model map is not inside a max-width query", () => {
  const map = all.filter(b => b.prelude.includes(".model-map"));
  assert.ok(map.length > 0, "no .model-map rules found");
  assert.deepEqual(map.filter(b => b.within.some(w => /max-width/.test(w))).map(b => `line ${b.line}: ${b.prelude} inside ${b.within.join(" > ")}`), []);
});

test("the block parser sees what a browser would do with a missing brace", () => {
  const r = blocks("@media (max-width: 10px) {\n  a { color: red; }\n/* } */\n.model-map { content: \"}\"; }\n");
  assert.deepEqual(r.open.map(b => b.prelude), ["@media (max-width: 10px)"]);
  assert.deepEqual(r.blocks.at(-1).within, ["@media (max-width: 10px)"]);
  assert.deepEqual(blocks("a { }\n}\n").stray, [2]);
});
