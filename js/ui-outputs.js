/* ==========================================================================
   ui-outputs.js — sliders, summary tiles, detail table, and the top-level
   recompute pipeline. Sliders are built once (renderOutputSliders) and only
   have .value synced afterward, so dragging one never gets its DOM rebuilt
   mid-interaction.
   ========================================================================== */

let LAST_ROWS = [];

function sliderConfig() {
  const A = STATE.assumptions, H = STATE.household, S1 = STATE.spouse1, S2 = STATE.spouse2;
  const cfg = [
    { id: "sl-rrsp", label: "RRSP/RRIF return", get: () => A.rrspReturnPct, set: v => A.rrspReturnPct = v, min: 0, max: 10, step: 0.1, pct: true },
    { id: "sl-tfsa", label: "TFSA return", get: () => A.tfsaReturnPct, set: v => A.tfsaReturnPct = v, min: 0, max: 10, step: 0.1, pct: true },
    { id: "sl-nonreg", label: "Non-Reg return", get: () => A.nonRegReturnPct, set: v => A.nonRegReturnPct = v, min: 0, max: 10, step: 0.1, pct: true },
    { id: "sl-inflation", label: "Inflation", get: () => H.inflationPct, set: v => H.inflationPct = v, min: 0, max: 6, step: 0.1, pct: true },
    { id: "sl-cashneed", label: "Retirement spending / yr (today's $)", get: () => A.retirementCashflowNeedToday, set: v => A.retirementCashflowNeedToday = v, min: 40000, max: 300000, step: 2000, pct: false },
    { id: "sl-s1-cpp", label: `${S1.name}: CPP start age`, get: () => S1.cppStartAge, set: v => S1.cppStartAge = v, min: 60, max: 70, step: 1, pct: false },
    { id: "sl-s1-oas", label: `${S1.name}: OAS start age`, get: () => S1.oasStartAge, set: v => S1.oasStartAge = v, min: 65, max: 70, step: 1, pct: false }
  ];
  if (STATE.spouse1.hasCorpAccount) cfg.splice(3, 0, { id: "sl-corp", label: "Corp account return", get: () => A.corpReturnPct, set: v => A.corpReturnPct = v, min: 0, max: 10, step: 0.1, pct: true });
  if (STATE.householdHasSpouse2) {
    cfg.push({ id: "sl-s2-cpp", label: `${S2.name}: CPP start age`, get: () => S2.cppStartAge, set: v => S2.cppStartAge = v, min: 60, max: 70, step: 1, pct: false });
    cfg.push({ id: "sl-s2-oas", label: `${S2.name}: OAS start age`, get: () => S2.oasStartAge, set: v => S2.oasStartAge = v, min: 65, max: 70, step: 1, pct: false });
  }
  return cfg;
}

function paintRangeFill(input) {
  const min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  const filled = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2a6fd6";
  const track = getComputedStyle(document.documentElement).getPropertyValue("--track").trim() || "#dfe0e6";
  input.style.background = `linear-gradient(to right, ${filled} 0%, ${filled} ${pct}%, ${track} ${pct}%, ${track} 100%)`;
}

function renderOutputSliders() {
  const container = document.getElementById("output-sliders");
  container.innerHTML = "";
  sliderConfig().forEach(c => {
    const wrap = document.createElement("div");
    wrap.className = "slider-item";
    const rawVal = c.pct ? +(c.get() * 100).toFixed(1) : c.get();
    wrap.innerHTML = `
      <label>${c.label}</label>
      <div class="slider-row">
        <input type="range" id="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${rawVal}">
        <span class="slider-val" id="${c.id}-val"></span>
      </div>`;
    container.appendChild(wrap);
    const input = wrap.querySelector("input");
    const valSpan = wrap.querySelector(".slider-val");
    function refreshLabel() {
      const raw = c.pct ? c.get() * 100 : c.get();
      valSpan.textContent = c.pct ? raw.toFixed(1) + "%" : (c.id.includes("cashneed") ? fmt$(c.get()) : Math.round(c.get()));
    }
    refreshLabel();
    paintRangeFill(input);
    input.addEventListener("input", () => {
      let v = parseFloat(input.value);
      if (c.pct) v = v / 100;
      c.set(v);
      refreshLabel();
      paintRangeFill(input);
      scheduleRecalc();
    });
    c._el = input; c._refresh = refreshLabel;
  });
}

function syncOutputSliders() {
  sliderConfig().forEach(c => {
    const el = document.getElementById(c.id);
    if (!el) return;
    const rawVal = c.pct ? +(c.get() * 100).toFixed(1) : c.get();
    if (document.activeElement !== el) el.value = rawVal;
    paintRangeFill(el);
    const valSpan = document.getElementById(c.id + "-val");
    if (valSpan) valSpan.textContent = c.pct ? (c.get() * 100).toFixed(1) + "%" : (c.id.includes("cashneed") ? fmt$(c.get()) : Math.round(c.get()));
  });
}

function renderSummaryTiles(rows) {
  const container = document.getElementById("summary-tiles");
  if (!rows.length) { container.innerHTML = ""; return; }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const peak = rows.reduce((a, r) => r.netWorth > a.netWorth ? r : a, rows[0]);
  const depletion = rows.find(r => r.moneyRunsOut);
  const totalTax = rows.reduce((a, r) => a + r.tax, 0);

  const tiles = [
    { label: "Net Worth Today", value: fmt$(first.netWorth), sub: `Age ${first.spouse1Age}`, cls: "" },
    { label: `Net Worth at Age ${last.spouse1Age}`, value: fmt$(last.netWorth), sub: `Peak ${fmt$(peak.netWorth)} in ${peak.calendarYear}`, cls: "" },
    depletion
      ? { label: "Retirement Funding", value: `⚠ Runs out at ${depletion.spouse1Age}`, sub: `Calendar year ${depletion.calendarYear}`, cls: "warn" }
      : { label: "Retirement Funding", value: "On track ✓", sub: `Funded through age ${last.spouse1Age}`, cls: "ok" },
    { label: "Total Lifetime Tax (today's $)", value: fmt$(totalTax), sub: "Federal + provincial, over full plan", cls: "" }
  ];
  container.innerHTML = tiles.map(t => `
    <div class="tile ${t.cls}">
      <div class="tile-label">${t.label}</div>
      <div class="tile-value">${t.value}</div>
      <div class="tile-sub">${t.sub}</div>
    </div>`).join("");
}

const TABLE_COLS = [
  { key: "calendarYear", label: "Year" },
  { key: "spouse1Age", label: "Age (S1)" },
  { key: "incomeEmployment", label: "Employment", money: true },
  { key: "incomePension", label: "Pension", money: true },
  { key: "incomeCPP", label: "CPP", money: true },
  { key: "incomeOAS", label: "OAS", money: true },
  { key: "withdrawalRRIF", label: "RRIF Wdrwl", money: true },
  { key: "withdrawalCorp", label: "Corp Div", money: true },
  { key: "withdrawalNonReg", label: "Non-Reg Wdrwl", money: true },
  { key: "withdrawalTFSA", label: "TFSA Wdrwl", money: true },
  { key: "grossIncome", label: "Gross Income", money: true },
  { key: "tax", label: "Tax", money: true },
  { key: "totalExpenses", label: "Expenses", money: true },
  { key: "surplus", label: "Surplus", money: true },
  { key: "netWorth", label: "Net Worth", money: true }
];

function renderDetailTable(rows) {
  const table = document.getElementById("detail-table");
  const thead = "<thead><tr>" + TABLE_COLS.map(c => `<th>${c.label}</th>`).join("") + "</tr></thead>";
  const tbody = "<tbody>" + rows.map(r => "<tr>" + TABLE_COLS.map(c => `<td>${c.money ? fmt$(r[c.key]) : r[c.key]}</td>`).join("") + "</tr>").join("") + "</tbody>";
  table.innerHTML = thead + tbody;
}

function recomputeAndRender() {
  LAST_ROWS = runProjection(STATE);
  renderSummaryTiles(LAST_ROWS);
  renderAllCharts(LAST_ROWS);
  renderDetailTable(LAST_ROWS);
  renderPensionPayoutSummary();
  syncOutputSliders();
}
