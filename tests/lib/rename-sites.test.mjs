// bmm 1.5.0 renames the location of mixture2p, mixture3p and imm from mu1 to mu (bmm#434; explorer #33). The pages
// keep mu1 until the CRAN oracle moves to 1.5.0, because the formulas a reader copies run on CRAN bmm. This list
// holds every place the page text or code names mu1, so the rename is one known diff: a new mention fails here until
// it is added, and the rename empties the list. Static: the page modules touch the DOM when imported.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SITES = [
  ["js/pages/mixture2p.js", "# density over the response error (radians); bmm fixes mu1, the location, at 0 unless the formula includes mu1"],
  ["models/mixture2p.qmd", "component, `mu1` in its formulas, at 0 by default; a systematic bias in the responses can be"],
  ["models/mixture2p.qmd", "estimated by adding `mu1 ~ 1` to the formula."]
];

function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(js|mjs|qmd|R|md)$/.test(e.name) ? [path.join(dir, e.name)] : []);
}

test("every mention of mu1 in the pages, the page code and the oracle is a listed rename site", () => {
  const scanned = [...files("js"), ...files("models"), ...files("R"),
    ...fs.readdirSync(ROOT).filter(f => f.endsWith(".qmd"))];
  const found = scanned.flatMap(f => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n")
    .filter(line => /\bmu1\b/.test(line)).map(line => [f.split(path.sep).join("/"), line.trim()]));
  assert.deepEqual(found.sort(), [...SITES].sort());
});
