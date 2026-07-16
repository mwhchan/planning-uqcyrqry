/* ==========================================================================
   export.js — Excel export (SheetJS), print, and JSON save/load.
   ========================================================================== */

function exportToExcel() {
  const wb = XLSX.utils.book_new();

  const summaryAOA = [
    ["Household Retirement Forecast — " + STATE.meta.scenarioName],
    ["Generated", new Date().toISOString().slice(0, 10)],
    [],
    ["All dollar figures in today's (real) purchasing power unless noted."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAOA), "Summary");

  const projSheet = XLSX.utils.json_to_sheet(LAST_ROWS.map(r => ({
    Year: r.calendarYear, "Age (S1)": r.spouse1Age, "Age (S2)": r.spouse2Age,
    Employment: r.incomeEmployment, Pension: r.incomePension, CPP: r.incomeCPP, OAS: r.incomeOAS,
    "RRIF Withdrawal": r.withdrawalRRIF, "Corp Dividends": r.withdrawalCorp,
    "Non-Reg Withdrawal": r.withdrawalNonReg, "TFSA Withdrawal": r.withdrawalTFSA,
    "Gross Income": r.grossIncome, Tax: r.tax, "OAS Clawback": r.oasClawback,
    "Debt Payments": r.expensesDebt, "Recurring Expenses": r.expensesRecurring,
    "One-Time Expenses": r.expensesOneTime, "Education Net Cost": r.expensesEducation,
    "Insurance Premiums": r.expensesInsurance, "Total Expenses": r.totalExpenses,
    Surplus: r.surplus,
    "RRSP/RRIF Balance": r.balS1RRSP + r.balS2RRSP, "TFSA Balance": r.balS1TFSA + r.balS2TFSA,
    "Non-Reg Balance": r.balS1NonReg + r.balS2NonReg, "Corp Balance": r.balS1Corp + r.balS2Corp,
    "RESP Balance": r.balRESP, "Real Estate": r.balRealEstate, "Other/Insurance CV": r.balOtherInv + r.balInsuranceCV,
    "Debt Balance": r.balDebt, "Net Worth": r.netWorth
  })));
  XLSX.utils.book_append_sheet(wb, projSheet, "Yearly Projection");

  const inputsAOA = [
    ["HOUSEHOLD"],
    ["Province", STATE.household.province], ["Plan end age", STATE.household.planEndAge], ["Inflation %", STATE.household.inflationPct],
    [],
    ["SPOUSE 1"],
    ...Object.entries(STATE.spouse1).map(([k, v]) => [k, v]),
  ];
  if (STATE.householdHasSpouse2) {
    inputsAOA.push([], ["SPOUSE 2"], ...Object.entries(STATE.spouse2).map(([k, v]) => [k, v]));
  }
  inputsAOA.push([], ["ASSUMPTIONS"], ...Object.entries(STATE.assumptions).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inputsAOA), "Inputs");

  if (STATE.kids.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.kids), "Kids & RESP");
  if (STATE.debts.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.debts), "Debts");
  if (STATE.expensesRecurring.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.expensesRecurring), "Recurring Expenses");
  if (STATE.expensesOneTime.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.expensesOneTime), "One-Time Expenses");
  if (STATE.realEstate.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.realEstate), "Real Estate");
  if (STATE.lifeInsurance.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.lifeInsurance), "Life Insurance");

  const safeName = (STATE.meta.scenarioName || "retirement-plan").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

function saveScenarioJSON() {
  STATE.meta.savedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (STATE.meta.scenarioName || "retirement-plan").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.href = url; a.download = `${safeName}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadScenarioJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const loaded = JSON.parse(e.target.result);
      const merged = defaultState();
      Object.keys(loaded).forEach(k => merged[k] = loaded[k]);
      STATE = merged;
      document.getElementById("scenario-name").value = STATE.meta.scenarioName || "My Retirement Plan";
      renderInputsAll();
      renderOutputSliders();
      recomputeAndRender();
      saveStateToStorage();
    } catch (err) {
      alert("Could not read that scenario file. Make sure it's a JSON file exported from this app.");
    }
  };
  reader.readAsText(file);
}
