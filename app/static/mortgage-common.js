// Utilities shared across the mortgage-calculator pages
// (index, amortization, buy-vs-rent). Defined at global scope so that
// inline page scripts can call them directly.

var STORAGE_KEY = "mortgage_loans";
var SELECTED_KEY = "mortgage_selected_loan";

// ═══════════════════════════════════════════════════════════════════════════
// ARM scenarios and constants
// ═══════════════════════════════════════════════════════════════════════════
// Three rate paths the engine can project for an Adjustable Rate Mortgage.
// 'intro_forever' is the canonical "Flat" / "no change" scenario and is also
// the single scenario used for Fixed Rate loans (rate is constant by definition).
var ARM_SCENARIOS = ["worst", "intro_forever", "best"];

// Standard conforming ARM products. label is the CFPB notation "fixed/freq"
// where freq is 6 = adjusts every 6 months, 1 = adjusts every 12 months.
var ARM_PRODUCTS = [
  { label: "3/6", fixed_period_years: 3, adjustment_interval_months: 6 },
  { label: "5/6", fixed_period_years: 5, adjustment_interval_months: 6 },
  { label: "5/1", fixed_period_years: 5, adjustment_interval_months: 12 },
  { label: "7/6", fixed_period_years: 7, adjustment_interval_months: 6 },
  { label: "7/1", fixed_period_years: 7, adjustment_interval_months: 12 },
  { label: "10/6", fixed_period_years: 10, adjustment_interval_months: 6 },
  { label: "10/1", fixed_period_years: 10, adjustment_interval_months: 12 },
];

// Defaults applied when a loan is first toggled to ARM. The rate engine
// treats a missing rate_floor as "floor = margin", which is the standard
// ARM convention.
function defaultArm() {
  return {
    fixed_period_years: 7,
    adjustment_interval_months: 6,
    margin: 2.75,
    cap_initial: 2.0,
    cap_periodic: 1.0,
    cap_lifetime: 5.0,
  };
}

// Format an ARM product label, e.g. "ARM 7/6mo" or "ARM 10/1y".
// The suffix makes the adjustment frequency unambiguous:
//   "mo" = adjusts every N months, "y" = adjusts every 1 year.
function armProductLabel(loan) {
  if (!loan || loan.loan_type !== "arm" || !loan.arm) return "";
  var fy = loan.arm.fixed_period_years;
  var iv = loan.arm.adjustment_interval_months;
  var freq = iv === 12 ? "1y" : String(iv) + "mo";
  return "ARM " + fy + "/" + freq;
}

// Treat any loan with no explicit loan_type as fixed-rate (back-compat
// for loans saved before ARM support landed). Returns a shallow copy so
// callers can mutate without affecting storage.
function normalizeLoan(loan) {
  if (!loan) return loan;
  var out = {};
  for (var k in loan) {
    if (Object.prototype.hasOwnProperty.call(loan, k)) out[k] = loan[k];
  }
  if (!out.loan_type) out.loan_type = "fixed";
  return out;
}

function loadLoans() {
  try {
    var raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return raw.map(normalizeLoan);
  } catch (e) {
    return [];
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showToast(message, type) {
  var alertClass = type === "error" ? "alert-error" : "alert-success";
  var wrap = document.createElement("div");
  wrap.className = "toast toast-top toast-end z-[999]";
  wrap.innerHTML = '<div class="alert ' + alertClass + ' text-sm py-2 px-4">' +
    escHtml(message) + "</div>";
  document.body.appendChild(wrap);
  setTimeout(function () {
    wrap.style.transition = "opacity 0.4s";
    wrap.style.opacity = "0";
    setTimeout(function () {
      wrap.remove();
    }, 400);
  }, 2600);
}

// Dollar inputs: format value with commas as the user types, preserving
// caret position relative to digits-to-the-right.
function applyCommaFormat(input) {
  var raw = input.value.replace(/[^0-9]/g, "");
  var digitsRight =
    input.value.slice(input.selectionStart).replace(/[^0-9]/g, "").length;
  var formatted = raw ? Number(raw).toLocaleString("en-US") : "";
  input.value = formatted;
  if (digitsRight === 0) {
    input.setSelectionRange(formatted.length, formatted.length);
  } else {
    var count = 0;
    var pos = formatted.length;
    for (var i = formatted.length - 1; i >= 0; i--) {
      if (/[0-9]/.test(formatted[i])) {
        count++;
        if (count === digitsRight) {
          pos = i;
          break;
        }
      }
    }
    input.setSelectionRange(pos, pos);
  }
}

function fmtDollarField(val) {
  return val > 0 ? Number(val).toLocaleString("en-US") : "";
}

// Returns { text, title } for preview panel values.
// Values >= $1B switch to e-notation (3 sig figs); title holds the full value
// for display in a hover tooltip, otherwise title is null.
function fmtPreview(val) {
  if (!isFinite(val) || isNaN(val)) return { text: "—", title: null };
  var rounded = Math.round(val);
  var abs = Math.abs(rounded);
  var sign = rounded < 0 ? "-" : "";
  if (abs >= 1000000000) {
    var full = sign + "$" + abs.toLocaleString();
    return { text: sign + "$" + abs.toExponential(2), title: full };
  }
  return { text: sign + "$" + abs.toLocaleString(), title: null };
}

function setPreviewVal(id, show, val) {
  var el = document.getElementById(id);
  if (!show) {
    el.textContent = "—";
    el.removeAttribute("title");
    return;
  }
  var r = fmtPreview(val);
  el.textContent = r.text;
  if (r.title) el.title = r.title;
  else el.removeAttribute("title");
}

// Render the ARM scenario section of the floating preview panel. For a
// non-ARM (or invalid) loan, the section is hidden and the P&I label
// reverts to "P&I". For ARM, shows the 4 scenario payment levels and
// retitles the headline P&I as "Intro P&I" to disambiguate.
function renderArmPreview(loan) {
  var wrap = document.getElementById("preview_arm_wrap");
  var piLabel = document.getElementById("preview_pi_label");
  if (!wrap || !piLabel) return;
  var isArm = loan && loan.loan_type === "arm" && loan.arm &&
    (loan.loan_amount || 0) > 0 && (loan.term_years || 0) > 0;
  if (!isArm) {
    wrap.classList.add("hidden");
    piLabel.textContent = "P&I";
    return;
  }
  wrap.classList.remove("hidden");
  piLabel.textContent = "Intro P&I";
  var prodEl = document.getElementById("preview_arm_product");
  if (prodEl) prodEl.textContent = armProductLabel(loan).replace("ARM ", "· ");

  var startDate = new Date(2025, 0, 1);
  var ids = {
    worst: "preview_arm_worst",
    intro_forever: "preview_arm_intro",
    best: "preview_arm_best",
  };
  Object.keys(ids).forEach(function (sc) {
    var r = calculateAmortizationV2(loan, sc, startDate, []);
    var p;
    if (sc === "worst") {
      p = 0;
      for (var i = 0; i < r.schedule.length; i++) {
        if (r.schedule[i].payment > p) p = r.schedule[i].payment;
      }
    } else if (sc === "best") {
      p = Infinity;
      for (var j = 0; j < r.schedule.length; j++) {
        if (r.schedule[j].payment < p) p = r.schedule[j].payment;
      }
      if (!isFinite(p)) p = r.monthlyPayment;
    } else {
      p = r.monthlyPayment;
    }
    var el = document.getElementById(ids[sc]);
    if (el) {
      var fp = fmtPreview(p);
      el.textContent = fp.text;
      if (fp.title) el.title = fp.title;
      else el.removeAttribute("title");
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Calculation Engine — shared by index, amortization, buy-vs-rent
// ═══════════════════════════════════════════════════════════════════════════

// Standard fully-amortizing monthly payment. Falls back to straight-line
// principal if the rate is zero. Replaces the same formula previously
// duplicated in index.html and amortization.html.
function computePayment(balance, annualRatePct, remainingMonths) {
  if (balance <= 0 || remainingMonths <= 0) return 0;
  if (annualRatePct <= 0) return balance / remainingMonths;
  var r = annualRatePct / 100 / 12;
  var n = remainingMonths;
  return balance * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

// Build a per-month annual rate (%) schedule of length termMonths for a
// given loan + scenario. Fixed-rate loans short-circuit to a flat array.
//
// ARM rate evolution (CFPB convention):
//   • Months 1..fixed_period_years*12 use the introductory rate.
//   • First adjustment is at fixed_period_years*12 + 1; subsequent
//     adjustments happen every adjustment_interval_months.
//   • The applicable cap is `cap_initial` at the first adjustment and
//     `cap_periodic` at every subsequent adjustment. The rate is also
//     bounded by `intro + cap_lifetime` (ceiling) and `rate_floor`
//     (default = margin).
//   • Scenario semantics:
//       worst         — rate moves up by the applicable cap at every adjustment
//       intro_forever — rate stays at intro (never adjusts); this is the "Flat" view
//       best          — rate moves down by the applicable cap at every adjustment
function buildRateSchedule(loan, scenario) {
  var termMonths = Math.round((loan.term_years || 30) * 12);
  var rates = new Array(termMonths);
  var intro = loan.interest || 0;

  if (loan.loan_type !== "arm" || !loan.arm) {
    for (var i = 0; i < termMonths; i++) rates[i] = intro;
    return rates;
  }

  var arm = loan.arm;
  var fixedMonths = Math.round((arm.fixed_period_years || 5) * 12);
  var interval = arm.adjustment_interval_months || 12;
  var ceiling = intro + (arm.cap_lifetime || 0);
  var floor = (arm.rate_floor !== null && arm.rate_floor !== undefined)
    ? arm.rate_floor
    : (arm.margin || 0);

  var current = intro;
  for (var m = 1; m <= termMonths; m++) {
    if (m <= fixedMonths) {
      rates[m - 1] = intro;
      continue;
    }
    var monthsAfterFixed = m - fixedMonths;
    var isAdjustment = ((monthsAfterFixed - 1) % interval) === 0;
    if (isAdjustment) {
      var isFirst = monthsAfterFixed === 1;
      var cap = isFirst ? (arm.cap_initial || 0) : (arm.cap_periodic || 0);
      var target = current;
      if (scenario === "worst") {
        target = current + cap;
      } else if (scenario === "best") {
        target = current - cap;
      }
      // intro_forever leaves target = current
      current = Math.max(floor, Math.min(ceiling, target));
    }
    rates[m - 1] = current;
  }
  return rates;
}

// Full amortization schedule with optional extra payments. Returns:
//   { schedule, totalInterest, totalPrincipal, payoffDate, payoffMonth, monthlyPayment }
// Each schedule entry: { month, year, calendarMonth, calendarYear, payment,
//                        principal, interest, extra, balance, rate,
//                        accumPrincipal, accumInterest }
//
// For Fixed loans this matches the original calculateAmortization exactly.
// For ARM loans, the regular payment is recast (recomputed to fully
// amortize the remaining balance over the remaining months) at every
// month where the rate changes — standard ARM servicing behavior.
function calculateAmortizationV2(loan, scenario, startDate, extraPayments) {
  extraPayments = Array.isArray(extraPayments) ? extraPayments : [];

  var principal = loan.loan_amount || 0;
  var termYears = loan.term_years || 30;
  var totalPayments = Math.round(termYears * 12);
  var rates = buildRateSchedule(loan, scenario);

  var schedule = [];
  var balance = principal;
  var totalInterest = 0;
  var totalPrincipal = 0;
  var payoffMonth = totalPayments;
  var firstRate = rates[0] != null ? rates[0] : (loan.interest || 0);
  var lastRate = firstRate;
  var currentPayment = computePayment(principal, firstRate, totalPayments);
  var initialPayment = currentPayment;

  for (var month = 1; month <= totalPayments && balance > 0.01; month++) {
    var rateThis = rates[month - 1];

    // Recast at every rate change (i.e. each adjustment month for ARM)
    if (rateThis !== lastRate) {
      currentPayment = computePayment(
        balance,
        rateThis,
        totalPayments - (month - 1),
      );
      lastRate = rateThis;
    }

    var monthlyRate = rateThis / 100 / 12;
    var paymentDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + month - 1,
      1,
    );
    var calendarYear = paymentDate.getFullYear();
    var calendarMonth = paymentDate.getMonth() + 1;

    var interestPayment = balance * monthlyRate;
    var principalPayment = Math.min(currentPayment - interestPayment, balance);

    var extra = 0;
    for (var ei = 0; ei < extraPayments.length; ei++) {
      var ep = extraPayments[ei];
      var amt = ep.amount || 0;
      if (amt <= 0) continue;
      var start = ep.startMonth || 1;
      if (month < start) continue;
      if (ep.type === "monthly") {
        extra += amt;
      } else if (ep.type === "yearly") {
        if ((month - start) % 12 === 0) extra += amt;
      } else if (ep.type === "onetime") {
        if (month === start) extra += amt;
      }
    }

    var maxExtra = Math.max(0, balance - principalPayment);
    extra = Math.min(extra, maxExtra);

    var totalPrincipalThisMonth = principalPayment + extra;
    balance = Math.max(0, balance - totalPrincipalThisMonth);
    totalInterest += interestPayment;
    totalPrincipal += totalPrincipalThisMonth;

    schedule.push({
      month: month,
      year: Math.ceil(month / 12),
      calendarMonth: calendarMonth,
      calendarYear: calendarYear,
      payment: currentPayment + extra,
      principal: totalPrincipalThisMonth,
      interest: interestPayment,
      extra: extra,
      balance: balance,
      rate: rateThis,
      accumPrincipal: totalPrincipal,
      accumInterest: totalInterest,
    });

    if (balance <= 0.01) {
      payoffMonth = month;
      break;
    }
  }

  var payoffDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + payoffMonth - 1,
    1,
  );

  return {
    schedule: schedule,
    totalInterest: totalInterest,
    totalPrincipal: totalPrincipal,
    payoffDate: payoffDate,
    payoffMonth: payoffMonth,
    monthlyPayment: initialPayment,
  };
}

// Computes { introPi, minPi, maxPi } across all ARM scenarios. For a
// fixed loan, all three are equal to the regular intro P&I.
// Used to surface a compact "↕ $low–$high" range hint on table rows.
function computeLoanScenarioStats(loan) {
  var introPi = computePayment(
    loan.loan_amount || 0,
    loan.interest || 0,
    Math.round((loan.term_years || 30) * 12),
  );
  if (loan.loan_type !== "arm" || !loan.arm) {
    return { introPi: introPi, minPi: introPi, maxPi: introPi };
  }
  var startDate = new Date(2025, 0, 1);
  var minPi = Infinity, maxPi = -Infinity;
  ARM_SCENARIOS.forEach(function (sc) {
    var r = calculateAmortizationV2(loan, sc, startDate, []);
    for (var i = 0; i < r.schedule.length; i++) {
      var p = r.schedule[i].payment;
      if (p < minPi) minPi = p;
      if (p > maxPi) maxPi = p;
    }
  });
  return {
    introPi: introPi,
    minPi: isFinite(minPi) ? minPi : introPi,
    maxPi: isFinite(maxPi) ? maxPi : introPi,
  };
}
