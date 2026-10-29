// Fetches the pinned axe-core release from the npm registry into tests/a11y/vendor/ (gitignored) and checks it:
// the tarball against the sha512 the registry publishes, then axe.min.js against the sha256 pinned in axe.json.
// A mismatch deletes the download and fails. Test-time only: axe never reaches a page a reader loads.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(fs.readFileSync(path.join(here, "axe.json"), "utf8"));
const vendor = path.join(here, "vendor");
const target = path.join(vendor, "axe.min.js");
const digest = (algo, buf, enc) => crypto.createHash(algo).update(buf).digest(enc);

export function verifyAxe(file = target) {
  const sum = digest("sha256", fs.readFileSync(file), "hex");
  if (sum !== pin.sha256) throw new Error(`axe.min.js sha256 ${sum} does not match the pin ${pin.sha256}`);
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (fs.existsSync(target)) { verifyAxe(); console.log(`axe-core ${pin.version} already in place, sha256 ok`); process.exit(0); }
  // curl rather than fetch(): it follows the proxy settings of a restricted network.
  const tgz = execFileSync("curl", ["-fsSL", "--retry", "3", pin.tarball], { maxBuffer: 64 * 1024 * 1024 });
  const got = digest("sha512", tgz, "base64");
  if (got !== pin.tarballSha512) throw new Error(`tarball sha512 ${got} does not match the pin ${pin.tarballSha512}`);
  fs.mkdirSync(vendor, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(vendor, "dl-"));
  fs.writeFileSync(path.join(tmp, "axe.tgz"), tgz);
  execFileSync("tar", ["-xzf", "axe.tgz", pin.file], { cwd: tmp });
  fs.copyFileSync(path.join(tmp, pin.file), target);
  fs.rmSync(tmp, { recursive: true, force: true });
  try { verifyAxe(); } catch (e) { fs.rmSync(target); throw e; }
  console.log(`axe-core ${pin.version}: tarball sha512 and axe.min.js sha256 match the pins`);
}
