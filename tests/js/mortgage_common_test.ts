import { loadMortgageCommon } from "./load_globals.ts";

const TOL = 0.01;

function assertNear(actual: number, expected: number, msg?: string) {
  if (Math.abs(actual - expected) > TOL) {
    throw new Error(
      msg ?? `expected ${expected}, got ${actual} (tol ${TOL})`,
    );
  }
}

Deno.test("computePayment fixed 30yr", async () => {
  const { computePayment } = await loadMortgageCommon();
  assertNear(computePayment(300000, 6.5, 360), 1896.2);
});

Deno.test("computePayment zero rate", async () => {
  const { computePayment } = await loadMortgageCommon();
  const p = computePayment(100000, 0, 120);
  if (Math.abs(p - 100000 / 120) > TOL) {
    throw new Error(`expected ${100000 / 120}, got ${p}`);
  }
});

Deno.test("computePayment edge zero balance", async () => {
  const { computePayment } = await loadMortgageCommon();
  if (computePayment(0, 5, 360) !== 0) {
    throw new Error("expected 0 payment for zero balance");
  }
});

Deno.test("buildRateSchedule fixed loan flat", async () => {
  const { buildRateSchedule } = await loadMortgageCommon();
  const loan = {
    loan_type: "fixed",
    term_years: 30,
    interest: 6.5,
  };
  const rates = buildRateSchedule(loan, "worst");
  if (rates.length !== 360 || rates.some((r) => r !== 6.5)) {
    throw new Error("fixed schedule should be 360 months at 6.5%");
  }
});

Deno.test("buildRateSchedule ARM worst first adjustment", async () => {
  const { buildRateSchedule } = await loadMortgageCommon();
  const loan = {
    loan_type: "arm",
    term_years: 30,
    interest: 6.0,
    arm: {
      fixed_period_years: 7,
      adjustment_interval_months: 6,
      margin: 2.75,
      cap_initial: 2.0,
      cap_periodic: 1.0,
      cap_lifetime: 5.0,
    },
  };
  const rates = buildRateSchedule(loan, "worst");
  const fixedEnd = 7 * 12;
  if (rates[fixedEnd - 1] !== 6.0) {
    throw new Error("last fixed month should be intro rate");
  }
  if (rates[fixedEnd] !== 8.0) {
    throw new Error(`first adj should be 8.0, got ${rates[fixedEnd]}`);
  }
  if (rates[rates.length - 1] > 11.0 + TOL) {
    throw new Error("rate should respect lifetime cap ceiling");
  }
});

Deno.test("calculateAmortizationV2 fixed 30yr", async () => {
  const { calculateAmortizationV2 } = await loadMortgageCommon();
  const loan = {
    loan_type: "fixed",
    loan_amount: 300000,
    interest: 6.5,
    term_years: 30,
  };
  const r = calculateAmortizationV2(
    loan,
    "intro_forever",
    new Date(2025, 0, 1),
    [],
  );
  if (r.schedule.length !== 360) {
    throw new Error(`expected 360 months, got ${r.schedule.length}`);
  }
  const last = r.schedule[r.schedule.length - 1];
  if (last.balance > 0.02) {
    throw new Error(`final balance should be ~0, got ${last.balance}`);
  }
  if (r.totalInterest <= 0) {
    throw new Error("expected positive total interest");
  }
});

Deno.test("normalizeLoan and armProductLabel", async () => {
  const { normalizeLoan, armProductLabel } = await loadMortgageCommon();
  const fixed = normalizeLoan({ loan_amount: 100 });
  if (fixed.loan_type !== "fixed") {
    throw new Error("missing loan_type should default to fixed");
  }
  const arm = normalizeLoan({
    loan_type: "arm",
    arm: { fixed_period_years: 7, adjustment_interval_months: 6 },
  });
  const label = armProductLabel(arm);
  if (label !== "ARM 7/6mo") {
    throw new Error(`expected ARM 7/6mo, got ${label}`);
  }
});
