// bmm 1.5.0 renames the location of mixture2p, mixture3p and imm from mu1 to mu (bmm#434; explorer #33). The pages
// keep mu1 until the CRAN oracle moves to 1.5.0, because the formulas a reader copies run on CRAN bmm. This list
// holds every place a repository file names mu1, draw names such as b_mu1_Intercept included, so the rename is one
// known diff: a new mention fails here until it is added, and the rename empties the list. The other half of #33
// (p_nt to ptarget) is not in bmm develop yet and is not covered. Static: the page modules touch the DOM when imported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SELF = "tests/lib/rename-sites.test.mjs";
const BINARY = /\.(png|jpe?g|gif|ico|webp|pdf|woff2?|ttf|otf|eot)$/i;
// Not \b: "_" is a word character, and bmm names the draws b_mu1_Intercept.
const MU1 = /(?<![A-Za-z0-9])mu1(?![A-Za-z0-9])/;
const SITES = [
  ["js/pages/mixture2p.js", "# density over the response error (radians); bmm fixes mu1, the location, at 0 unless the formula includes mu1"],
  ["models/mixture2p.qmd", "component, `mu1` in its formulas, at 0 by default; a systematic bias in the responses can be"],
  ["models/mixture2p.qmd", "estimated by adding `mu1 ~ 1` to the formula."]
];

// Tracked files only, as CI sees them: untracked artefacts and scratch files cannot fail the test, so a new file is
// scanned once it is added. Without git this throws, so the test fails.
function files() {
  const out = execFileSync("git", ["ls-files", "-z", "--cached"],
    { cwd: ROOT, encoding: "utf8" });
  const list = [...new Set(out.split("\0").filter(Boolean))];
  assert.ok(list.length > 0, "git ls-files listed no files");
  return list.filter(f => f !== SELF && !BINARY.test(f) && fs.existsSync(path.join(ROOT, f)));
}

test("every mention of mu1 in the repository is a listed rename site", () => {
  const found = files().flatMap(f => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n")
    .filter(line => MU1.test(line)).map(line => [f, line.trim()]));
  assert.deepEqual(found.sort(), [...SITES].sort());
});
