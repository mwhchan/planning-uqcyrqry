/* ==========================================================================
   tax.js — progressive tax, dividend, CPP/OAS, and CCPC helper functions.
   All amounts here are NOMINAL dollars for the given projection year; the
   engine indexes brackets/thresholds forward by the inflation assumption
   before calling these.
   ========================================================================== */

function progressiveTax(income, brackets) {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (income <= lower) break;
    const taxableInBracket = Math.min(income, b.upTo) - lower;
    if (taxableInBracket > 0) tax += taxableInBracket * b.rate;
    lower = b.upTo;
  }
  return tax;
}

function indexBrackets(brackets, factor) {
  return brackets.map(b => ({ upTo: b.upTo === Infinity ? Infinity : b.upTo * factor, rate: b.rate }));
}

// Computes total personal tax for a year given an income breakdown.
// income = { employment, pension, cppOas, rrifRrsp, nonRegInterest, nonRegCapGain,
//            eligibleDiv, nonEligibleDiv }
// province object must already have brackets indexed to the current year.
function computePersonalTax(income, fedBrackets, fedBPA, prov) {
  const eligGrossup = income.eligibleDiv * ELIGIBLE_DIV_GROSSUP;
  const nonEligGrossup = income.nonEligibleDiv * NON_ELIGIBLE_DIV_GROSSUP;
  const taxableIncome =
    Math.max(0, income.employment) +
    Math.max(0, income.pension) +
    Math.max(0, income.cppOas) +
    Math.max(0, income.rrifRrsp) +
    Math.max(0, income.nonRegInterest) +
    Math.max(0, income.nonRegCapGain) * CAP_GAINS_INCLUSION +
    (income.eligibleDiv + eligGrossup) +
    (income.nonEligibleDiv + nonEligGrossup);

  // Federal
  let fedTax = progressiveTax(taxableIncome, fedBrackets);
  fedTax -= fedBPA * fedBrackets[0].rate; // BPA credited at lowest rate
  fedTax -= (income.eligibleDiv + eligGrossup) * ELIGIBLE_DIV_FED_DTC;
  fedTax -= (income.nonEligibleDiv + nonEligGrossup) * NON_ELIGIBLE_DIV_FED_DTC;
  fedTax = Math.max(0, fedTax);

  // Provincial
  let provTax = 0;
  if (prov.brackets) {
    provTax = progressiveTax(taxableIncome, prov.brackets);
    provTax -= prov.bpa * prov.brackets[0].rate;
    provTax -= (income.eligibleDiv + eligGrossup) * prov.divGrossupCredit.eligible;
    provTax -= (income.nonEligibleDiv + nonEligGrossup) * prov.divGrossupCredit.nonEligible;
    provTax = Math.max(0, provTax);
    // Provincial surtax (Ontario-style: cumulative % on prov tax above thresholds)
    if (prov.surtax && prov.surtax.length) {
      let surtax = 0;
      for (const s of prov.surtax) {
        if (provTax > s.threshold) surtax += (provTax - s.threshold) * s.rate;
      }
      provTax += surtax;
    }
  } else if (prov.flatRate != null) {
    provTax = taxableIncome * prov.flatRate;
  }

  return {
    taxableIncome,
    fedTax,
    provTax,
    totalTax: fedTax + provTax
  };
}

// OAS recovery tax (clawback) for a given net income & threshold (already indexed)
function oasClawback(netIncome, oasReceived, threshold) {
  if (netIncome <= threshold) return 0;
  return Math.min(oasReceived, (netIncome - threshold) * OAS_CLAWBACK_RATE);
}

// CPP benefit adjustment factor for starting before/after 65
function cppAdjustmentFactor(startAge) {
  if (startAge < 65) {
    const monthsEarly = Math.round((65 - startAge) * 12);
    return 1 - monthsEarly * 0.006;
  } else if (startAge > 65) {
    const monthsLate = Math.round((startAge - 65) * 12);
    return 1 + monthsLate * 0.007;
  }
  return 1;
}

// OAS benefit adjustment factor for deferring past 65 (no early option)
function oasAdjustmentFactor(startAge) {
  if (startAge > 65) {
    const monthsLate = Math.round((startAge - 65) * 12);
    return 1 + monthsLate * 0.006;
  }
  return 1;
}
