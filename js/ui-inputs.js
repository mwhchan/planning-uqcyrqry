/* ==========================================================================
   ui-inputs.js — renders the Inputs tab from STATE and binds fields.

   Two-tier update model:
   - renderInputsAll(): rebuilds the DOM from STATE. Called at startup and
     whenever rows are added/removed or a toggle changes which fields are
     visible. NOT called on every keystroke (would steal focus).
   - Individual field listeners mutate STATE directly and call
     scheduleRecalc() (defined in main.js), which only re-renders the
     Outputs tab.
   ========================================================================== */

function fmtId(prefix, id) { return `${prefix}-${id}`; }

function bindNumber(el, get, set, opts = {}) {
  el.value = opts.pct ? +(get() * 100).toFixed(opts.digits ?? 2) : get();
  el.addEventListener("input", () => {
    let v = parseFloat(el.value);
    if (isNaN(v)) v = 0;
    if (opts.pct) v = v / 100;
    set(v);
    scheduleRecalc();
  });
}
function bindText(el, get, set) {
  el.value = get();
  el.addEventListener("input", () => { set(el.value); scheduleRecalc(); });
}
function bindCheckbox(el, get, set, onToggle) {
  el.checked = get();
  el.addEventListener("change", () => { set(el.checked); scheduleRecalc(); if (onToggle) onToggle(); });
}
function bindSelect(el, get, set, onToggle) {
  el.value = get();
  el.addEventListener("change", () => { set(el.value); scheduleRecalc(); if (onToggle) onToggle(); });
}

function renderInputsAll() {
  renderHousehold();
  renderSpouseCard("spouse1", "spouse1-card", "Spouse 1", false);
  renderSpouseCard("spouse2", "spouse2-card", "Spouse 2", true);
  renderKids();
  renderAssetsCard("spouse1", "assets-s1-card", "Spouse 1 — Registered Accounts", false);
  renderAssetsCard("spouse2", "assets-s2-card", "Spouse 2 — Registered Accounts", true);
  renderRealEstate();
  renderOtherInvestments();
  renderInsurance();
  renderCorpTab();
  renderDebts();
  renderRecurringExpenses();
  renderOneTimeExpenses();
  renderSavings();
  renderRetirementAssumptions();
  renderPensionPayoutSummary();
}

function renderHousehold() {
  const provSel = document.getElementById("hh-province");
  provSel.innerHTML = Object.keys(PROVINCES).map(k => `<option value="${k}">${PROVINCES[k].label}</option>`).join("");
  bindSelect(provSel, () => STATE.household.province, v => STATE.household.province = v, () => renderHousehold());
  document.getElementById("hh-flatrate-wrap").style.display = STATE.household.province === "FLAT" ? "flex" : "none";
  bindNumber(document.getElementById("hh-flatrate"), () => STATE.household.provinceFlatRate, v => STATE.household.provinceFlatRate = v);
  bindNumber(document.getElementById("hh-planend"), () => STATE.household.planEndAge, v => STATE.household.planEndAge = v);
  bindNumber(document.getElementById("hh-inflation"), () => STATE.household.inflationPct, v => STATE.household.inflationPct = v, { pct: true, digits: 1 });
  bindCheckbox(document.getElementById("hh-hasspouse2"), () => STATE.householdHasSpouse2, v => STATE.householdHasSpouse2 = v, () => renderInputsAll());
}

function renderSpouseCard(key, containerId, defaultLabel, isSpouse2) {
  const container = document.getElementById(containerId);
  if (isSpouse2 && !STATE.householdHasSpouse2) { container.innerHTML = ""; container.style.display = "none"; return; }
  container.style.display = "block";
  const sp = STATE[key];
  container.innerHTML = `
    <h2><input type="text" id="${key}-name" style="font-weight:700;font-size:14px;border:none;background:transparent;padding:0;width:auto;color:var(--text)" /></h2>
    <div class="grid grid-3">
      <label>Current age <input type="number" id="${key}-age"></label>
      <label>Planned retirement age <input type="number" id="${key}-retage"></label>
      <label>Employment income (today's $) <input type="number" id="${key}-income"></label>
      <label>Real income growth (%/yr above inflation) <input type="number" id="${key}-incgrowth" step="0.1"></label>
      <label class="checkbox-label"><input type="checkbox" id="${key}-haspension"> Has defined-benefit pension</label>
      <label>Pension contribution while working (today's $/yr, pre-tax) <input type="number" id="${key}-pensioncontrib"></label>
      <label>Pension payout (today's $/yr) <input type="number" id="${key}-pension"></label>
      <label>Pension start age <input type="number" id="${key}-pensionage"></label>
      <label>Pension indexing (% of inflation kept, once paying out) <input type="number" id="${key}-pensionidx" step="1"></label>
      <label>CPP estimate at 65 (today's $/yr) <input type="number" id="${key}-cpp"></label>
      <label>CPP start age <input type="number" id="${key}-cppage" min="60" max="70"></label>
      <label>OAS estimate at 65 (today's $/yr) <input type="number" id="${key}-oas"></label>
      <label>OAS start age <input type="number" id="${key}-oasage" min="65" max="70"></label>
      <label class="checkbox-label"><input type="checkbox" id="${key}-hascorp"> Has corporate investment account (CCPC)</label>
    </div>
  `;
  bindText(document.getElementById(`${key}-name`), () => sp.name, v => sp.name = v);
  bindNumber(document.getElementById(`${key}-age`), () => sp.currentAge, v => sp.currentAge = v);
  bindNumber(document.getElementById(`${key}-retage`), () => sp.retirementAge, v => sp.retirementAge = v);
  bindNumber(document.getElementById(`${key}-income`), () => sp.employmentIncomeToday, v => sp.employmentIncomeToday = v);
  bindNumber(document.getElementById(`${key}-incgrowth`), () => sp.incomeGrowthRealPct, v => sp.incomeGrowthRealPct = v, { pct: true, digits: 1 });
  bindCheckbox(document.getElementById(`${key}-haspension`), () => sp.hasDefinedBenefitPension, v => sp.hasDefinedBenefitPension = v);
  bindNumber(document.getElementById(`${key}-pensioncontrib`), () => sp.pensionContributionToday, v => sp.pensionContributionToday = v);
  bindNumber(document.getElementById(`${key}-pension`), () => sp.pensionAnnualToday, v => sp.pensionAnnualToday = v);
  bindNumber(document.getElementById(`${key}-pensionage`), () => sp.pensionStartAge, v => sp.pensionStartAge = v);
  bindNumber(document.getElementById(`${key}-pensionidx`), () => sp.pensionIndexedPct, v => sp.pensionIndexedPct = v, { pct: true, digits: 0 });
  bindNumber(document.getElementById(`${key}-cpp`), () => sp.cppEstimateAt65Today, v => sp.cppEstimateAt65Today = v);
  bindNumber(document.getElementById(`${key}-cppage`), () => sp.cppStartAge, v => sp.cppStartAge = v);
  bindNumber(document.getElementById(`${key}-oas`), () => sp.oasEstimateAt65Today, v => sp.oasEstimateAt65Today = v);
  bindNumber(document.getElementById(`${key}-oasage`), () => sp.oasStartAge, v => sp.oasStartAge = v);
  bindCheckbox(document.getElementById(`${key}-hascorp`), () => sp.hasCorpAccount, v => sp.hasCorpAccount = v, () => { renderCorpTab(); renderSavings(); });
}

function renderKids() {
  const container = document.getElementById("kids-rows");
  container.innerHTML = "";
  STATE.kids.forEach(k => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove" title="Remove">✕</button>
      <div class="row-grid">
        <label>Name <input type="text" data-f="name"></label>
        <label>Current age <input type="number" data-f="currentAge"></label>
        <label>RESP balance ($) <input type="number" data-f="respBalance"></label>
        <label>Annual RESP contribution ($) <input type="number" data-f="respAnnualContribution"></label>
        <label>University start age <input type="number" data-f="universityStartAge"></label>
        <label>Years in school <input type="number" data-f="yearsInSchool"></label>
        <label>Annual cost (today's $) <input type="number" data-f="annualCostToday"></label>
      </div>
    `;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.kids, k.id); renderKids(); scheduleRecalc(); });
    row.querySelectorAll("[data-f]").forEach(inp => {
      const f = inp.dataset.f;
      if (inp.type === "number") bindNumber(inp, () => k[f], v => k[f] = v);
      else bindText(inp, () => k[f], v => k[f] = v);
    });
    container.appendChild(row);
  });
  document.querySelector('[data-add="kid"]').onclick = () => {
    addRow(STATE.kids, () => ({ id: uid(), name: "Child " + (STATE.kids.length + 1), currentAge: 5, respBalance: 0, respAnnualContribution: 2500, universityStartAge: 18, yearsInSchool: 4, annualCostToday: 20000 }));
    renderKids(); scheduleRecalc();
  };
}

function renderAssetsCard(key, containerId, title, isSpouse2) {
  const container = document.getElementById(containerId);
  if (isSpouse2 && !STATE.householdHasSpouse2) { container.innerHTML = ""; return; }
  const sp = STATE[key];
  container.innerHTML = `
    <h2>${title || (sp.name + " — Registered Accounts")}</h2>
    <div class="grid grid-2">
      <label>RRSP balance ($) <input type="number" id="${key}-rrsp"></label>
      <label>TFSA balance ($) <input type="number" id="${key}-tfsa"></label>
      <label>Non-registered balance ($) <input type="number" id="${key}-nonreg"></label>
      <label>Non-reg cost base (% of balance) <input type="number" id="${key}-acb" step="1"></label>
    </div>
  `;
  bindNumber(document.getElementById(`${key}-rrsp`), () => sp.rrspBalance, v => sp.rrspBalance = v);
  bindNumber(document.getElementById(`${key}-tfsa`), () => sp.tfsaBalance, v => sp.tfsaBalance = v);
  bindNumber(document.getElementById(`${key}-nonreg`), () => sp.nonRegBalance, v => sp.nonRegBalance = v);
  bindNumber(document.getElementById(`${key}-acb`), () => sp.nonRegACBFraction, v => sp.nonRegACBFraction = v, { pct: true, digits: 0 });
}

function renderCorpTab() {
  const anyCorp = STATE.spouse1.hasCorpAccount || (STATE.householdHasSpouse2 && STATE.spouse2.hasCorpAccount);
  document.getElementById("corp-empty-hint").style.display = anyCorp ? "none" : "block";
  document.getElementById("corp-assumptions-card").style.display = anyCorp ? "block" : "none";

  [["spouse1", "corp-s1-card", false], ["spouse2", "corp-s2-card", true]].forEach(([key, containerId, isSpouse2]) => {
    const container = document.getElementById(containerId);
    if (isSpouse2 && !STATE.householdHasSpouse2) { container.innerHTML = ""; container.style.display = "none"; return; }
    const sp = STATE[key];
    if (!sp.hasCorpAccount) { container.innerHTML = ""; container.style.display = "none"; return; }
    container.style.display = "block";
    container.innerHTML = `
      <h2>${sp.name} — Corporate Account</h2>
      <div class="grid grid-2">
        <label>Corporate account balance ($) <input type="number" id="${key}-corp"></label>
        <label>Annual contribution ($/yr, while working) <input type="number" id="${key}-corpcontrib"></label>
        <label>RDTOH — non-eligible ($) <input type="number" id="${key}-rdtohne"></label>
        <label>RDTOH — eligible ($) <input type="number" id="${key}-rdtohe"></label>
        <label>Capital Dividend Account ($) <input type="number" id="${key}-cda"></label>
      </div>
    `;
    bindNumber(document.getElementById(`${key}-corp`), () => sp.corpBalance, v => sp.corpBalance = v);
    bindNumber(document.getElementById(`${key}-corpcontrib`), () => sp.corpContributionToday, v => sp.corpContributionToday = v);
    bindNumber(document.getElementById(`${key}-rdtohne`), () => sp.corpRdtohNonElig, v => sp.corpRdtohNonElig = v);
    bindNumber(document.getElementById(`${key}-rdtohe`), () => sp.corpRdtohElig, v => sp.corpRdtohElig = v);
    bindNumber(document.getElementById(`${key}-cda`), () => sp.corpCDA, v => sp.corpCDA = v);
  });
}

function renderRealEstate() {
  const container = document.getElementById("realestate-rows");
  container.innerHTML = "";
  STATE.realEstate.forEach(r => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove">✕</button>
      <div class="row-grid">
        <label>Name <input type="text" data-f="name"></label>
        <label>Current value ($) <input type="number" data-f="value"></label>
        <label>Real growth (%/yr above inflation) <input type="number" data-f="growthRealPct" step="0.1"></label>
      </div>`;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.realEstate, r.id); renderRealEstate(); scheduleRecalc(); });
    bindText(row.querySelector('[data-f="name"]'), () => r.name, v => r.name = v);
    bindNumber(row.querySelector('[data-f="value"]'), () => r.value, v => r.value = v);
    bindNumber(row.querySelector('[data-f="growthRealPct"]'), () => r.growthRealPct, v => r.growthRealPct = v, { pct: true, digits: 1 });
    container.appendChild(row);
  });
  document.querySelector('[data-add="realestate"]').onclick = () => {
    addRow(STATE.realEstate, () => ({ id: uid(), name: "Property", value: 0, growthRealPct: 0.01 }));
    renderRealEstate(); scheduleRecalc();
  };
}

function renderOtherInvestments() {
  const container = document.getElementById("otherinv-rows");
  container.innerHTML = "";
  STATE.otherInvestments.forEach(o => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove">✕</button>
      <div class="row-grid">
        <label>Name <input type="text" data-f="name"></label>
        <label>Current value ($) <input type="number" data-f="value"></label>
        <label>Expected return (%/yr nominal) <input type="number" data-f="returnRate" step="0.1"></label>
      </div>`;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.otherInvestments, o.id); renderOtherInvestments(); scheduleRecalc(); });
    bindText(row.querySelector('[data-f="name"]'), () => o.name, v => o.name = v);
    bindNumber(row.querySelector('[data-f="value"]'), () => o.value, v => o.value = v);
    bindNumber(row.querySelector('[data-f="returnRate"]'), () => o.returnRate, v => o.returnRate = v, { pct: true, digits: 1 });
    container.appendChild(row);
  });
  document.querySelector('[data-add="otherinv"]').onclick = () => {
    addRow(STATE.otherInvestments, () => ({ id: uid(), name: "Investment", value: 0, returnRate: 0.05 }));
    renderOtherInvestments(); scheduleRecalc();
  };
}

function renderInsurance() {
  const container = document.getElementById("insurance-rows");
  container.innerHTML = "";
  STATE.lifeInsurance.forEach(p => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove">✕</button>
      <div class="row-grid">
        <label>Insured <input type="text" data-f="insured"></label>
        <label>Type <select data-f="type"><option value="term">Term</option><option value="permanent">Permanent (whole/UL)</option></select></label>
        <label>Face amount ($) <input type="number" data-f="faceAmount"></label>
        <label>Annual premium (today's $) <input type="number" data-f="annualPremiumToday"></label>
        <label>Current cash value ($) <input type="number" data-f="cashValue"></label>
        <label>Cash value growth (%/yr) <input type="number" data-f="cashValueGrowthPct" step="0.1"></label>
      </div>`;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.lifeInsurance, p.id); renderInsurance(); scheduleRecalc(); });
    bindText(row.querySelector('[data-f="insured"]'), () => p.insured, v => p.insured = v);
    bindSelect(row.querySelector('[data-f="type"]'), () => p.type, v => p.type = v);
    bindNumber(row.querySelector('[data-f="faceAmount"]'), () => p.faceAmount, v => p.faceAmount = v);
    bindNumber(row.querySelector('[data-f="annualPremiumToday"]'), () => p.annualPremiumToday, v => p.annualPremiumToday = v);
    bindNumber(row.querySelector('[data-f="cashValue"]'), () => p.cashValue, v => p.cashValue = v);
    bindNumber(row.querySelector('[data-f="cashValueGrowthPct"]'), () => p.cashValueGrowthPct, v => p.cashValueGrowthPct = v, { pct: true, digits: 1 });
    container.appendChild(row);
  });
  document.querySelector('[data-add="insurance"]').onclick = () => {
    addRow(STATE.lifeInsurance, () => ({ id: uid(), insured: "Spouse 1", type: "term", faceAmount: 500000, annualPremiumToday: 800, cashValue: 0, cashValueGrowthPct: 0 }));
    renderInsurance(); scheduleRecalc();
  };
}

function renderDebts() {
  const container = document.getElementById("debts-rows");
  container.innerHTML = "";
  STATE.debts.forEach(d => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove">✕</button>
      <div class="row-grid">
        <label>Name <input type="text" data-f="name"></label>
        <label>Type <select data-f="type"><option value="mortgage">Mortgage</option><option value="loc">Line of Credit</option><option value="loan">Loan</option><option value="interest-only">Interest-only</option></select></label>
        <label>Balance ($) <input type="number" data-f="balance"></label>
        <label>Interest rate (%/yr) <input type="number" data-f="interestRatePct" step="0.1"></label>
        <label>Amortization (years) <input type="number" data-f="amortYears"></label>
      </div>`;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.debts, d.id); renderDebts(); scheduleRecalc(); });
    bindText(row.querySelector('[data-f="name"]'), () => d.name, v => d.name = v);
    bindSelect(row.querySelector('[data-f="type"]'), () => d.type, v => d.type = v);
    bindNumber(row.querySelector('[data-f="balance"]'), () => d.balance, v => d.balance = v);
    bindNumber(row.querySelector('[data-f="interestRatePct"]'), () => d.interestRatePct, v => d.interestRatePct = v, { pct: true, digits: 2 });
    bindNumber(row.querySelector('[data-f="amortYears"]'), () => d.amortYears, v => d.amortYears = v);
    container.appendChild(row);
  });
  document.querySelector('[data-add="debt"]').onclick = () => {
    addRow(STATE.debts, () => ({ id: uid(), name: "Loan", type: "loan", balance: 0, interestRatePct: 0.06, amortYears: 5 }));
    renderDebts(); scheduleRecalc();
  };
}

function renderRecurringExpenses() {
  const container = document.getElementById("recurring-rows");
  container.innerHTML = "";
  STATE.expensesRecurring.forEach(e => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove">✕</button>
      <div class="row-grid">
        <label>Name <input type="text" data-f="name"></label>
        <label>Annual amount (today's $) <input type="number" data-f="amountToday"></label>
        <label>Start year <input type="number" data-f="startYear"></label>
        <label>End year <input type="number" data-f="endYear"></label>
        <label class="checkbox-label"><input type="checkbox" data-f="inflates"> Inflates over time</label>
      </div>`;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.expensesRecurring, e.id); renderRecurringExpenses(); scheduleRecalc(); });
    bindText(row.querySelector('[data-f="name"]'), () => e.name, v => e.name = v);
    bindNumber(row.querySelector('[data-f="amountToday"]'), () => e.amountToday, v => e.amountToday = v);
    bindNumber(row.querySelector('[data-f="startYear"]'), () => e.startYear, v => e.startYear = v);
    bindNumber(row.querySelector('[data-f="endYear"]'), () => e.endYear, v => e.endYear = v);
    bindCheckbox(row.querySelector('[data-f="inflates"]'), () => e.inflates, v => e.inflates = v);
    container.appendChild(row);
  });
  document.querySelector('[data-add="recurring"]').onclick = () => {
    addRow(STATE.expensesRecurring, () => ({ id: uid(), name: "Expense", amountToday: 2000, startYear: STATE.household.currentYear, endYear: STATE.household.currentYear + 30, inflates: true }));
    renderRecurringExpenses(); scheduleRecalc();
  };
}

function renderOneTimeExpenses() {
  const container = document.getElementById("onetime-rows");
  container.innerHTML = "";
  STATE.expensesOneTime.forEach(e => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `
      <button class="row-remove">✕</button>
      <div class="row-grid">
        <label>Name <input type="text" data-f="name"></label>
        <label>Amount (today's $) <input type="number" data-f="amountToday"></label>
        <label>Year <input type="number" data-f="year"></label>
      </div>`;
    row.querySelector(".row-remove").addEventListener("click", () => { removeRow(STATE.expensesOneTime, e.id); renderOneTimeExpenses(); scheduleRecalc(); });
    bindText(row.querySelector('[data-f="name"]'), () => e.name, v => e.name = v);
    bindNumber(row.querySelector('[data-f="amountToday"]'), () => e.amountToday, v => e.amountToday = v);
    bindNumber(row.querySelector('[data-f="year"]'), () => e.year, v => e.year = v);
    container.appendChild(row);
  });
  document.querySelector('[data-add="onetime"]').onclick = () => {
    addRow(STATE.expensesOneTime, () => ({ id: uid(), name: "Expense", amountToday: 5000, year: STATE.household.currentYear + 1 }));
    renderOneTimeExpenses(); scheduleRecalc();
  };
}

function renderSavings() {
  ["spouse1", "spouse2"].forEach((key, idx) => {
    const container = document.getElementById(`savings-${key === "spouse1" ? "s1" : "s2"}`);
    if (idx === 1 && !STATE.householdHasSpouse2) { container.innerHTML = ""; return; }
    const sp = STATE[key];
    container.innerHTML = `
      <h3>${sp.name}</h3>
      <div class="grid grid-1" style="grid-template-columns:1fr;">
        <label>RRSP contribution ($/yr) <input type="number" id="${key}-sav-rrsp"></label>
        <label>TFSA contribution ($/yr) <input type="number" id="${key}-sav-tfsa"></label>
      </div>
      ${sp.hasCorpAccount ? `<p class="hint" style="margin-top:10px;margin-bottom:0;">Corp account contributions are set on the Corporation tab.</p>` : ""}
      ${sp.hasDefinedBenefitPension ? `<p class="hint" style="margin-top:10px;margin-bottom:0;">Pension contributions are set on the Household tab.</p>` : ""}`;
    bindNumber(document.getElementById(`${key}-sav-rrsp`), () => sp.rrspContributionToday, v => sp.rrspContributionToday = v);
    bindNumber(document.getElementById(`${key}-sav-tfsa`), () => sp.tfsaContributionToday, v => sp.tfsaContributionToday = v);
  });
}

function renderRetirementAssumptions() {
  const A = STATE.assumptions;
  bindNumber(document.getElementById("ret-rrsp"), () => A.rrspReturnPct, v => A.rrspReturnPct = v, { pct: true, digits: 1 });
  bindNumber(document.getElementById("ret-tfsa"), () => A.tfsaReturnPct, v => A.tfsaReturnPct = v, { pct: true, digits: 1 });
  bindNumber(document.getElementById("ret-resp"), () => A.respReturnPct, v => A.respReturnPct = v, { pct: true, digits: 1 });
  bindNumber(document.getElementById("ret-nonreg"), () => A.nonRegReturnPct, v => A.nonRegReturnPct = v, { pct: true, digits: 1 });
  bindNumber(document.getElementById("ret-re"), () => A.realEstateGrowthRealPct, v => A.realEstateGrowthRealPct = v, { pct: true, digits: 1 });

  const cg = document.getElementById("ret-corpcg"), ed = document.getElementById("ret-corped"), it = document.getElementById("ret-corpint");
  function refreshInterestPct() { it.value = (100 - (A.corpCapGainAllocPct * 100) - (A.corpEligDivAllocPct * 100)).toFixed(0); }
  bindNumber(document.getElementById("ret-corp"), () => A.corpReturnPct, v => A.corpReturnPct = v, { pct: true, digits: 1 });
  bindNumber(cg, () => A.corpCapGainAllocPct, v => { A.corpCapGainAllocPct = v; refreshInterestPct(); }, { pct: true, digits: 0 });
  bindNumber(ed, () => A.corpEligDivAllocPct, v => { A.corpEligDivAllocPct = v; refreshInterestPct(); }, { pct: true, digits: 0 });
  refreshInterestPct();

  bindNumber(document.getElementById("ret-cashneed"), () => A.retirementCashflowNeedToday, v => A.retirementCashflowNeedToday = v);
}

function renderPensionPayoutSummary() {
  const container = document.getElementById("pension-payout-summary");
  if (!container) return;
  const spouses = [STATE.spouse1];
  if (STATE.householdHasSpouse2) spouses.push(STATE.spouse2);
  const withPension = spouses.filter(sp => sp.hasDefinedBenefitPension);
  if (!withPension.length) {
    container.innerHTML = `<p class="hint" style="margin:0;">No pension entered yet — retirement cash flow will rely on CPP/OAS plus investment withdrawals as the base layer. Add a pension on the Household tab if either spouse has one.</p>`;
    return;
  }
  container.innerHTML = withPension.map(sp => `
    <div>
      <div style="font-weight:650;font-size:13px;margin-bottom:4px;">${sp.name}</div>
      <div class="hint" style="margin:0;">
        ${fmt$(sp.pensionAnnualToday)}/yr starting at age ${sp.pensionStartAge}, indexed to ${Math.round(sp.pensionIndexedPct * 100)}% of inflation
        ${sp.pensionContributionToday ? ` — contributing ${fmt$(sp.pensionContributionToday)}/yr while working` : ""}.
      </div>
    </div>
  `).join("");
}
