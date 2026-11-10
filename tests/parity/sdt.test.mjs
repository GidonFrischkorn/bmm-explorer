import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtureSince, assertClose, assertCloseRel, versionAtLeast } from "./helpers.mjs";
import {
  DISTS, ynLogPOld, ynLogPNew, dsdtYn, biasToCriterion, sdtD, sdtCriterion, sdtBias, mafcLogitPc, mafcPc,
  dsdtMafc, mafcMatchD, ratingLogProbs, dsdtRating, parsimoniousThresholds, toLogDistance, fromLogDistance,
  evidencePdf, maxCompetitorPdf, ynRoc, rankingRules, rankingProbs, dsdtRanking, rankingLogitFirst, rankingMatchD
} from "../../js/models/sdt.js";
import { integrateExp, split100 } from "../../js/lib/math.js";

// Log probabilities and log densities, 1e-10 absolute up to |value| 1e3 and 1e-13 relative beyond (assertCloseRel):
// the typed tail cells reach log P = -7.5e177 under Gumbel noise. The m-AFC quadrature runs on bmm's own nodes, so it is
// held to the same tolerance.
const TOL = 1e-10;
const fx = loadFixtureSince("sdt");
const nodes = loadFixtureSince("nodes");
const rules = nodes && { gh: nodes.cells.find(c => c.fn === ".mafc_gh"), gl: nodes.cells.find(c => c.fn === ".mafc_gl") };
// A fixture directory from a bmm without the SDT models has neither file; one without the other is an error.
if (!fx !== !rules) throw new Error("sdt.json and the m-AFC rules in nodes.json must come together");
// Ranking ships in bmm from 1.4.1 on (R/make_fixtures.R stops a newer bmm without it), with its rules in nodes.json; an
// older bmm's sdt.json has neither, and the ranking tests skip.
const rankRules = nodes && rankingRules(nodes.cells);
const rankCells = fx?.cells.filter(c => c.fn === "dsdt_ranking") ?? [];
const rankSkip = fx && !(rankRules && rankCells.length) && !versionAtLeast(fx.bmm_version, "1.4.1") && `bmm ${fx.bmm_version} has no dsdt_ranking()`;
if (fx && !rankSkip && !(rankRules && rankCells.length)) throw new Error("sdt.json's ranking cells and nodes.json's ranking rules must come together");
const cells = fn => {
  const out = fx.cells.filter(c => c.fn === fn);
  if (!out.length) throw new Error(`sdt.json has no ${fn} cells`);
  return out;
};
const rows = args => args.stimulus?.length ?? args.m?.length ?? args.d?.length ?? args.fa_rate.length;
const row = (args, i) => Object.fromEntries(Object.entries(args).map(([k, v]) => [k, Array.isArray(v) ? v[i] : v]));
const each = (args, f) => Array.from({ length: rows(args) }, (_, i) => f(row(args, i)));

if (fx) {
  for (const cell of cells("dsdt_yn")) {
    test(`dsdt_yn (${cell.args.dist}) matches bmm ${fx.bmm_version}`, () => {
      const lo = each(cell.args, r => ynLogPOld(r, r.stimulus));
      assertCloseRel(lo, cell.log_p_old, TOL, "log P(old)");
      assertCloseRel(each(cell.args, r => ynLogPNew(r, r.stimulus)), cell.log_p_new, TOL, "log P(new)");
      assertCloseRel(each(cell.args, r => dsdtYn(37, 100, r.stimulus, r)), cell.logd_37, TOL, "dsdt_yn(37, 100)");
    });
  }
  for (const cell of cells("dsdt_yn_tail")) {
    test(`dsdt_yn at a criterion of +-1000 (${cell.args.dist}) matches bmm ${fx.bmm_version}, -Inf included`, () => {
      assertCloseRel(each(cell.args, r => ynLogPOld(r, r.stimulus)), cell.log_p_old, TOL, "log P(old)");
      assertCloseRel(each(cell.args, r => ynLogPNew(r, r.stimulus)), cell.log_p_new, TOL, "log P(new)");
      // all new and all old: the zero count's term drops out even where its log P is -Inf
      assertCloseRel(each(cell.args, r => dsdtYn(0, 10, r.stimulus, r)), cell.logd_0, TOL, "dsdt_yn(0, 10)");
      assertCloseRel(each(cell.args, r => dsdtYn(10, 10, r.stimulus, r)), cell.logd_10, TOL, "dsdt_yn(10, 10)");
    });
  }
  for (const cell of cells("dsdt_yn_bias")) {
    test(`dsdt_yn with bias (${cell.args.dist}) matches bmm ${fx.bmm_version}`, () => {
      const lo = each(cell.args, r => ynLogPOld({ ...r, criterion: biasToCriterion(r.bias, r.d, r.sdratio) }, r.stimulus));
      assertCloseRel(lo, cell.log_p_old, TOL, "log P(old)");
    });
  }
  for (const cell of cells("sdt_d")) {
    test(`sdt_d, sdt_criterion, sdt_bias (${cell.args.dist}) match bmm ${fx.bmm_version}`, () => {
      const { dist } = cell.args;
      assertCloseRel(each(cell.args, r => sdtD(r.hit_rate, r.fa_rate, dist)), cell.d, TOL, "sdt_d");
      assertCloseRel(each(cell.args, r => sdtCriterion(r.hit_rate, r.fa_rate, dist)), cell.criterion, TOL, "sdt_criterion");
      assertCloseRel(each(cell.args, r => sdtBias(r.hit_rate, r.fa_rate, dist)), cell.bias, TOL, "sdt_bias");
    });
  }
  for (const cell of cells("dsdt_mafc")) {
    test(`dsdt_mafc (${cell.args.dist}) matches bmm ${fx.bmm_version}`, () => {
      const { dist } = cell.args;
      // log P(correct) and log P(error), as dsdt_mafc() of one trial returns them
      assertCloseRel(each(cell.args, r => dsdtMafc(1, 1, r.m, r.d, dist, rules)), cell.log_pc, TOL, "log P(correct)");
      assertCloseRel(each(cell.args, r => dsdtMafc(0, 1, r.m, r.d, dist, rules)), cell.log_1m_pc, TOL, "log P(error)");
      assertCloseRel(each(cell.args, r => dsdtMafc(r.n_correct, 100, r.m, r.d, dist, rules)), cell.logd, TOL, "dsdt_mafc");
    });
  }
  for (const cell of cells("dsdt_rating")) {
    const { thresholds, dist } = cell.args;
    test(`dsdt_rating K = ${thresholds.length + 1} [${thresholds.map(t => +t.toFixed(2))}] (${dist}) matches bmm ${fx.bmm_version}`, () => {
      // bmm returns NA (read as NaN) for a category whose bounds both underflow, where its own comment means -Inf:
      // log1m_exp()'s ifelse() turns -Inf - -Inf into NA, which the is.nan() guard of .sdt_category_log_probs()
      // misses. The port returns the -Inf bmm intends; such a category has no count, so the densities agree.
      const ref = cell.logp.map(v => Number.isNaN(v) ? -Infinity : v);
      assertCloseRel(each(cell.args, r => ratingLogProbs(thresholds, r, r.stimulus)).flat(), ref, TOL, "category log P");
      assertCloseRel(each(cell.args, r => dsdtRating(r.counts, r.stimulus, thresholds, r)), cell.logd, TOL, "dsdt_rating");
    });
  }
  for (const cell of cells("thresholds_log_distance")) {
    const { n_ratings: K, thresholds } = cell.args;
    test(`rating thresholds K = ${K} as log_distance parameters and back, as bmm builds them`, () => {
      const ld = toLogDistance(thresholds);
      assertClose([ld.criterion, ...ld.deltas], [cell.criterion, ...cell.deltas], 1e-12, "criterion, deltas");
      assertClose(fromLogDistance(cell.criterion, cell.deltas), cell.rebuilt, 1e-12, "bmm's log_distance thresholds");
      assertClose(parsimoniousThresholds(K), cell.parsimonious_start, 1e-12, "parsimonious thresholds at the prior means");
    });
  }

  // Not bmm functions: what the pages draw and solve, checked against the tested functions above.
  test("the drawn densities are the model's: each integrates to 1, and integrating them gives P(old) and P(correct)", () => {
    for (const dist of Object.keys(DISTS)) {
      const logf = f => xs => xs.map(x => Math.log(f(x)));
      const one = integrateExp(logf(DISTS[dist].pdf), -40, 40, 8000);
      assert.ok(Math.abs(one - 1) < 1e-9, `${dist}: density integrates to ${one}`);
      const pars = { d: 1.7, criterion: 0.4, sdratio: 1.6, dist };
      const hit = integrateExp(logf(x => evidencePdf(x, pars, 1)), pars.criterion, 60, 8000);
      assert.ok(Math.abs(hit - Math.exp(ynLogPOld(pars, 1))) < 1e-9, `${dist}: hit rate ${hit}`);
      for (const m of [2, 5, 8]) {
        const pc = integrateExp(logf(x => DISTS[dist].pdf(x - 1.3) * Math.exp((m - 1) * DISTS[dist].lcdf(x))), -40, 40, 8000);
        assert.ok(Math.abs(pc - mafcPc(1.3, m, dist, rules)) < 1e-6, `${dist}, m = ${m}: P(correct) ${pc} vs ${mafcPc(1.3, m, dist, rules)}`);
        const comp = integrateExp(logf(x => maxCompetitorPdf(x, m, dist)), -40, 40, 8000);
        assert.ok(Math.abs(comp - 1) < 1e-9, `${dist}, m = ${m}: competitor density integrates to ${comp}`);
      }
    }
  });
  test("mafcMatchD finds the d with the target P(correct) under every distribution", () => {
    for (const dist of Object.keys(DISTS)) for (const m of [2, 4, 10]) for (const target of [-3, 0.2, 4]) {
      const d = mafcMatchD(target, m, dist, rules);
      assert.ok(Math.abs(mafcLogitPc(d, m, dist, rules) - target) < 1e-9, `${dist}, m = ${m}, logit ${target}: d = ${d}`);
    }
  });
  test("mafcMatchD reaches the logits of d typed far outside the slider, and gives NaN where no d reaches them", () => {
    const dists = Object.keys(DISTS);
    for (const from of dists) for (const m of [2, 3, 10]) for (const typed of [-40, -12, 15, 25]) {
      const target = mafcLogitPc(typed, m, from, rules);
      for (const dist of dists) {
        const d = mafcMatchD(target, m, dist, rules);
        assert.ok(Math.abs(mafcLogitPc(d, m, dist, rules) - target) <= 1e-8 * Math.max(1, Math.abs(target)),
          `${from} d = ${typed} -> ${dist}, m = ${m}, logit ${target}: d = ${d}`);
      }
    }
    // normal's quadrature logit is Inf from d = 48.25; gumbel_min's is -Inf below d = -709.78, where exp(-d)
    // overflows, and no lower than about -6374 above it at m = 10, short of normal's -1.6e5 at d = -200.
    for (const dist of dists) assert.ok(Number.isNaN(mafcMatchD(mafcLogitPc(50, 10, "normal", rules), 10, dist, rules)), dist);
    assert.equal(mafcLogitPc(-709.8, 10, "gumbel_min"), -Infinity);
    assert.ok(mafcLogitPc(-709.7, 10, "gumbel_min") > mafcLogitPc(-200, 10, "normal", rules));
    assert.ok(Number.isNaN(mafcMatchD(mafcLogitPc(-200, 10, "normal", rules), 10, "gumbel_min", rules)));
  });
  test("the ROC runs from (1, 1) to (0, 0) without increasing, and passes through the yes/no point", () => {
    for (const dist of Object.keys(DISTS)) for (const sdratio of [0.407, 1, 2.46]) {
      const pars = { d: 1.5, sdratio, dist }, roc = ynRoc(pars);
      roc.slice(1).forEach(([fa, h], i) => assert.ok(fa <= roc[i][0] && h <= roc[i][1], `${dist} ${sdratio}: point ${i + 1}`));
      const pt = [0.3, 1].map(c => [Math.exp(ynLogPOld({ ...pars, criterion: c }, 0)), Math.exp(ynLogPOld({ ...pars, criterion: c }, 1))]);
      // linear interpolation between the bracketing ROC points, hit rate at the point's false-alarm rate
      for (const [fa, h] of pt) {
        const j = roc.findIndex(([f]) => f <= fa);
        const [f0, h0] = roc[j - 1], [f1, h1] = roc[j];
        const hi = h1 + (h0 - h1) * (fa - f1) / (f0 - f1 || 1);
        assert.ok(Math.abs(hi - h) < 2e-3, `${dist} ${sdratio}: ROC at FA ${fa} gives ${hi}, model ${h}`);
      }
    }
  });
  // Ranking: per cell one m and dist, rows of d and sdratio. log P per rank (row by row in logp) and dsdt_ranking() at
  // the predicted counts of 100 trials. Normal noise runs on bmm's quadrature nodes, the same sums in the same order,
  // so it is held to TOL as the closed form is, not to the rules' own error against the integral (6e-10 and 2.4e-10 in
  // bmm's comments). Where a rank's probability underflows to 0, bmm's log density at its zero count is NaN, and the
  // port's must be too.
  for (const cell of rankCells) {
    const { m, dist } = cell.args;
    const sdr = dist === "normal" ? `, sdratio ${Math.min(...cell.args.sdratio)} to ${Math.max(...cell.args.sdratio)}` : "";
    test(`dsdt_ranking m = ${m} (${dist}), d ${Math.min(...cell.args.d)} to ${Math.max(...cell.args.d)}${sdr} matches bmm ${fx.bmm_version}`, () => {
      const lp = each(cell.args, r => rankingProbs(r.d, m, r.sdratio, dist, rankRules).map(Math.log)).flat();
      assertCloseRel(lp, cell.logp, TOL, "log P(rank)");
      const ld = each(cell.args, r => dsdtRanking(r.counts, m, r.d, r.sdratio, dist, rankRules));
      cell.logd.forEach((v, i) => { if (Number.isNaN(v)) assert.ok(Number.isNaN(ld[i]), `row ${i + 1}: bmm gives NaN, the port ${ld[i]}`); });
      const fin = cell.logd.map((v, i) => [ld[i], v]).filter(([, v]) => !Number.isNaN(v));
      assertCloseRel(fin.map(([g]) => g), fin.map(([, v]) => v), TOL, "dsdt_ranking(predicted counts of 100)");
    });
  }
  test("the ranking rules switch where bmm's do: Gauss-Hermite at sdratio 1, Gauss-Legendre from the next double up", { skip: rankSkip }, () => {
    // the two rules meet at 1 within 1.5e-10 (bmm's comment); a port that switched on the other side would move
    // the probabilities at 1 by that much, below TOL, so the switch is pinned on the rules themselves
    const above = 1 + 2 ** -52;
    for (const m of [2, 5, 8]) {
      const gh = rankingProbs(1.3, m, 1, "normal", rankRules), gl = rankingProbs(1.3, m, above, "normal", rankRules);
      const onlyGl = rankingProbs(1.3, m, above, "normal", new Map([[m, { gh: { nodes: [], weights: [] }, gl: rankRules.get(m).gl }]]));
      assert.deepEqual(gl, onlyGl, `m = ${m}: sdratio 1 + 2^-52 integrates on the Legendre rule`);
      assert.throws(() => rankingProbs(1.3, m, 1, "normal", new Map([[m, { gh: rankRules.get(m).gh }]])), /quadrature rules/);
      assert.ok(Math.max(...gh.map((p, i) => Math.abs(p - gl[i]))) < 1.5e-10, `m = ${m}: the rules meet at 1`);
    }
  });
  test("rank probabilities sum to 1, give chance 1/m at d = 0, and at m = 2 equal the m-AFC P(correct)", { skip: rankSkip }, () => {
    for (const dist of ["gumbel_min", "normal"]) for (const m of [2, 4, 8]) for (const sdratio of [0.407, 1, 2.46]) {
      const p0 = rankingProbs(0, m, sdratio, dist, rankRules);
      for (const d of [-2, 1, 4]) {
        const p = rankingProbs(d, m, sdratio, dist, rankRules);
        assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-14, `${dist} m ${m} d ${d}: sum`);
      }
      // with equal SDs, d = 0 puts the target among m exchangeable items
      if (sdratio === 1 || dist === "gumbel_min") p0.forEach(v => assert.ok(Math.abs(v - 1 / m) < 1e-10, `${dist} m ${m}: ${v}`));
    }
    for (const d of [-2, 0.5, 1, 4]) {
      assert.ok(Math.abs(rankingProbs(d, 2, 1, "gumbel_min")[0] - mafcPc(d, 2, "gumbel_min")) < 1e-14, `gumbel_min d ${d}`);
      assert.ok(Math.abs(rankingProbs(d, 2, 1, "normal", rankRules)[0] - mafcPc(d, 2, "normal")) < 1e-9, `normal d ${d}`);
    }
  });
  test("the page's predicted counts of 100 trials are the fixtures' (split100 in math.js and in R/make_fixtures.R)", { skip: rankSkip }, () => {
    for (const cell of rankCells) each(cell.args, r => r).forEach((r, i) =>
      assert.deepEqual(split100(cell.logp.slice(i * cell.args.m, (i + 1) * cell.args.m).map(Math.exp)), r.counts, `${cell.args.dist} m ${cell.args.m} row ${i + 1}`));
  });
  test("logit P(rank 1) is log P(rank 1) - log of the other ranks' sum, from bmm's probabilities", { skip: rankSkip }, () => {
    for (const cell of rankCells) {
      const { m, dist } = cell.args;
      const want = each(cell.args, r => r).map((_, i) => {
        const lp = cell.logp.slice(i * m, (i + 1) * m);
        return lp[0] - Math.log(lp.slice(1).reduce((s, v) => s + Math.exp(v), 0));
      });
      const got = each(cell.args, r => rankingLogitFirst(r.d, m, r.sdratio, dist, rankRules));
      const keep = want.map((w, i) => [got[i], w]).filter(([, w]) => Number.isFinite(w));
      assertCloseRel(keep.map(([g]) => g), keep.map(([, w]) => w), 1e-9, `${dist} m ${m}: logit P(rank 1)`);
    }
  });
  test("rankingMatchD finds the d with the target P(rank 1), also for d typed far outside the slider", { skip: rankSkip }, () => {
    const pairs = [["gumbel_min", "normal"], ["normal", "gumbel_min"]];
    for (const [from, to] of pairs) for (const m of [2, 4, 8]) for (const d of [-30, -2, 0, 1, 4, 30, 300]) for (const s of [0.407, 1, 2.46]) {
      if (from === "gumbel_min" && s !== 1) continue;
      const target = rankingLogitFirst(d, m, s, from, rankRules);
      const md = rankingMatchD(target, m, 1, to, rankRules);
      // normal's logit is Inf from about d = 38 at m = 2 (log Phi(-x) underflows nowhere, but 1 - P(rank 1) does):
      // a target beyond that has no match
      const top = rankingLogitFirst(1e3, m, 1, to, rankRules);
      // a source whose P(rank 1) rounds to 1 (normal at d 300) has an infinite logit, which no d matches
      if (!Number.isFinite(target) || (Number.isFinite(top) && target > top)) { assert.ok(Number.isNaN(md), `${from} d ${d} m ${m}: ${md}`); continue; }
      assert.ok(Number.isFinite(md), `${from} d ${d} s ${s} m ${m} -> ${to}: no match for logit ${target}`);
      const back = rankingLogitFirst(md, m, 1, to, rankRules);
      assert.ok(Math.abs(back - target) <= 1e-8 * Math.max(1, Math.abs(target)), `${from} d ${d} s ${s} m ${m} -> ${to}: ${back} vs ${target}`);
    }
    assert.ok(Number.isNaN(rankingMatchD(Infinity, 4, 1, "normal", rankRules)));
  });
  test("dsdtRanking stops where bmm's dsdt_ranking() does", { skip: rankSkip }, () => {
    assert.throws(() => dsdtRanking([40, 30, 20], 4, 1), /exceed the number of count columns/);
    assert.throws(() => dsdtRanking([40, -1, 20, 41], 4, 1), /non-negative/);
    assert.throws(() => dsdtRanking([40, 60], 1, 1), /integer >= 2/);
    assert.throws(() => dsdtRanking([40, 60], 2, 1, 0, "normal", rankRules), /sdratio must be positive/);
    assert.throws(() => dsdtRanking([40, 60, 5], 2, 1), /beyond the row's set size/);
  });
}
