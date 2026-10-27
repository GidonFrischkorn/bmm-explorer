# bmm model explorer: roadmap

Status 2026-10-27. One milestone is one working session with its own branch and PR. Each milestone
ships pages that pass the parity test, render, and read well to someone who has not opened bmm.

## Decisions that shape everything

| Decision | Choice | Why |
|---|---|---|
| Runtime | Plain JavaScript + SVG in the browser, no R at page load | A port of four bmm densities matched bmm to 5e-13 and draws a curve in under 30 us; webR would ship 85 packages (brms alone 6.3 MB) before the first curve. |
| Source of truth | bmm's `d*()` functions, through fixtures written by `R/make_fixtures.R` and `node --test` | The explorer may not become a second definition of a model. |
| Oracle version | CRAN bmm blocks, bmm `develop` reports | Pages should match what users have installed; drift in develop should be visible early. |
| Hosting | This repo, GitHub Pages via Actions | Independent of bmm's pkgdown build; pkgdown links here. |
| Page template | A one-screen dashboard, then five fixed sections (below) | Everything that moves is visible at once; a reader learns the layout once. |
| Simulated data (E9, E10) | Draws by inverting the parity-tested density on a fine grid, from fixed uniforms; expected statistics have quadrature fixtures from bmm's `d*()`, sample statistics, the explorer's and those of bmm's `r*()`, lie within 5 Monte Carlo SE of the expected ones | bmm's `rimm()` and `rsdm()` are rejection samplers from `dimm()` and `dsdm()`, so drawing from the tested density is drawing from bmm's model; fixed uniforms let the sample follow a slider. |
| First models | M3 simple span, then IMM | The two models with the richest task-settings axis; they fix the categorical and the circular template. |

## Page template

Dashboard first, one screen at 1280 x 800: task drawing, task settings, parameters (ranges from bmm's
default priors, mean +- 3 SD), predicted distribution with the prior means dashed, and the prediction
across the design variable. Every parameter, task setting and model choice has an (i) note: what it
does in the model and an example from the task drawing. Auto-scaled axes hold their round limit while
the data fill more than half of it and ease to a new limit when they must change (`js/lib/axis.js`).
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
| mixture2p, mixture3p, SDM | none | the paragraph: the model is silent on set size |
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
| E7 | Release | landing page with a model map, pkgdown navbar link (PR to bmm), accessibility pass, mobile check, #437 closed | none |
| E8 | Reader feedback I | (i) notes on every control, axes that hold and ease, on all pages | none |
| E9 | Simulated data, circular | a "simulate N trials" overlay on imm, mixture2p, mixture3p, sdm: histogram of draws, expected vs sample statistics, the `r*()` call | expected statistics by `integrate()` over bmm's `d*()`; `r*()` sample statistics |
| E10 | Simulated data, categorical and RT | the same overlay on m3, mpt, the SDT and the RT pages | as E9 |

Cross-cutting, every milestone: `node --test` green, `quarto render` green, a naive-reader pass over
the new page, a redraw under 16 ms measured in the browser, no AI-pattern vocabulary.

## Out of scope for now

webR or Shiny panels; fitting in the browser; posterior displays; non-English pages; models that
have no `d*()` function in a released bmm.

## Open questions

- SDM's `c` and `kappa` ranges on the slider: the article's priors or the recovery grid?
- Whether the MPT page should later build trees from bmm's `mpt_from_string()` syntax (parsed in JS).
  E4 ships the span tree only, as a branch list that `js/models/mpt.js` evaluates.
- DDM, settled in E6: ported. `rtdists::ddiffusion()` truncates its series with an absolute error target, so in
  the far tails its log density departs from the exact value; the port repeats fast-dm's term counts and
  matches `dddm()` to 4e-15 down to log densities of -675. No grid needed.
