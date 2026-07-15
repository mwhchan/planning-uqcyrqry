/* ==========================================================================
   charts.js — Chart.js renderers. Palette + roles from the dataviz skill's
   validated default (8-slot categorical, fixed order; status colors for
   surplus/deficit). Colorblind-safe order is preserved — never reordered
   per-chart.
   ========================================================================== */

const PALETTE_LIGHT = {
  cat: ["#2a78d6", "#008300", "#e87ba4", "#eda100", "#1baf7a", "#eb6834", "#4a3aa7", "#e34948"],
  ink: "#0b0b0b", inkSecondary: "#52514e", inkMuted: "#898781",
  grid: "#e1e0d9", surface: "#fcfcfb",
  good: "#0ca30c", critical: "#d03b3b"
};
const PALETTE_DARK = {
  cat: ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70", "#d95926", "#9085e9", "#e66767"],
  ink: "#ffffff", inkSecondary: "#c3c2b7", inkMuted: "#898781",
  grid: "#2c2c2a", surface: "#1a1a19",
  good: "#0ca30c", critical: "#e66767"
};
function currentPalette() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? PALETTE_DARK : PALETTE_LIGHT;
}
function fmt$(v) {
  const sign = v < 0 ? "-" : "";
  v = Math.abs(v);
  if (v >= 1e6) return sign + "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return sign + "$" + (v / 1e3).toFixed(0) + "k";
  return sign + "$" + v.toFixed(0);
}

let charts = {};
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } }

const commonScales = (P) => ({
  x: { grid: { display: false }, ticks: { color: P.inkMuted, maxRotation: 0, autoSkip: true } },
  y: { grid: { color: P.grid }, ticks: { color: P.inkMuted, callback: (v) => fmt$(v) }, border: { display: false } }
});
const commonPlugins = (P) => ({
  legend: { position: "bottom", labels: { color: P.inkSecondary, boxWidth: 12, font: { size: 11 } } },
  tooltip: {
    backgroundColor: P.surface, titleColor: P.ink, bodyColor: P.inkSecondary,
    borderColor: P.grid, borderWidth: 1, padding: 10,
    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` }
  }
});

function renderNetWorthChart(rows) {
  const P = currentPalette();
  destroyChart("networth");
  const labels = rows.map(r => r.calendarYear);
  const series = [
    { label: "RRSP/RRIF", data: rows.map(r => r.balS1RRSP + r.balS2RRSP), color: P.cat[0] },
    { label: "TFSA", data: rows.map(r => r.balS1TFSA + r.balS2TFSA), color: P.cat[1] },
    { label: "Non-Registered", data: rows.map(r => r.balS1NonReg + r.balS2NonReg), color: P.cat[2] },
    { label: "Corporate", data: rows.map(r => r.balS1Corp + r.balS2Corp), color: P.cat[3] },
    { label: "RESP", data: rows.map(r => r.balRESP), color: P.cat[4] },
    { label: "Real Estate", data: rows.map(r => r.balRealEstate), color: P.cat[5] },
    { label: "Other / Insurance CV", data: rows.map(r => r.balOtherInv + r.balInsuranceCV), color: P.cat[6] },
    { label: "Debt", data: rows.map(r => -r.balDebt), color: P.cat[7] }
  ];
  charts.networth = new Chart(document.getElementById("chart-networth"), {
    type: "line",
    data: {
      labels, datasets: series.map(s => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color + "cc",
        fill: true, stack: "s", borderWidth: 1, pointRadius: 0, tension: 0.1
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { ...commonScales(P), x: { ...commonScales(P).x, stacked: true }, y: { ...commonScales(P).y, stacked: true } },
      plugins: commonPlugins(P),
      interaction: { mode: "index", intersect: false }
    }
  });
}

function renderIncomeChart(rows) {
  const P = currentPalette();
  destroyChart("income");
  const labels = rows.map(r => r.calendarYear);
  const series = [
    { label: "Employment", data: rows.map(r => r.incomeEmployment), color: P.cat[0] },
    { label: "Pension", data: rows.map(r => r.incomePension), color: P.cat[1] },
    { label: "CPP", data: rows.map(r => r.incomeCPP), color: P.cat[2] },
    { label: "OAS", data: rows.map(r => r.incomeOAS), color: P.cat[3] },
    { label: "RRIF Withdrawal", data: rows.map(r => r.withdrawalRRIF), color: P.cat[4] },
    { label: "Corp Dividends", data: rows.map(r => r.withdrawalCorp), color: P.cat[5] },
    { label: "Non-Reg Withdrawal", data: rows.map(r => r.withdrawalNonReg), color: P.cat[6] },
    { label: "TFSA Withdrawal", data: rows.map(r => r.withdrawalTFSA), color: P.cat[7] }
  ];
  charts.income = new Chart(document.getElementById("chart-income"), {
    type: "line",
    data: {
      labels, datasets: series.map(s => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color + "cc",
        fill: true, stack: "s", borderWidth: 1, pointRadius: 0, tension: 0.1
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { ...commonScales(P), x: { ...commonScales(P).x, stacked: true }, y: { ...commonScales(P).y, stacked: true } },
      plugins: commonPlugins(P),
      interaction: { mode: "index", intersect: false }
    }
  });
}

function renderCashflowChart(rows) {
  const P = currentPalette();
  destroyChart("cashflow");
  const labels = rows.map(r => r.calendarYear);
  const data = rows.map(r => r.surplus);
  const colors = data.map(v => v >= 0 ? P.good : P.critical);
  charts.cashflow = new Chart(document.getElementById("chart-cashflow"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Surplus / Deficit", data, backgroundColor: colors }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: commonScales(P),
      plugins: {
        ...commonPlugins(P),
        legend: {
          display: true, position: "bottom",
          labels: {
            color: P.inkSecondary, boxWidth: 12, font: { size: 11 },
            generateLabels: () => [
              { text: "Surplus", fillStyle: P.good, strokeStyle: P.good },
              { text: "Deficit", fillStyle: P.critical, strokeStyle: P.critical }
            ]
          }
        }
      }
    }
  });
}

function renderRunwayChart(rows) {
  const P = currentPalette();
  destroyChart("runway");
  const labels = rows.map(r => r.calendarYear);
  const series = [
    { label: "RRSP/RRIF", data: rows.map(r => r.balS1RRSP + r.balS2RRSP), color: P.cat[0] },
    { label: "TFSA", data: rows.map(r => r.balS1TFSA + r.balS2TFSA), color: P.cat[1] },
    { label: "Non-Registered", data: rows.map(r => r.balS1NonReg + r.balS2NonReg), color: P.cat[2] },
    { label: "Corporate", data: rows.map(r => r.balS1Corp + r.balS2Corp), color: P.cat[3] },
    { label: "RESP", data: rows.map(r => r.balRESP), color: P.cat[4] }
  ];
  charts.runway = new Chart(document.getElementById("chart-runway"), {
    type: "line",
    data: {
      labels,
      datasets: series.map(s => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color,
        borderWidth: 2, pointRadius: 0, tension: 0.15
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: commonScales(P),
      plugins: commonPlugins(P),
      interaction: { mode: "index", intersect: false }
    }
  });
}

function renderAllCharts(rows) {
  renderNetWorthChart(rows);
  renderIncomeChart(rows);
  renderCashflowChart(rows);
  renderRunwayChart(rows);
}
