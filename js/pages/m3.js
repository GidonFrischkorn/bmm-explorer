// Page script for models/m3.qmd. Milestone E1 fills this in; until then it proves the module path.
import { m3Probs, ssActs, defaultB } from "../models/m3.js";
const p = m3Probs(ssActs({ a: 2, c: 1, b: defaultB("simple") }), [1, 3, 4], "simple");
document.getElementById("m3-widget").textContent =
  "Module loaded. With a = 2, c = 1, 3 other items and 4 lures the simple rule predicts P(correct) = " + p[0].toFixed(3) + ".";
