import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtureSince, assertClose } from "./helpers.mjs";
import { LOG_SINHC_COEF, ezdmMoments3par, ezdmMoments4par, dezdm, dcswald, dddm } from "../../js/models/rt.js";

// rt.json is written by bmm 1.4.1 and later (dezdm(), dcswald(), dddm()); for an older bmm the fixture tests
// are skipped, for a newer one a missing file fails (loadFixtureSince). The checks below that need no fixture
// run either way.
const fx = loadFixtureSince("rt");
if (!fx) {
  test("rt fixtures", { skip: "rt.json absent: the bmm that wrote the fixtures predates dezdm()" }, () => {});
} else {
  const cells = fn => {
    const out = fx.cells.filter(c => c.fn === fn);
    // A density without cells would pass without testing anything.
    if (!out.length) throw new Error(`rt.json: no ${fn} cells`);
    return out;
  };

  test(`the series coefficients are bmm ${fx.bmm_version}'s`, () => {
    assert.deepEqual(LOG_SINHC_COEF, cells("ezdm_log_sinhc_coef")[0].values);
  });

  // The forward EZ map (P(upper), mean and variance of the decision time): absolute 1e-10 on the natural scale.
  // The third and fourth cumulants, which enter dezdm() through the sampling distribution of the observed
  // statistics, are compared relative to |k| at 1e-10 (absolute 1e-10 where bmm's k is exactly 0). Absolute
  // error does not work for them: just above the switch to the closed form (bound 4.48, s 0.7, drift -0.1) k4
  // is 2e4 and divides a difference of cgf derivatives by s^8 w^4 = 2e-7, so the one unit in the last place by
  // which V8's sinh() and R's differ there moves it by 4e-8 (2e-12 relative). Nor does a floor of 1: most
  // cumulants here are below 1, down to k4 = 4e-8 at bound 0.223, where an error of 1e-3 relative would pass.
  // The largest relative error measured against bmm 1.4.1 is 3.6e-12.
  for (const [fn, moments] of [["ezdm_moments_3par", ezdmMoments3par], ["ezdm_moments_4par", ezdmMoments4par]]) {
    for (const cell of cells(fn)) {
      test(`${fn}(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
        for (const [k, ref] of Object.entries(cell.moments)) {
          const got = cell.args.drift.map(drift => moments({ ...cell.args, drift })[k]);
          if (!/^k[34]/.test(k)) { assertClose(got, ref, 1e-10, `${fn} ${k}`); continue; }
          assert.equal(got.length, ref.length, `${fn} ${k}: length`);
          got.forEach((g, i) => assert.ok(Math.abs(g - ref[i]) <= 1e-10 * (ref[i] === 0 ? 1 : Math.abs(ref[i])),
            `${fn} ${k} at drift ${cell.args.drift[i]}: ${g}, bmm ${ref[i]}`));
        }
      });
    }
  }

  // dezdm(): 1e-10 on the log scale. 3par cells hold vectors of summary statistics, 4par cells one row.
  for (const cell of cells("dezdm")) {
    test(`dezdm(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
      const a = cell.args;
      const got = a.version === "3par"
        ? a.mean_rt.map((m, i) => dezdm({ ...a, mean_rt: m, var_rt: a.var_rt[i], n_upper: a.n_upper[i], n_trials: a.n_trials[i] }))
        : [dezdm(a)];
      assertClose(got, [].concat(cell.logd), 1e-10, "dezdm");
    });
  }

  // dcswald(): 1e-10 on the log scale, both versions and responses.
  for (const cell of cells("dcswald")) {
    test(`dcswald(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
      assertClose(dcswald(cell.x, cell.args), cell.logd, 1e-10, "dcswald");
    });
  }

  // dddm(): 1e-10 on the log scale. The port repeats rtdists' series truncation, so the tails match too. Where
  // bmm's density is 0 (zero_x) the port has to give -Infinity, not a finite tail value or NaN.
  for (const cell of cells("dddm")) {
    test(`dddm(${JSON.stringify(cell.args)}) matches bmm ${fx.bmm_version}`, () => {
      assertClose(dddm(cell.x, cell.args), cell.logd, 1e-10, "dddm");
      for (const rt of cell.zero_x) assert.equal(dddm(rt, cell.args), -Infinity, `dddm at rt ${rt}`);
    });
  }
  test("rt.json has dddm cells where bmm's density is 0", () => {
    assert.ok(cells("dddm").some(c => c.zero_x.length));
  });
}

// Before ndt nothing has happened: no density, and a censored simple-cswald response has probability 1.
test("rt at or before ndt", () => {
  const p = { drift: 1, bound: 1, ndt: 0.3 };
  assert.equal(dddm(0.3, { ...p, response: 1 }), -Infinity);
  assert.equal(dcswald(0.2, { ...p, response: 1 }), -Infinity);
  assert.equal(dcswald(0.2, { ...p, response: 0 }), 0);
  assert.equal(dcswald(0.2, { ...p, response: 0, version: "crisk" }), -Infinity);
});
