<!-- Describe the result: what the page or change does for a reader. Details of each check are in CONTRIBUTING.md, "Checks before a pull request". -->

**What changes**

**Checks** (tick each one you ran; leave a line unticked and say why if you could not)

- [ ] `node --test` passes
- [ ] fixtures regenerated from CRAN bmm (version: ) (`Rscript R/make_fixtures.R`) agree with the committed ones at 1e-10 (`compare-fixtures.mjs`), and `node --test` passes against them
- [ ] `quarto render` finishes without a warning
- [ ] in a 1280 x 713 viewport (a 1280 x 800 screen), with the simulate switch on and off, the dashboard fits, nothing scrolls sideways, and a redraw takes under 16 ms
- [ ] after `node tests/a11y/fetch-axe.mjs`, `node tests/a11y/run-axe.mjs` passes in every state listed in `tests/a11y/states.json` (no serious or critical violation, no failed check)
- [ ] every control works with the keyboard alone, and the focus ring shows at every step
- [ ] someone who had not seen the page read it, and what confused them is fixed in the page
- [ ] the R code printed on the page runs on CRAN bmm and returns the value the page gives, where it gives one
- [ ] a new page is in `tests/a11y/states.json` and in every place step 8 of "Adding a page" in CONTRIBUTING.md lists (`index.qmd`, `_quarto.yml`, `ci.yml`, `README.md`, `dev/ROADMAP.md`)
- [ ] no local information in this text (paths, unpushed branches, commit hashes, notes about who or what produced a change)
