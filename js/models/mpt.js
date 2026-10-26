// Multinomial processing trees as bmm's mpt() evaluates them (.mpt_probability_vector in R/distributions.R):
// a category's probability is the sum of its branches, a branch the product of its factors. A tree is
// data: { categories, parameters, covariates, branches: [{ cat, path: ["Pm", "1-Pb", "gl_corr"] }] },
// where a factor names a parameter or covariate and "1-" takes its complement. Covariates are functions
// of the task settings (the guessing rates of a response set); bmm takes them as data columns.
// Held to bmm by tests/parity/mpt.test.mjs.
import { logMultinom } from "../lib/math.js";

const factorValue = (f, values) => (f.startsWith("1-") ? 1 - values[f.slice(2)] : values[f]);

// values: parameters and covariates by name. Probabilities in the order of tree.categories.
export function mptProbs(tree, values) {
  const out = tree.categories.map(() => 0);
  for (const { cat, path } of tree.branches)
    out[tree.categories.indexOf(cat)] += path.reduce((p, f) => p * factorValue(f, values), 1);
  return out;
}

// Covariate values for one setting of the task.
export const mptCovariates = (tree, settings) =>
  Object.fromEntries(Object.entries(tree.covariates).map(([k, f]) => [k, f(settings)]));

export const dmpt = (x, tree, values) => logMultinom(x, mptProbs(tree, values));

// One category's branch expression as mpt_tree() takes it, e.g. "Pm * (1 - Pb) * gl_corr + ...".
export const branchString = (tree, cat) => tree.branches.filter(b => b.cat === cat)
  .map(b => b.path.map(f => (f.startsWith("1-") ? `(1 - ${f.slice(2)})` : f)).join(" * ")).join(" + ");

// The tree as nodes and edges for drawing: branches that share their first factors share those nodes.
// Each node has { id, depth, edge (the factor leading to it), children, cat (leaves only) }.
export function mptNodes(tree) {
  const root = { id: "", depth: 0, edge: null, children: [] };
  for (const { cat, path } of tree.branches) {
    let node = root;
    path.forEach((f, d) => {
      let next = node.children.find(c => c.edge === f && !c.cat);
      if (!next || d === path.length - 1) {
        next = { id: `${node.id}/${f}`, depth: d + 1, edge: f, children: [] };
        node.children.push(next);
      }
      node = next;
    });
    node.cat = cat;
  }
  return root;
}
