<!-- Describe the result: what the page or change does for a reader. Details of each check are in CONTRIBUTING.md, "Checks before a pull request". -->

**What changes**

**Checks** (tick each one you ran; leave a line unticked and say why if you could not)

- [ ] `node --test` passes
- [ ] fixtures regenerated from CRAN bmm <version> (`Rscript R/make_fixtures.R`) and agree with the committed ones at 1e-10 (`compare-fixtures.mjs`)
- [ ] `quarto render` finishes without a warning
- [ ] at 1280 x 800 the dashboard fits one screen, nothing scrolls sideways, and a redraw takes under 16 ms
- [ ] axe-core finds no serious or critical violation in any state listed in `tests/a11y/states.json`
- [ ] every control works with the keyboard alone
- [ ] someone who had not seen the page read it, and what confused them is fixed in the page
- [ ] the R code printed on the page runs on CRAN bmm
- [ ] a new page is in `tests/a11y/states.json`, the landing page map, the sidebar and the render list in `ci.yml`
- [ ] no local information in this text (paths, unpushed branches, commit hashes, notes about who or what produced a change)
