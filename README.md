# bmm model explorer

Interactive pages for the measurement models in the [bmm](https://venpopov.com/bmm/) R package.
Each page has sliders for a model's parameters, a plot of the predicted responses, an illustration
of the task, and a panel that shows what the model predicts when the task changes (set size, number
of response candidates) while the parameters stay fixed.

Everything runs in the browser. The densities are small JavaScript ports of bmm's own `d*()`
functions, and a test holds every port to fixtures that bmm itself generated.

Site: <https://gidonfrischkorn.github.io/bmm-explorer/> · Issue that started it: popov-lab/bmm#437

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
needed only to regenerate fixtures. CI runs the node tests and renders the site on every push, deploys
`main` to GitHub Pages, and once a week regenerates the fixtures from the CRAN bmm (and, non-blocking,
from bmm's `develop` branch) so a changed density in bmm shows up here.

## Licence

Code (JavaScript, R, workflows) GPL-2, the licence of bmm whose densities it ports. Page text and
illustrations CC BY 4.0.
