# bmm model explorer: roadmap

Status 2026-10-30. One milestone is one working session with its own branch and PR. Each milestone
ships pages that pass the parity test, render, and read well to someone who has not opened bmm.

## Decisions that shape everything

| Decision | Choice | Why |
|---|---|---|
| Runtime | Plain JavaScript + SVG in the browser, no R at page load | A port of four bmm densities matched bmm to 5e-13 and draws a curve in under 30 us; webR would ship 85 packages (brms alone 6.3 MB) before the first curve. |
| Source of truth | bmm's `d*()` functions, through fixtures written by `R/make_fixtures.R` and `node --test` | The explorer may not become a second definition of a model. |
| Oracle version | CRAN bmm blocks, bmm `develop` reports | Pages should match what users have installed; drift in develop should be visible early. |
| Hosting | This repo, GitHub Pages via Actions | Independent of bmm's pkgdown build; pkgdown links here. |
| Page template | A one-screen dashboard, then five fixed sections (below) | Everything that moves is visible at once; a reader learns the layout once. |
| Simulated data (E9, E10) | Draws by inverting the parity-tested density on a fine grid, from fixed uniforms; expected statistics have quadrature fixtures from bmm's `d*()`, sample statistics, the explorer's and those of bmm's `r*()`, lie within 5 Monte Carlo SE of the expected ones | bmm's `rimm()` and `rsdm()` are rejection samplers from `dimm()` and `dsdm()`, so drawing from the tested density is drawing from bmm's model; fixed uniforms let the sample follow a slider. `rddm()` and `rcswald()` both draw from the Wiener diffusion model (`rtdists::rdiffusion()`), `rcswald()` in either version with `bound` as the separation, so the cswald page samples the diffusion model of its comparison panel; `rezdm()` draws from the sampling distributions `dezdm()` scores, and the page does so by quantile functions. |
| First models | M3 simple span, then IMM | The two models with the richest task-settings axis; they fix the categorical and the circular template. |

## Contract with bmm and bmmtools

Decided 2026-10-30 from the development review of the explorer and bmm's integration roadmap (ADR
0005 in bmm, popov-lab/bmm#633, #634, #635; bmmtools #47). The explorer reads bmm's model
specification and hands study planning and validation evidence to bmmtools; it does not grow a second
copy of either.

| Decision | Choice | Why |
|---|---|---|
| Parameter metadata | From bmm's `model_spec()` through `spec.json`, written by `R/make_fixtures.R`, and a generated `js/lib/spec.js` that every page imports for its parameter names, links and prior ranges; `sdm` keeps an explicit override (see Open questions) | Names and priors cannot drift from bmm; one module serves the sliders, the bmmtools snippet, population mode and page skeletons |
| Links | `js/lib/links.js` ports bmm's twelve element-wise links, forward and inverse, held to a fixture from bmm's `link_transform()`; `softmax` stays page code | Needed to print link-scale values and to draw people from link-scale SDs |
| Study planning | Each page prints a copyable `bmmtools::simulate_recovery()` call at the current values; the call is swapped for `design_check()` and `bmm::simulate_data()` when they ship | bmmtools answers whether a design can estimate the model; the explorer hands over the values |
| Validation evidence | Lives in bmmtools' validation cards; a page links its card, later reads bmmtools' per-model JSON (with a schema version) committed in this repo and refreshed by a workflow | No second home for recovery results; pages stay static |
| Fitting in the browser | Only curve to curve: a model's prediction to another model's prediction, never to data | Model mimicry is the question the comparison view answers; fitting data stays bmm's job |

## Page template

Dashboard first, one screen at 1280 x 800: task drawing, task settings, parameters (ranges from
bmm's default priors, mean +- 3 SD, unless the page's Explore section names another source, as for
SDM), predicted distribution with the prior means dashed, and the prediction across the design
variable. Every parameter, task setting and model choice has an (i) note: what it does in the model
and an example from the task drawing. Auto-scaled axes hold their round limit while the data fill
more than half of it and ease to a new limit when they must change (`js/lib/axis.js`).
Then the five sections:

1. **What the model says**: the model in prose and formula, bmm's parameter names.
2. **The task**: what a trial is and which settings enter the likelihood.
3. **Explore**: how to read the panels and where the ranges come from.
4. **Across task settings**: why the prediction moves with the design variable, or one paragraph
   stating that the likelihood has no such variable.
5. **In bmm**: the `bmm()` call and the `d*()` call with the current values, copyable; links to the
   article and the reference page.

## Which models have a task-settings axis

| Model | Design variables in the likelihood | The "across task settings" panel shows |
|---|---|---|
| M3 (ss, cs), MPT | candidate counts per category, tree | P(correct) and the error split across response-set sizes |
| IMM | non-target positions and distances | the error distribution as items are added around the wheel |
| SDT mAFC, ranking | `m` | accuracy by `m` |
| SDT yes/no, rating | none (number of thresholds only) | ROC; the paragraph |
| mixture2p, SDM | none | the paragraph: the model is silent on set size; the mixture weights (mixture2p) and the activation and normaliser (SDM) in the fourth panel |
| mixture3p | the non-targets' colours and set size (the number of non-target peaks; `p_nt` is shared equally among them) | the weights of the target, of all non-targets, of one non-target and of guessing across set size; the paragraph on parameters that differ between set sizes |
| ezdm | `n_trials` (the sampling spread of the summary statistics, not their expected values) | ±2 SD of the observed accuracy and mean rt across trial counts |
| cswald, DDM | none | the paragraph; speed/accuracy (DDM) and the diffusion-model comparison (cswald) in the fourth panel |

## Milestones

| # | Milestone | Ships | Fixtures |
|---|---|---|---|
| E0 | Scaffold | repo, CI (parity, render, Pages, oracle), shared `js/lib`, `circular.js`, `m3.js`, R fixture script, README, roadmap | circular, m3 |
| E1 | M3 simple span page | full page: candidate tiles illustration, a/c sliders, simple/softmax switch, category bars, P(correct) across response-set sizes, bmm call | m3 (exists) |
| E2 | IMM page | wheel illustration with target and non-targets at their distances, set-size presets 1-8, c/a/b/s/kappa sliders, circular density plot, set-size panel, bmm call | circular (exists) |
| E3 | Circular siblings | mixture2p, mixture3p, SDM pages on the E2 template; SDM parametrisation switch; the "silent on set size" paragraph | circular (exists) |
| E4 | Categorical siblings | M3 complex span, M3 gaussian rule, MPT (Oberauer span tree) pages; needs bmm develop for `dmpt()` | m3 cs/gaussian, mpt |
| E5 | Signal detection | yes/no (ROC, criterion vs bias, sdratio, noise distributions), mAFC (`m` panel), rating | sdt_yn, sdt_mafc, sdt_rating; Gauss-Hermite nodes exported from bmm |
| E6 | Response times | ezdm (forward EZ: drift/bound/ndt to mean, variance, accuracy), cswald, DDM (first-passage series, parity through `dddm()`) | ezdm, cswald, ddm |
| E7a | Accessibility | keyboard, screen-reader summaries, contrast table, tablet and phone-configuration checks, axe per page state in CI (laptop and tablet are the target devices) | none |
| E7b | Release | landing page with a task-first model map, `CITATION.cff`, the policy for new bmm models, README status table, #437 closed (the navbar link is already on bmm's develop) | none |
| E8 | Reader feedback I | (i) notes on every control, axes that hold and ease, on all pages | none |
| E9 | Simulated data, circular | a "simulate N trials" overlay on imm, mixture2p, mixture3p, sdm: histogram of draws, expected vs sample statistics, the `r*()` call | expected statistics by `integrate()` over bmm's `d*()`; `r*()` sample statistics |
| E10a | Simulated data, categorical and SDT | the switch on m3, mpt, sdt_yn, sdt_mafc, sdt_rating: sample shares marked on the bars, sample points on the ROC, the `r*()` call | `r*()` samples of 1e5 trials (`simulate_counts.json`) |
| E10b | Simulated data, response times | the switch on ddm, cswald, ezdm: rt histograms behind the densities, sampled summary statistics on the ezdm bands | as E9, `r*()` for rt and choice |
| E11a | Ranking | `sdt_ranking` page (#13): Gauss-Hermite and Gauss-Laguerre rule switch inside the integral | sdt_ranking, bmm's ranking nodes |
| E11b | Dual process | `sdt_cdp` page (#13): bivariate evidence with a correlation, Remember/Know and confidence | sdt_cdp |
| E12 | Rating versions | `dpsdt` and `metad` versions on the rating page (#14) | sdt_rating versions |
| E13a | MPT preset trees | a tree switch on the MPT page between commonly specified trees: the two-high-threshold recognition model and a source-monitoring model. Each tree is data for the existing evaluator and the page shows its `mpt_tree()` code | `dmpt()` for every preset |
| E13b | Custom specification | readers write their own: an MPT tree in bmm's `mpt_from_string()` syntax (a hand-written parser, no `eval`), and the activation formulas of a custom M3 (`version = "custom"`). Gated on E13a and a maintainer decision | parser fixtures, `dmpt()`, `dm3()` |
| E14 | New bmm models | one page per model new in bmm 1.5.0 and 1.6.0 (#18), once it is on CRAN | per model |
| E15a | Link table (#24) | `js/lib/links.js` (bmm's twelve links, forward and inverse), `scaleOf(link)` in `widget.js` | `links.json` from `link_transform()` |
| E15 | Spec-driven pages | `spec.json`, `scripts/build-spec.mjs` writing `js/lib/spec.js`, `js/lib/priors.js` (prior strings to location and scale), pages import names, links and prior ranges, a static page test, the oracle compares `spec.json` (#22) | `spec.json` from `model_spec()` |
| E16 | Plan a study (#26) | `js/lib/handoff.js`; a copyable `simulate_recovery()` block on every page, values on the link scale as R expressions; the oracle's develop job runs the printed snippets with bmmtools | none (a test evaluates the printed link expressions) |
| E17a | Validation link (#27) | a link to the model's bmmtools validation card in "In bmm", for models that have one | none |
| E17b | Validation numbers (#27) | `data/validation/<model>.json` in bmmtools' schema, a workflow that refreshes them, a "how many trials" line per page | schema-version check |
| E18a | Population mode I (#28) | mixture2p, m3, sdt_yn, ezdm: between-person SD controls on the link scale, twelve simulated people drawn behind the curve, the spread of the page's summary statistic | `population.json`: exact link-normal quantiles; person draws and statistics from bmm's `d*()` |
| E18b | Population mode II (#28) | the other pages, including the softmax case on mixture3p | as E18a |
| E19 | Comparison view (#29) | sdm and mixture2p, imm and mixture3p, m3 and mpt: the alternative's best-approximating prediction overlaid (Nelder-Mead on the divergence between the two predictions, run after the redraw) | `optim.json` from R's `optim()` on the same objective |
| E20 | Contributor guide (#25) | `CONTRIBUTING.md` (page template, port and fixtures, naive-reader and accessibility checks, PR checklist), issue templates including "Companion package change", PR template | none |
| E21 | Page skeletons (#30) | `scripts/new-page.mjs <model>` writes `models/<model>.qmd` and `js/pages/<model>.js` from `spec.js` with TODO markers; E14 starts from it | none |

Shipped by 2026-10-30: E0-E6, E7a, E7b, E8, E9, E10a, E10b. The rest runs in waves; a wave starts when
its condition holds.

| Wave | Milestones | Starts when | Outside this repo |
|---|---|---|---|
| A | E20 first, then E15a, E11a, E13a | now | bmm exports `model_spec()` (popov-lab/bmm#633) |
| B | E15, then E16, E17a, E18a | `model_spec` is in bmm's `develop` NAMESPACE; E17a once a card is published | bmmtools reads the same specification (bmmtools #47) and publishes cards |
| C | E11b, E12, E19, E21, E18b | after wave B | bmmtools' per-model JSON (bmmtools #43) |
| gated | E17b (bmmtools JSON and card site), E14 (bmm 1.5.0 on CRAN), E13b (E13a and a maintainer decision) | | |

Cross-cutting, every milestone: `node --test` green, `quarto render` green, a naive-reader pass over
the new page, a redraw under 16 ms measured in the browser, no AI-pattern vocabulary.

## New bmm models (policy from #18)

- A model gets a deployed page once it is on CRAN.
- A port may start earlier, against fixtures written by `Rscript R/make_fixtures.R` with bmm's
  `develop` branch installed, on a branch that is not deployed. It merges when CRAN has the model and
  the fixtures have been regenerated from the CRAN release.
- A CRAN release that changes a density fails the weekly oracle on the CRAN run, and the fix lands
  before the next deployment.
- Each new page answers the question every page answers: which task settings enter the likelihood
  (for TCC the similarity function and the set size, for the psychometric functions the stimulus level).
- The circular mixture rewrite in bmm's development branches adds versions to `mixture2p` and
  `mixture3p` (`slot` and `slot_averaging`, with a capacity `K` and, in `mixture3p`, a target
  weight); the default `simple` version keeps bmm 1.4's `thetat` and `thetant`. The versions and
  their names are final only with the release. The affected pages then need a version switch, with
  bmm 1.4's parameters as the default.

What the workflows do today: the oracle runs weekly (Monday 06:00 UTC) and on pushes to `main` and
pull requests that touch `R/`, `tests/parity/` or `js/models/`; its CRAN job blocks that workflow,
its develop job reports only. The Pages deployment in `ci.yml` does not wait for it, so a red weekly
oracle does not stop a deployment, and a push to `main` that touches none of those paths does not
run the oracle at all. The "fix lands before the next deployment" rule is held by hand until gating
is decided.

## Out of scope for now

webR or Shiny panels; fitting data in the browser (fitting one model's prediction to another's is
E19); posterior displays; non-English pages; models that have no `d*()` function in a released bmm.

## Open questions

- SDM's `c` and `kappa` ranges on the slider, settled 2026-10-28: the page keeps its own ranges
  (`c` 0-20, `kappa` 0.1-50 on a log slider) and says so. They cover every value the bmm article
  simulates and fits (simulated `c` 2-9, `kappa` 1-8; fitted 95% intervals `c` 1.56-18.7, `kappa`
  0.48-9.8) and keep `c` = 0 reachable. They do not come from the default priors, and the page says
  so (prior mean ± 3 times the scale would give `c` 0.78 to 70, `kappa` 0.61 to 55). No recovery grid
  for `sdm()` to switch to was found in the bmm SDM article, bmm's parameter-recovery reports or
  bmm's tests.
- MPT trees, settled 2026-10-28: no parser for `mpt_from_string()` syntax for now. The page gets a
  tree switch between commonly specified trees first (E13a), and a custom specification later
  (E13b), for the custom M3 as well. See the milestone table.
- DDM, settled in E6: ported. `rtdists::ddiffusion()` truncates its series with an absolute error target, so in
  the far tails its log density departs from the exact value; the port repeats fast-dm's term counts and
  matches `dddm()` to 4e-15 down to log densities of -675. No grid needed.
