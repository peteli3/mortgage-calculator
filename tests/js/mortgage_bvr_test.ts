import { loadMortgageBvr } from "./load_globals.ts";

const TOL = 1.0; // net worth dollars — lock regression, allow tiny float drift

function assertNear(actual: number, expected: number, msg?: string) {
  if (Math.abs(actual - expected) > TOL) {
    throw new Error(
      msg ?? `expected ${expected}, got ${actual} (tol ${TOL})`,
    );
  }
}

/** Buyer ahead at horizon; break-even year exists. */
Deno.test("runBvR buyer ahead at 15yr horizon", async () => {
  const { runBvR } = await loadMortgageBvr();
  const loan = {
    loan_type: "fixed",
    loan_amount: 250000,
    interest: 5.5,
    term_years: 15,
    prop_tax: 300,
    hoa: 0,
    insurance: 1200,
    closing: 6000,
  };
  const a = {
    downPayment: 50000,
    monthlyRent: 3500,
    securityDeposit: 7000,
    rentIncrease: 3,
    renterInsurance: 20,
    marginalRate: 0,
    itemize: false,
    investReturn: 7,
    appreciation: 0.5,
  };
  const r = runBvR(loan, a, "intro_forever");

  if (r.finalBuyNW! <= r.finalRentNW!) {
    throw new Error("expected buyer final NW above renter");
  }
  if (r.breakEvenYear === null) {
    throw new Error("expected break-even year");
  }
  assertNear(r.finalBuyNW!, -172327.36);
  assertNear(r.finalRentNW!, -434443.32);
  if (r.breakEvenYear !== 9) {
    throw new Error(`expected break-even year 9, got ${r.breakEvenYear}`);
  }
});

/** Renter ahead at horizon (high rent vs buy costs, flat appreciation). */
Deno.test("runBvR renter ahead at 10yr horizon", async () => {
  const { runBvR } = await loadMortgageBvr();
  const loan = {
    loan_type: "fixed",
    loan_amount: 400000,
    interest: 7.0,
    term_years: 10,
    prop_tax: 600,
    hoa: 0,
    insurance: 2000,
    closing: 10000,
  };
  const a = {
    downPayment: 80000,
    monthlyRent: 4500,
    securityDeposit: 9000,
    rentIncrease: 4,
    renterInsurance: 25,
    marginalRate: 0,
    itemize: false,
    investReturn: 9,
    appreciation: 0,
  };
  const r = runBvR(loan, a, "intro_forever");

  if (r.finalRentNW! <= r.finalBuyNW!) {
    throw new Error("expected renter final NW above buyer");
  }
  if (r.breakEvenYear !== null) {
    throw new Error("expected no break-even (renter stays ahead)");
  }
  assertNear(r.finalBuyNW!, -259320.7);
  assertNear(r.finalRentNW!, 206816.05);
});
