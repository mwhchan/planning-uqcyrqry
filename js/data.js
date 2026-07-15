/* ==========================================================================
   data.js — Canadian tax/benefit constants (approx. 2025 figures).
   These are planning approximations, indexed forward each projection year
   by the user's inflation assumption. NOT tax advice — for precision,
   especially around corporate structures, consult an accountant.
   ========================================================================== */

const BASE_YEAR = 2025;

const FEDERAL_BRACKETS = [
  { upTo: 57375, rate: 0.15 },
  { upTo: 114750, rate: 0.205 },
  { upTo: 177882, rate: 0.26 },
  { upTo: 253414, rate: 0.29 },
  { upTo: Infinity, rate: 0.33 }
];
const FEDERAL_BPA = 16129;

// Federal dividend gross-up / tax credit rates
const ELIGIBLE_DIV_GROSSUP = 0.38;
const ELIGIBLE_DIV_FED_DTC = 0.150198; // of grossed-up amount
const NON_ELIGIBLE_DIV_GROSSUP = 0.15;
const NON_ELIGIBLE_DIV_FED_DTC = 0.090301; // of grossed-up amount

// Capital gains inclusion rate (personal + corporate)
const CAP_GAINS_INCLUSION = 0.50;

const PROVINCES = {
  ON: {
    label: "Ontario",
    brackets: [
      { upTo: 52886, rate: 0.0505 },
      { upTo: 105775, rate: 0.0915 },
      { upTo: 150000, rate: 0.1116 },
      { upTo: 220000, rate: 0.1216 },
      { upTo: Infinity, rate: 0.1316 }
    ],
    bpa: 12747,
    divGrossupCredit: { eligible: 0.10, nonEligible: 0.0299 }, // simplified ON DTC as % of grossed-up div
    surtax: [ { threshold: 5710, rate: 0.20 }, { threshold: 7307, rate: 0.36 } ], // applied to ON tax payable above thresholds (cumulative)
    corpPassiveRate: 0.5017,
    corpSBDRate: 0.122
  },
  BC: {
    label: "British Columbia",
    brackets: [
      { upTo: 49279, rate: 0.0506 },
      { upTo: 98560, rate: 0.077 },
      { upTo: 113158, rate: 0.105 },
      { upTo: 137407, rate: 0.1229 },
      { upTo: 186306, rate: 0.147 },
      { upTo: 259829, rate: 0.168 },
      { upTo: Infinity, rate: 0.205 }
    ],
    bpa: 12580,
    divGrossupCredit: { eligible: 0.12, nonEligible: 0.0196 },
    surtax: [],
    corpPassiveRate: 0.5067,
    corpSBDRate: 0.11
  },
  AB: {
    label: "Alberta",
    brackets: [
      { upTo: 60000, rate: 0.08 },
      { upTo: 151234, rate: 0.10 },
      { upTo: 181481, rate: 0.12 },
      { upTo: 241974, rate: 0.13 },
      { upTo: 362961, rate: 0.14 },
      { upTo: Infinity, rate: 0.15 }
    ],
    bpa: 22323,
    divGrossupCredit: { eligible: 0.0812, nonEligible: 0.0218 },
    surtax: [],
    corpPassiveRate: 0.47,
    corpSBDRate: 0.11
  },
  FLAT: {
    label: "Other / Flat rate (set below)",
    brackets: null,
    bpa: 0,
    divGrossupCredit: { eligible: 0, nonEligible: 0 },
    surtax: [],
    corpPassiveRate: 0.50,
    corpSBDRate: 0.12
  }
};

// RRIF prescribed minimum withdrawal factors (age 71-95+)
const RRIF_MIN_TABLE = {
  71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582,
  76: 0.0598, 77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682,
  81: 0.0708, 82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851,
  86: 0.0899, 87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192,
  91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879
};
function rrifMinRate(age) {
  if (age < 71) return 1 / (90 - age);
  if (age >= 95) return 0.20;
  return RRIF_MIN_TABLE[age] || 0.20;
}

// CPP / OAS 2025 approximate maximums at age 65
const CPP_MAX_AT_65 = 17196; // annual, if deferred/started exactly at 65
const OAS_MAX_AT_65 = 8733;  // annual, ages 65-74
const OAS_75_BONUS = 0.10;   // +10% starting at age 75

const OAS_CLAWBACK_THRESHOLD = 93454; // 2025 approx, indexed forward
const OAS_CLAWBACK_RATE = 0.15;

// CESG (Canada Education Savings Grant)
const CESG_RATE = 0.20;
const CESG_ANNUAL_CONTRIB_CAP = 2500; // per child, grant-eligible portion
const CESG_LIFETIME_MAX = 7200; // per child
const RESP_LIFETIME_CONTRIB_CAP = 50000; // per child

// RDTOH refund rate (dividend refund) per $ of taxable dividend paid
const RDTOH_REFUND_RATE = 0.3833;
// Refundable portion of tax on corp passive investment income (goes to RDTOH)
const ART_RATE = 0.3067; // additional refundable tax, non-eligible RDTOH bucket
