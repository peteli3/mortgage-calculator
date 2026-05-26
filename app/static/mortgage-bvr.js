// Buy-vs-rent calculation engine (shared with buy_vs_rent.html).
// Depends on mortgage-common.js (buildRateSchedule, computePayment).

function runBvR(loan, a, scenario) {
  scenario = scenario || "intro_forever";
  var termMonths = Math.round((loan.term_years || 30) * 12);
  var rates = buildRateSchedule(loan, scenario);
  var lastRate = rates[0];
  var pi = computePayment(loan.loan_amount, lastRate, termMonths);
  var propTaxMo = loan.prop_tax || 0;
  var hoaMo = loan.hoa || 0;
  var insuranceMo = (loan.insurance || 0) / 12;
  var closing = loan.closing || 0;

  var downPayment = a.downPayment || 0;
  var homeValue0 = loan.loan_amount + downPayment;
  var appRateMo = a.appreciation / 100 / 12;

  var rent0 = a.monthlyRent || 0;
  var secDep = a.securityDeposit || 0;
  var rentIncrYr = a.rentIncrease / 100;
  var renterInsMo = a.renterInsurance || 0;

  var margRate = a.marginalRate / 100;
  var itemize = !!a.itemize;
  var investRMo = a.investReturn / 100 / 12;

  var C0 = downPayment + closing;
  var portfolio = C0 - secDep;

  var balance = loan.loan_amount;
  var hv = homeValue0;
  var buyCumCost = C0;

  var yearly = [];
  var breakEvenYear = null;
  var lastBuyNW = null;
  var lastRentNW = null;

  for (var m = 1; m <= termMonths; m++) {
    var rateThis = rates[m - 1];
    if (rateThis !== lastRate) {
      pi = computePayment(balance, rateThis, termMonths - (m - 1));
      lastRate = rateThis;
    }
    var monthlyRate = rateThis / 100 / 12;
    var intPortion = balance * monthlyRate;
    var prinPortion = Math.max(0, pi - intPortion);
    balance = Math.max(0, balance - prinPortion);

    hv *= 1 + appRateMo;

    var rentNow = rent0 * Math.pow(1 + rentIncrYr, (m - 1) / 12);

    var taxSave = itemize ? intPortion * margRate : 0;
    var buyMoCost = pi + propTaxMo + hoaMo + insuranceMo - taxSave;
    buyCumCost += buyMoCost;

    var rentMoCost = rentNow + renterInsMo;

    var surplus = buyMoCost - rentMoCost;
    portfolio = portfolio * (1 + investRMo) + surplus;

    var saleNet = hv - balance;
    var buyNW = saleNet - buyCumCost;
    var rentNW = portfolio;

    if (breakEvenYear === null && buyNW > rentNW) {
      breakEvenYear = Math.ceil(m / 12);
    }

    if (m % 12 === 0 || m === termMonths) {
      yearly.push({
        year: Math.ceil(m / 12),
        buyNW: buyNW,
        rentNW: rentNW,
        homeValue: hv,
        equity: saleNet,
        portfolio: portfolio,
        buyMoCost: buyMoCost,
        rentMoCost: rentMoCost,
      });
    }

    lastBuyNW = buyNW;
    lastRentNW = rentNW;
  }

  return {
    yearly: yearly,
    breakEvenYear: breakEvenYear,
    termYears: Math.ceil(termMonths / 12),
    finalBuyNW: lastBuyNW,
    finalRentNW: lastRentNW,
  };
}
