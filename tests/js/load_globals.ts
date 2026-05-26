/** Load classic global-scope JS files for Deno tests (no ES module exports in prod). */

const ROOT = new URL("../../", import.meta.url);

export type MortgageCommonGlobals = {
  computePayment: (
    balance: number,
    annualRatePct: number,
    remainingMonths: number,
  ) => number;
  buildRateSchedule: (loan: Record<string, unknown>, scenario: string) => number[];
  calculateAmortizationV2: (
    loan: Record<string, unknown>,
    scenario: string,
    startDate: Date,
    extraPayments: unknown[],
  ) => {
    schedule: Array<{ balance: number; payment: number }>;
    totalInterest: number;
    payoffMonth: number;
    monthlyPayment: number;
  };
  computeLoanScenarioStats: (loan: Record<string, unknown>) => {
    introPi: number;
    minPi: number;
    maxPi: number;
  };
  normalizeLoan: (loan: Record<string, unknown>) => Record<string, unknown>;
  armProductLabel: (loan: Record<string, unknown>) => string;
  defaultArm: () => Record<string, unknown>;
  ARM_SCENARIOS: string[];
};

export type MortgageBvrGlobals = {
  runBvR: (
    loan: Record<string, unknown>,
    a: Record<string, unknown>,
    scenario?: string,
  ) => {
    yearly: unknown[];
    breakEvenYear: number | null;
    termYears: number;
    finalBuyNW: number;
    finalRentNW: number;
  };
};

const COMMON_EXPORTS = `
return {
  computePayment,
  buildRateSchedule,
  calculateAmortizationV2,
  computeLoanScenarioStats,
  normalizeLoan,
  armProductLabel,
  defaultArm,
  ARM_SCENARIOS,
};
`;

const BVR_EXPORTS = `
return {
  computePayment,
  buildRateSchedule,
  calculateAmortizationV2,
  computeLoanScenarioStats,
  normalizeLoan,
  armProductLabel,
  defaultArm,
  ARM_SCENARIOS,
  runBvR,
};
`;

async function loadScripts(
  relativePaths: string[],
  exportTail: string,
): Promise<Record<string, unknown>> {
  let code = "";
  for (const rel of relativePaths) {
    code += await Deno.readTextFile(new URL(rel, ROOT)) + "\n";
  }
  const fn = new Function(code + exportTail) as () => Record<string, unknown>;
  return fn();
}

export async function loadMortgageCommon(): Promise<MortgageCommonGlobals> {
  return (await loadScripts(
    ["app/static/mortgage-common.js"],
    COMMON_EXPORTS,
  )) as MortgageCommonGlobals;
}

export async function loadMortgageBvr(): Promise<
  MortgageCommonGlobals & MortgageBvrGlobals
> {
  return (await loadScripts(
    ["app/static/mortgage-common.js", "app/static/mortgage-bvr.js"],
    BVR_EXPORTS,
  )) as MortgageCommonGlobals & MortgageBvrGlobals;
}
