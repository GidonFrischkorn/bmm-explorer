// The span tree of the MPT page, as data for js/models/mpt.js: an item is in memory (Pi) and bound to its
// position (Pb), or in memory without its position (guess among the list items on screen), or not in
// memory (guess among all candidates). R/make_fixtures.R builds the same tree with mpt_tree(); the test
// compares the branch strings.
export const SPAN_TREE = {
  name: "span",
  categories: ["corr", "other", "npl"],
  parameters: ["Pi", "Pb"],
  // Guessing rates follow from the response set: 1 correct, n_other other list items, n_npl lures.
  covariates: {
    gl_corr: ({ n_other }) => 1 / (1 + n_other),
    gl_other: ({ n_other }) => n_other / (1 + n_other),
    g_corr: ({ n_other, n_npl }) => 1 / (1 + n_other + n_npl),
    g_other: ({ n_other, n_npl }) => n_other / (1 + n_other + n_npl),
    g_npl: ({ n_other, n_npl }) => n_npl / (1 + n_other + n_npl)
  },
  branches: [
    { cat: "corr", path: ["Pi", "Pb"] },
    { cat: "corr", path: ["Pi", "1-Pb", "gl_corr"] },
    { cat: "other", path: ["Pi", "1-Pb", "gl_other"] },
    { cat: "corr", path: ["1-Pi", "g_corr"] },
    { cat: "other", path: ["1-Pi", "g_other"] },
    { cat: "npl", path: ["1-Pi", "g_npl"] }
  ]
};

// M3, simple rule, b = 0.1, ss activations: for one response set, the a and c that give the same
// category probabilities as Pi and Pb. With S the summed activation and N the number of candidates,
// 1 - Pi = N b / S (the share of b), Pi Pb = c / S, Pi (1 - Pb) = (1 + n_other) a / S.
export function spanTreeToM3({ Pi, Pb, n_other, n_npl }, b = 0.1) {
  const S = (1 + n_other + n_npl) * b / (1 - Pi);
  return { a: (1 - Pb) * Pi * S / (1 + n_other), c: Pb * Pi * S };
}
