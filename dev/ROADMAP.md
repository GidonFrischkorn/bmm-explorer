# bmm model explorer: roadmap

Status 2026-10-25. One milestone is one working session with its own branch and PR. Each milestone
ships pages that pass the parity test, render, and read well to someone who has not opened bmm.

## Decisions that shape everything

| Decision | Choice | Why |
|---|---|---|
| Runtime | Plain JavaScript + SVG in the browser, no R at page load | A port of four bmm densities matched bmm to 5e-13 and draws a curve in under 30 us; webR would ship 85 packages (brms alone 6.3 MB) before the first curve. |
| Source of truth | bmm's `d*()` functions, through fixtures written by `R/make_fixtures.R` and `node --test` | The explorer may not become a second definition of a model. |
| Oracle version | CRAN bmm blocks, bmm `develop` reports | Pages should match what users have installed; drift in develop should be visible early. |
| Hosting | This repo, GitHub Pages via Actions | Independent of bmm's pkgdown build; pkgdown links here. |
| Page template | Five fixed sections (below) | A reader learns the layout once. |
| First models | M3 simple span, then IMM | The two models with the richest task-settings axis; they fix the categorical and the circular template. |

## Page template

1. **What the model says**: the model in prose and formula, bmm's parameter names.
2. **The task**: an SVG illustration of the trial, driven by the design inputs.
3. **Explore**: coupled slider + number input per parameter, reset, the predicted response
   distribution with the starting curve dashed for comparison.
4. **Across task settings**: the prediction across the design variable with parameters fixed, or
   one paragraph stating that the likelihood has no such variable.
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
| ezdm, cswald, DDM | none | the paragraph; speed/accuracy is a parameter story |

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

Cross-cutting, every milestone: `node --test` green, `quarto render` green, a naive-reader pass over
the new page, a redraw under 16 ms measured in the browser, no AI-pattern vocabulary.

## Out of scope for now

webR or Shiny panels; fitting in the browser; posterior displays; non-English pages; models that
have no `d*()` function in a released bmm.

## Open questions

- SDM's `c` and `kappa` ranges on the slider: the article's priors or the recovery grid?
- Whether the MPT page builds trees from bmm's `mpt_from_string()` syntax (parsed in JS) or ships the
  span tree only.
- DDM: port Navarro and Fuss's series or precompute a density grid from `rtdists` at fixture time.
