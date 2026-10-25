import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const dir = process.env.BMM_FIXTURES ?? path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");
export const loadFixture = name => JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8"));

export function assertClose(got, ref, tol, label) {
  assert.equal(got.length, ref.length, `${label}: length`);
  let worst = 0;
  got.forEach((g, i) => { worst = Math.max(worst, Math.abs(g - ref[i])); });
  assert.ok(worst <= tol, `${label}: max abs error ${worst.toExponential(2)} > ${tol}`);
  return worst;
}
