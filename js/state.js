/* ==========================================================================
   state.js — application state schema, defaults, and row helpers.
   ========================================================================== */

let uidCounter = 1;
function uid() { return "id" + (uidCounter++) + "_" + Math.random().toString(36).slice(2, 7); }

function defaultSpouse(name) {
  return {
    name,
    currentAge: 40,
    retirementAge: 60,
    employmentIncomeToday: 150000,
    incomeGrowthRealPct: 0.0, // real growth above inflation, 0 = tracks inflation only
    hasDefinedBenefitPension: false,
    pensionContributionToday: 0, // pre-tax payroll deduction while working (reduces taxable employment income)
    pensionAnnualToday: 0, // payout once pensionStartAge is reached
    pensionStartAge: 65,
    pensionIndexedPct: 1.0, // fraction of inflation the pension payout keeps pace with once it starts (1.0 = fully indexed)
    cppEstimateAt65Today: 12000,
    cppStartAge: 65,
    oasEstimateAt65Today: 8733,
    oasStartAge: 65,
    hasCorpAccount: false,
    rrspBalance: 200000,
    tfsaBalance: 100000,
    nonRegBalance: 50000,
    nonRegACBFraction: 0.7, // fraction of non-reg balance that is cost base (rest is unrealized gain)
    corpBalance: 0,
    corpRdtohNonElig: 0,
    corpRdtohElig: 0,
    corpCDA: 0,
    rrspContributionToday: 15000,
    tfsaContributionToday: 7000,
    corpContributionToday: 0
  };
}

function defaultState() {
  const now = new Date();
  return {
    meta: {
      scenarioName: "My Retirement Plan",
      savedAt: null
    },
    household: {
      province: "ON",
      provinceFlatRate: 0.11,
      currentYear: now.getFullYear(),
      planEndAge: 95, // applies to the older/reference spouse's age timeline (spouse1)
      inflationPct: 0.025
    },
    spouse1: defaultSpouse("Spouse 1"),
    spouse2: defaultSpouse("Spouse 2"),
    householdHasSpouse2: true,
    kids: [
      { id: uid(), name: "Child 1", currentAge: 8, respBalance: 15000, respAnnualContribution: 2500, universityStartAge: 18, yearsInSchool: 4, annualCostToday: 22000 }
    ],
    realEstate: [
      { id: uid(), name: "Principal Residence", value: 900000, growthRealPct: 0.01 }
    ],
    otherInvestments: [],
    lifeInsurance: [
      { id: uid(), insured: "Spouse 1", type: "term", faceAmount: 1000000, annualPremiumToday: 1200, cashValue: 0, cashValueGrowthPct: 0 }
    ],
    debts: [
      { id: uid(), name: "Mortgage", type: "mortgage", balance: 500000, interestRatePct: 0.045, amortYears: 20 }
    ],
    expensesRecurring: [
      { id: uid(), name: "Annual Vacation", amountToday: 8000, startYear: now.getFullYear(), endYear: now.getFullYear() + 40, inflates: true }
    ],
    expensesOneTime: [
      { id: uid(), name: "Kitchen Renovation", amountToday: 40000, year: now.getFullYear() + 3 }
    ],
    assumptions: {
      rrspReturnPct: 0.055,
      tfsaReturnPct: 0.05,
      respReturnPct: 0.045,
      nonRegReturnPct: 0.05,
      corpReturnPct: 0.05,
      corpCapGainAllocPct: 0.5, // % of corp investment return treated as capital gain
      corpEligDivAllocPct: 0.2, // % of corp investment return treated as eligible dividends received
      // remainder treated as interest/foreign income (fully taxable, no special credit)
      realEstateGrowthRealPct: 0.01,
      educationExtraRealPct: 0.01,
      retirementCashflowNeedToday: 110000,
      withdrawalOrder: ["rrif", "corp", "nonreg", "tfsa"]
    }
  };
}

function addRow(arr, factory) { arr.push(factory()); }
function removeRow(arr, id) {
  const idx = arr.findIndex(r => r.id === id);
  if (idx >= 0) arr.splice(idx, 1);
}

let STATE = defaultState();
