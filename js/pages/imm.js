// Page script for models/imm.qmd. Milestone E2 fills this in; until then it proves the module path.
import { dimm } from "../models/circular.js";
const d = Math.exp(dimm(0, {}));
document.getElementById("imm-widget").textContent =
  "Module loaded. With bmm's default parameters the IMM density at the target is " + d.toFixed(3) + ".";
