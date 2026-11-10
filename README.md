# bmm model explorer

Interactive pages for the measurement models in the [bmm](https://venpopov.com/bmm/) R package.
Each page has sliders for a model's parameters, a plot of the predicted responses, an illustration
of the task, and a panel that shows what the model predicts when the task changes (set size, number
of response candidates) while the parameters stay fixed.

Everything runs in the browser. The densities are small JavaScript ports of bmm's own `d*()`
functions, and a test holds every port to fixtures that bmm itself generated.

Site: <https://www.gfrischkorn.org/bmm-explorer/> · Issue that started it: popov-lab/bmm#437

## Status

Twelve model pages are live. A page for a model is deployed once the model is on CRAN.

| Model | Page | Task setting in the likelihood |
|---|---|---|
| `m3` (simple and complex span) | [models/m3](models/m3.qmd) | candidate counts per category |
| `mpt` (span-task tree) | [models/mpt](models/mpt.qmd) | candidate counts through the guessing rates |
| `imm` | [models/imm](models/imm.qmd) | non-target positions and distances |
| `mixture2p`, `mixture3p`, `sdm` | [mixture2p](models/mixture2p.qmd), [mixture3p](models/mixture3p.qmd), [sdm](models/sdm.qmd) | none for `mixture2p` and `sdm`; for `mixture3p` the non-targets' colours and their number (set size) |
| `sdt_yn`, `sdt_mafc`, `sdt_rating` | [sdt_yn](models/sdt_yn.qmd), [sdt_mafc](models/sdt_mafc.qmd), [sdt_rating](models/sdt_rating.qmd) | none for `sdt_yn`; `m` for `sdt_mafc`; the number of thresholds for `sdt_rating` |
| `ezdm`, `cswald`, `ddm` | [ezdm](models/ezdm.qmd), [cswald](models/cswald.qmd), [ddm](models/ddm.qmd) | trials per cell for `ezdm`; none for `cswald` and `ddm` |

Next: a contributor guide; the parameter lists and slider ranges read from bmm's model specification
instead of typed by hand; a copyable [bmmtools](https://github.com/GidonFrischkorn/bmmtools) call that
plans a study from the current values; a link from each page to its validation card; a population
mode that draws a set of people around the population curve; a comparison view for models that
mimic each other; more signal detection models (`sdt_ranking`, `sdt_cdp`), the rating versions, a
choice between commonly specified trees on the MPT page, and the models new in bmm 1.5.0 and 1.6.0.
The order, the waves and the rule for new models are in [`dev/ROADMAP.md`](dev/ROADMAP.md).

## Cite

`CITATION.cff` names this explorer and the bmm paper. If a page helps your work, cite both.

## Layout

| Path | What |
|---|---|
| `models/<model>.qmd` | one page per model, same five sections on every page |
| `js/models/<family>.js` | the ported densities: pure functions, bmm's argument names, log scale |
| `js/pages/<model>.js` | wires one page's controls, plot and illustration |
| `js/lib/` | `math.js` (Bessel, logSumExp), `widget.js` (coupled slider + number inputs), `plot.js` (SVG axes, lines, bars) |
| `R/make_fixtures.R` | writes `tests/parity/fixtures/*.json` from the installed bmm |
| `tests/parity/*.test.mjs` | `node --test`: every JS density against the fixtures, tolerance in the test |
| `dev/ROADMAP.md` | milestones and what each one ships |

## Develop

```bash
quarto preview                          # the site, live reload
node --test                             # parity tests against the committed fixtures
Rscript R/make_fixtures.R tests/parity/fixtures   # regenerate fixtures from the installed bmm
```

There are no npm dependencies. Node 20 or newer and Quarto 1.5 or newer are enough; R with bmm is
needed only to regenerate fixtures. CI runs the node tests and renders the site on pull requests and
on pushes to `main`, deploys `main` to GitHub Pages, and once a week regenerates the fixtures from the
CRAN bmm (and, non-blocking, from bmm's `develop` branch) so a changed density in bmm shows up here.

## Licence

Code (JavaScript, R, workflows) GPL-2, the licence of bmm whose densities it ports. Page text and
illustrations CC BY 4.0.
