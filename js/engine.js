/* ==========================================================================
   engine.js — deterministic year-by-year projection engine.

   Runs internally in NOMINAL dollars (so indexed tax brackets, CPP/OAS,
   and fixed-payment mortgages behave realistically), then every output
   value is deflated back to today's (real) dollars for display, per the
   "real dollars" output preference.

   Simplifications (documented for the user in the app's Methodology note):
   - Corp account assumes annual realization of gains (mark-to-market),
     a fixed blended asset-return allocation (interest / elig. div / cap
     gain), dividends paid out are always non-eligible, and provincial
     corp passive tax rates are blended estimates.
   - RESP withdrawals are assumed tax-free to the household (EAP taxed in
     the student's hands, typically at ~0%).
   - Debts amortize on an annual-compounding approximation, not monthly.
   - Federal high-income BPA claw-back range is not modelled.
   ========================================================================== */

function indexProvince(prov, factor) {
  return {
    ...prov,
    brackets: prov.brackets ? indexBrackets(prov.brackets, factor) : null,
    bpa: prov.bpa * factor,
    flatRate: prov.flatRate
  };
}

function amortAnnualPayment(balance, ratePct, years) {
  const r = ratePct;
  if (r === 0) return balance / years;
  return balance * r / (1 - Math.pow(1 + r, -years));
}

function runProjection(state) {
  const h = state.household;
  const inflation = h.inflationPct;
  const hasS2 = state.householdHasSpouse2;
  const s1 = state.spouse1, s2 = state.spouse2;
  const A = state.assumptions;

  const provBase = h.province === "FLAT" ? { ...PROVINCES.FLAT, flatRate: h.provinceFlatRate } : PROVINCES[h.province];

  const years = Math.max(1, h.planEndAge - s1.currentAge);

  // Mutable running balances
  const bal = {
    s1: { rrsp: s1.rrspBalance, tfsa: s1.tfsaBalance, nonReg: s1.nonRegBalance, nonRegACB: s1.nonRegBalance * s1.nonRegACBFraction, corp: s1.corpBalance, rdtohNE: s1.corpRdtohNonElig, rdtohE: s1.corpRdtohElig, cda: s1.corpCDA },
    s2: { rrsp: s2.rrspBalance, tfsa: s2.tfsaBalance, nonReg: s2.nonRegBalance, nonRegACB: s2.nonRegBalance * s2.nonRegACBFraction, corp: s2.corpBalance, rdtohNE: s2.corpRdtohNonElig, rdtohE: s2.corpRdtohElig, cda: s2.corpCDA }
  };
  const kidResp = {};
  state.kids.forEach(k => kidResp[k.id] = { balance: k.respBalance, cumContrib: 0, cumCESG: 0 });

  const debtState = state.debts.map(d => ({
    ...d,
    remaining: d.balance,
    payment: d.type === "interest-only" ? d.balance * d.interestRatePct : amortAnnualPayment(d.balance, d.interestRatePct, Math.max(1, d.amortYears))
  }));

  const insState = state.lifeInsurance.map(p => ({ ...p, cv: p.cashValue }));
  const reState = state.realEstate.map(r => ({ ...r, value: r.value }));
  const oiState = state.otherInvestments.map(o => ({ ...o, value: o.value }));

  const rows = [];

  for (let y = 0; y < years; y++) {
    const calendarYear = h.currentYear + y;
    const infFactor = Math.pow(1 + inflation, y);

    const fedBrackets = indexBrackets(FEDERAL_BRACKETS, infFactor);
    const fedBPA = FEDERAL_BPA * infFactor;
    const prov = indexProvince(provBase, infFactor);
    const oasThreshold = OAS_CLAWBACK_THRESHOLD * infFactor;

    const s1Age = s1.currentAge + y;
    const s2Age = hasS2 ? s2.currentAge + y : null;

    // Canada taxes individuals, not households — compute each spouse's tax on
    // THEIR OWN income and sum, never combine two incomes into one taxpayer.
    function personTaxAndClaw(incomeObj, spouseOAS) {
      const netIncomeForClawback = incomeObj.employment + incomeObj.pension + incomeObj.cppOas + incomeObj.rrifRrsp +
        incomeObj.nonRegCapGain * CAP_GAINS_INCLUSION + incomeObj.nonEligibleDiv * (1 + NON_ELIGIBLE_DIV_GROSSUP) +
        incomeObj.eligibleDiv * (1 + ELIGIBLE_DIV_GROSSUP);
      const claw = oasClawback(netIncomeForClawback, spouseOAS, oasThreshold);
      const tax = computePersonalTax(incomeObj, fedBrackets, fedBPA, prov);
      return { fedTax: tax.fedTax, provTax: tax.provTax, totalTax: tax.totalTax + claw, claw };
    }
    function sumTax(a, b) {
      return { fedTax: a.fedTax + b.fedTax, provTax: a.provTax + b.provTax, totalTax: a.totalTax + b.totalTax };
    }

    function spouseIncome(sp, age, key) {
      const retired = age >= sp.retirementAge;
      const grossEmployment = retired ? 0 : sp.employmentIncomeToday * infFactor * Math.pow(1 + sp.incomeGrowthRealPct, y);
      const pensionContribution = (!retired && sp.hasDefinedBenefitPension) ? Math.min(grossEmployment, sp.pensionContributionToday * infFactor) : 0;
      const employment = grossEmployment - pensionContribution;
      let pension = 0;
      if (sp.hasDefinedBenefitPension && age >= sp.pensionStartAge) {
        const yearsSincePensionStart = age - sp.pensionStartAge;
        const nominalAtStart = sp.pensionAnnualToday * Math.pow(1 + inflation, y - yearsSincePensionStart);
        pension = nominalAtStart * Math.pow(1 + inflation * sp.pensionIndexedPct, yearsSincePensionStart);
      }
      const cpp = age >= sp.cppStartAge ? sp.cppEstimateAt65Today * infFactor * cppAdjustmentFactor(sp.cppStartAge) : 0;
      let oas = age >= sp.oasStartAge ? sp.oasEstimateAt65Today * infFactor * oasAdjustmentFactor(sp.oasStartAge) * (age >= 75 ? 1 + OAS_75_BONUS : 1) : 0;
      return { retired, employment, pensionContribution, pension, cpp, oas };
    }

    const inc1 = spouseIncome(s1, s1Age, "s1");
    const inc2 = hasS2 ? spouseIncome(s2, s2Age, "s2") : { retired: true, employment: 0, pension: 0, cpp: 0, oas: 0 };

    // ---- Contributions (pre-retirement only) ----
    function applyContribution(sp, spBal, retired) {
      if (retired) return;
      spBal.rrsp += sp.rrspContributionToday * infFactor;
      spBal.tfsa += sp.tfsaContributionToday * infFactor;
      if (sp.hasCorpAccount) spBal.corp += sp.corpContributionToday * infFactor;
    }
    applyContribution(s1, bal.s1, inc1.retired);
    if (hasS2) applyContribution(s2, bal.s2, inc2.retired);

    // ---- Mandatory RRIF minimum withdrawals ----
    function mandatoryRRIF(age, spBal) {
      if (age < 71 || spBal.rrsp <= 0) return 0;
      const amt = spBal.rrsp * rrifMinRate(age);
      spBal.rrsp -= amt;
      return amt;
    }
    const mand1 = mandatoryRRIF(s1Age, bal.s1);
    const mand2 = hasS2 ? mandatoryRRIF(s2Age, bal.s2) : 0;

    // ---- Kids: RESP contributions/CESG + education draws ----
    let educationNetCost = 0;
    let respContribTotal = 0;
    state.kids.forEach(k => {
      const kAge = k.currentAge + y;
      const rs = kidResp[k.id];
      const inSchool = kAge >= k.universityStartAge && kAge < k.universityStartAge + k.yearsInSchool;
      if (!inSchool && rs.cumContrib < RESP_LIFETIME_CONTRIB_CAP) {
        const room = RESP_LIFETIME_CONTRIB_CAP - rs.cumContrib;
        const contrib = Math.min(k.respAnnualContribution * infFactor, room);
        rs.balance += contrib;
        rs.cumContrib += contrib;
        respContribTotal += contrib;
        if (rs.cumCESG < CESG_LIFETIME_MAX) {
          const eligible = Math.min(contrib, CESG_ANNUAL_CONTRIB_CAP);
          const grant = Math.min(eligible * CESG_RATE, CESG_LIFETIME_MAX - rs.cumCESG);
          rs.balance += grant;
          rs.cumCESG += grant;
        }
      }
      rs.balance *= (1 + A.respReturnPct);
      if (inSchool) {
        const cost = k.annualCostToday * Math.pow(1 + inflation + (A.educationExtraRealPct || 0), y);
        const fromResp = Math.min(rs.balance, cost);
        rs.balance -= fromResp;
        educationNetCost += Math.max(0, cost - fromResp);
      }
    });

    // ---- Debts ----
    let debtPaymentTotal = 0;
    debtState.forEach(d => {
      if (d.remaining <= 0) return;
      const interest = d.remaining * d.interestRatePct;
      let principal = d.payment - interest;
      if (principal > d.remaining) principal = d.remaining;
      const pay = interest + principal;
      d.remaining -= principal;
      debtPaymentTotal += pay;
    });

    // ---- Insurance premiums & cash value ----
    let insurancePremiumTotal = 0;
    insState.forEach(p => {
      insurancePremiumTotal += p.annualPremiumToday * infFactor;
      if (p.type === "permanent") p.cv = p.cv * (1 + p.cashValueGrowthPct) + p.annualPremiumToday * infFactor * 0.3;
    });

    // ---- Recurring & one-time expenses ----
    let recurringTotal = 0;
    state.expensesRecurring.forEach(e => {
      if (calendarYear >= e.startYear && calendarYear <= e.endYear) {
        recurringTotal += e.inflates ? e.amountToday * infFactor : e.amountToday;
      }
    });
    let oneTimeTotal = 0;
    state.expensesOneTime.forEach(e => { if (e.year === calendarYear) oneTimeTotal += e.amountToday * infFactor; });

    // ---- Determine retirement phase (all spouses retired) ----
    const retirementPhase = inc1.retired && (!hasS2 || inc2.retired);

    // ---- Corp passive investment growth (before any withdrawal solve) ----
    function growCorp(spBal, retRate) {
      if (spBal.corp <= 0) return { tax: 0 };
      const totalReturn = spBal.corp * retRate;
      const capGain = totalReturn * A.corpCapGainAllocPct;
      const eligDiv = totalReturn * A.corpEligDivAllocPct;
      const interestInc = totalReturn - capGain - eligDiv;
      const taxableCapGain = capGain * CAP_GAINS_INCLUSION;
      spBal.cda += capGain * (1 - CAP_GAINS_INCLUSION);
      const passiveTaxableIncome = interestInc + eligDiv + taxableCapGain;
      const corpTax = passiveTaxableIncome * prov.corpPassiveRate;
      const refundablePortion = (interestInc + taxableCapGain) * ART_RATE;
      spBal.rdtohNE += refundablePortion;
      spBal.rdtohE += eligDiv * (ELIGIBLE_DIV_FED_DTC); // approx eligible RDTOH addition
      spBal.corp += totalReturn - corpTax;
      return { tax: corpTax };
    }
    growCorp(bal.s1, A.corpReturnPct);
    if (hasS2) growCorp(bal.s2, A.corpReturnPct);

    // ---- Non-retirement-phase: no forced withdrawal solve, just grow accounts ----
    let withdrawals = { rrifExtra: 0, corpDiv: 0, nonReg: 0, tfsa: 0, mandatoryRRIF: mand1 + mand2 };
    let householdTax = { fedTax: 0, provTax: 0, totalTax: 0 };
    let oasClaw = 0;

    if (!retirementPhase) {
      // Grow remaining accounts (RRSP already had mandatory sub if any; RRIF stays flat elsewhere)
      bal.s1.rrsp *= (1 + A.rrspReturnPct);
      bal.s1.tfsa *= (1 + A.tfsaReturnPct);
      { const g = bal.s1.nonReg * A.nonRegReturnPct; bal.s1.nonReg += g; }
      if (hasS2) {
        bal.s2.rrsp *= (1 + A.rrspReturnPct);
        bal.s2.tfsa *= (1 + A.tfsaReturnPct);
        const g2 = bal.s2.nonReg * A.nonRegReturnPct; bal.s2.nonReg += g2;
      }
      // Tax on employment/pension/cpp/oas/mandatory RRIF — each spouse taxed individually
      const inc1Obj = { employment: inc1.employment, pension: inc1.pension, cppOas: inc1.cpp + inc1.oas, rrifRrsp: mand1, nonRegInterest: 0, nonRegCapGain: 0, eligibleDiv: 0, nonEligibleDiv: 0 };
      const r1 = personTaxAndClaw(inc1Obj, inc1.oas);
      let r2 = { fedTax: 0, provTax: 0, totalTax: 0, claw: 0 };
      if (hasS2) {
        const inc2Obj = { employment: inc2.employment, pension: inc2.pension, cppOas: inc2.cpp + inc2.oas, rrifRrsp: mand2, nonRegInterest: 0, nonRegCapGain: 0, eligibleDiv: 0, nonEligibleDiv: 0 };
        r2 = personTaxAndClaw(inc2Obj, inc2.oas);
      }
      householdTax = sumTax(r1, r2);
      oasClaw = r1.claw + r2.claw;
    } else {
      // ---- Retirement phase: iterative withdrawal solve ----
      const cashNeedToday = A.retirementCashflowNeedToday;
      const cashNeedNominal = cashNeedToday * infFactor;
      const guaranteedOutflow = debtPaymentTotal + recurringTotal + oneTimeTotal + insurancePremiumTotal + educationNetCost;
      const outflowTarget = cashNeedNominal + guaranteedOutflow;

      // Guaranteed (non-discretionary) income per spouse: pension + CPP + OAS + their own mandatory RRIF minimum.
      // (Employment is 0 for both here — retirementPhase requires every spouse to be retired.)
      const guaranteedCashGross = inc1.pension + inc1.cpp + inc1.oas + mand1 + inc2.pension + inc2.cpp + inc2.oas + mand2;

      const availRRIF = bal.s1.rrsp + (hasS2 ? bal.s2.rrsp : 0);
      const availCorp = bal.s1.corp + (hasS2 ? bal.s2.corp : 0);
      const availNonReg = bal.s1.nonReg + (hasS2 ? bal.s2.nonReg : 0);
      const availTFSA = bal.s1.tfsa + (hasS2 ? bal.s2.tfsa : 0);

      // Fixed per-spouse shares of each bucket (by their own balance at the start of this
      // year's withdrawal decision) — used both to attribute tax correctly per spouse and,
      // later, to actually draw down each spouse's own accounts (drawProportional below).
      const s1RRIFShare = availRRIF > 0 ? bal.s1.rrsp / availRRIF : (hasS2 ? 0.5 : 1);
      const s1CorpShare = availCorp > 0 ? bal.s1.corp / availCorp : (hasS2 ? 0.5 : 1);
      const s1NonRegShare = availNonReg > 0 ? bal.s1.nonReg / availNonReg : (hasS2 ? 0.5 : 1);
      const s1NonRegACBRatio = bal.s1.nonReg > 0 ? Math.min(1, bal.s1.nonRegACB / bal.s1.nonReg) : 0;
      const s2NonRegACBRatio = (hasS2 && bal.s2.nonReg > 0) ? Math.min(1, bal.s2.nonRegACB / bal.s2.nonReg) : 0;

      let guess = Math.max(0, outflowTarget - guaranteedCashGross) / 0.65;
      let alloc = { rrifExtra: 0, corpDiv: 0, nonReg: 0, tfsa: 0 };

      for (let iter = 0; iter < 10; iter++) {
        let remaining = guess;
        alloc.rrifExtra = Math.min(remaining, availRRIF); remaining -= alloc.rrifExtra;
        alloc.corpDiv = Math.min(remaining, availCorp); remaining -= alloc.corpDiv;
        alloc.nonReg = Math.min(remaining, availNonReg); remaining -= alloc.nonReg;
        alloc.tfsa = Math.min(remaining, availTFSA); remaining -= alloc.tfsa;
        const unmet = Math.max(0, remaining); // household literally runs out of money

        const s1RRIF = alloc.rrifExtra * s1RRIFShare, s2RRIF = alloc.rrifExtra * (1 - s1RRIFShare);
        const s1Corp = alloc.corpDiv * s1CorpShare, s2Corp = alloc.corpDiv * (1 - s1CorpShare);
        const s1NonRegW = alloc.nonReg * s1NonRegShare, s2NonRegW = alloc.nonReg * (1 - s1NonRegShare);
        const s1NonRegGain = s1NonRegW * (1 - s1NonRegACBRatio);
        const s2NonRegGain = s2NonRegW * (1 - s2NonRegACBRatio);

        // Each spouse taxed individually on their own pension/CPP/OAS/RRIF/dividend/gain share.
        const inc1Obj = { employment: 0, pension: inc1.pension, cppOas: inc1.cpp + inc1.oas, rrifRrsp: mand1 + s1RRIF, nonRegInterest: 0, nonRegCapGain: s1NonRegGain, eligibleDiv: 0, nonEligibleDiv: s1Corp };
        const r1 = personTaxAndClaw(inc1Obj, inc1.oas);
        let r2 = { fedTax: 0, provTax: 0, totalTax: 0, claw: 0 };
        if (hasS2) {
          const inc2Obj = { employment: 0, pension: inc2.pension, cppOas: inc2.cpp + inc2.oas, rrifRrsp: mand2 + s2RRIF, nonRegInterest: 0, nonRegCapGain: s2NonRegGain, eligibleDiv: 0, nonEligibleDiv: s2Corp };
          r2 = personTaxAndClaw(inc2Obj, inc2.oas);
        }
        const totalTax = r1.totalTax + r2.totalTax;

        const netCash = guaranteedCashGross + alloc.rrifExtra + alloc.corpDiv + alloc.nonReg + alloc.tfsa - totalTax - unmet;
        const shortfall = outflowTarget - netCash;
        householdTax = sumTax(r1, r2); householdTax.totalTax = totalTax;
        oasClaw = r1.claw + r2.claw;
        if (Math.abs(shortfall) < 25) break;
        guess += shortfall / 0.6;
        guess = Math.max(0, guess);
      }

      withdrawals = { rrifExtra: alloc.rrifExtra, corpDiv: alloc.corpDiv, nonReg: alloc.nonReg, tfsa: alloc.tfsa, mandatoryRRIF: mand1 + mand2 };

      // Apply withdrawals proportionally across spouses (by their share of each bucket)
      function drawProportional(field, amount, s1b, s2b) {
        const total = s1b[field] + (hasS2 ? s2b[field] : 0);
        if (total <= 0 || amount <= 0) return;
        const s1Share = s1b[field] / total;
        s1b[field] -= amount * s1Share;
        if (hasS2) s2b[field] -= amount * (1 - s1Share);
      }
      drawProportional("rrsp", alloc.rrifExtra, bal.s1, bal.s2);
      drawProportional("corp", alloc.corpDiv, bal.s1, bal.s2);
      // RDTOH refund on corp dividend paid, back into corp balance (split by each spouse's share of the draw)
      if (alloc.corpDiv > 0) {
        function refund(spBal, share) {
          const refundAmt = Math.min(spBal.rdtohNE, alloc.corpDiv * share * RDTOH_REFUND_RATE);
          spBal.rdtohNE -= refundAmt;
          spBal.corp += refundAmt;
        }
        refund(bal.s1, s1CorpShare);
        if (hasS2) refund(bal.s2, 1 - s1CorpShare);
      }
      // Non-reg withdrawal reduces balance and proportional ACB
      function drawNonReg(spBal, amount) {
        if (amount <= 0 || spBal.nonReg <= 0) return;
        const ratio = Math.min(1, amount / spBal.nonReg);
        spBal.nonRegACB -= spBal.nonRegACB * ratio;
        spBal.nonReg -= amount;
      }
      const totalNonRegForShare = bal.s1.nonReg + (hasS2 ? bal.s2.nonReg : 0);
      if (totalNonRegForShare > 0 && alloc.nonReg > 0) {
        drawNonReg(bal.s1, alloc.nonReg * (bal.s1.nonReg / totalNonRegForShare));
        if (hasS2) drawNonReg(bal.s2, alloc.nonReg * (bal.s2.nonReg / totalNonRegForShare));
      }
      drawProportional("tfsa", alloc.tfsa, bal.s1, bal.s2);

      // Grow remaining balances after withdrawal (RRSP/TFSA/nonReg; corp already grown pre-withdrawal)
      bal.s1.rrsp = Math.max(0, bal.s1.rrsp) * (1 + A.rrspReturnPct);
      bal.s1.tfsa = Math.max(0, bal.s1.tfsa) * (1 + A.tfsaReturnPct);
      bal.s1.nonReg = Math.max(0, bal.s1.nonReg) * (1 + A.nonRegReturnPct);
      if (hasS2) {
        bal.s2.rrsp = Math.max(0, bal.s2.rrsp) * (1 + A.rrspReturnPct);
        bal.s2.tfsa = Math.max(0, bal.s2.tfsa) * (1 + A.tfsaReturnPct);
        bal.s2.nonReg = Math.max(0, bal.s2.nonReg) * (1 + A.nonRegReturnPct);
      }
    }

    // ---- Real estate & other investments growth ----
    reState.forEach(r => { r.value *= (1 + inflation) * (1 + r.growthRealPct); });
    oiState.forEach(o => { o.value *= (1 + o.returnRate); });

    // ---- Aggregate outputs (deflate to today's dollars) ----
    const netWorthNominal =
      bal.s1.rrsp + bal.s1.tfsa + bal.s1.nonReg + bal.s1.corp +
      (hasS2 ? bal.s2.rrsp + bal.s2.tfsa + bal.s2.nonReg + bal.s2.corp : 0) +
      Object.values(kidResp).reduce((a, k) => a + k.balance, 0) +
      reState.reduce((a, r) => a + r.value, 0) +
      oiState.reduce((a, o) => a + o.value, 0) +
      insState.reduce((a, p) => a + p.cv, 0) -
      debtState.reduce((a, d) => a + Math.max(0, d.remaining), 0);

    const grossIncomeNominal = inc1.employment + inc1.pension + inc1.cpp + inc1.oas + inc2.employment + inc2.pension + inc2.cpp + inc2.oas + withdrawals.rrifExtra + withdrawals.corpDiv + withdrawals.nonReg + withdrawals.tfsa + withdrawals.mandatoryRRIF;
    const totalExpensesNominal = debtPaymentTotal + recurringTotal + oneTimeTotal + insurancePremiumTotal + educationNetCost;
    const totalTaxNominal = householdTax.totalTax;
    const netCashNominal = grossIncomeNominal - totalTaxNominal - (retirementPhase ? 0 : (s1.rrspContributionToday * infFactor + s1.tfsaContributionToday * infFactor + (s1.hasCorpAccount ? s1.corpContributionToday * infFactor : 0) + (hasS2 ? s2.rrspContributionToday * infFactor + s2.tfsaContributionToday * infFactor + (s2.hasCorpAccount ? s2.corpContributionToday * infFactor : 0) : 0)));
    const surplusNominal = netCashNominal - totalExpensesNominal;

    const d = infFactor; // deflator
    rows.push({
      year: y, calendarYear,
      spouse1Age: s1Age, spouse2Age: s2Age,
      retirementPhase,
      incomeEmployment: (inc1.employment + inc2.employment) / d,
      incomePension: (inc1.pension + inc2.pension) / d,
      incomeCPP: (inc1.cpp + inc2.cpp) / d,
      incomeOAS: (inc1.oas + inc2.oas) / d,
      withdrawalRRIF: (withdrawals.rrifExtra + withdrawals.mandatoryRRIF) / d,
      withdrawalCorp: withdrawals.corpDiv / d,
      withdrawalNonReg: withdrawals.nonReg / d,
      withdrawalTFSA: withdrawals.tfsa / d,
      grossIncome: grossIncomeNominal / d,
      tax: totalTaxNominal / d,
      oasClawback: oasClaw / d,
      expensesDebt: debtPaymentTotal / d,
      expensesRecurring: recurringTotal / d,
      expensesOneTime: oneTimeTotal / d,
      expensesEducation: educationNetCost / d,
      expensesInsurance: insurancePremiumTotal / d,
      totalExpenses: totalExpensesNominal / d,
      surplus: surplusNominal / d,
      balS1RRSP: bal.s1.rrsp / d, balS1TFSA: bal.s1.tfsa / d, balS1NonReg: bal.s1.nonReg / d, balS1Corp: bal.s1.corp / d,
      balS2RRSP: hasS2 ? bal.s2.rrsp / d : 0, balS2TFSA: hasS2 ? bal.s2.tfsa / d : 0, balS2NonReg: hasS2 ? bal.s2.nonReg / d : 0, balS2Corp: hasS2 ? bal.s2.corp / d : 0,
      balRESP: Object.values(kidResp).reduce((a, k) => a + k.balance, 0) / d,
      balRealEstate: reState.reduce((a, r) => a + r.value, 0) / d,
      balOtherInv: oiState.reduce((a, o) => a + o.value, 0) / d,
      balInsuranceCV: insState.reduce((a, p) => a + p.cv, 0) / d,
      balDebt: debtState.reduce((a, dd) => a + Math.max(0, dd.remaining), 0) / d,
      netWorth: netWorthNominal / d,
      moneyRunsOut: retirementPhase && (bal.s1.rrsp + bal.s1.tfsa + bal.s1.nonReg + bal.s1.corp + (hasS2 ? bal.s2.rrsp + bal.s2.tfsa + bal.s2.nonReg + bal.s2.corp : 0)) <= 0
    });
  }

  return rows;
}
