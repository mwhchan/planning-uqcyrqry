/* ==========================================================================
   charts.js — Chart.js renderers. Palette + roles from the dataviz skill's
   validated default (8-slot categorical, fixed order). Custom crosshair +
   external HTML tooltip replace Chart.js's default box for a more refined,
   "value leads, label follows" readout with line-key swatches.
   ========================================================================== */

const PALETTE_LIGHT = {
  cat: ["#2a78d6", "#008300", "#e87ba4", "#eda100", "#1baf7a", "#eb6834", "#4a3aa7", "#e34948"],
  ink: "#14161a", inkSecondary: "#565a63", inkMuted: "#8b8f97",
  grid: "#ececea", surface: "#ffffff",
  good: "#0ca30c", critical: "#d03b3b"
};
const PALETTE_DARK = {
  cat: ["#3987e5", "#00a300", "#d55181", "#c98500", "#199e70", "#d95926", "#9085e9", "#e66767"],
  ink: "#ffffff", inkSecondary: "#c3c2b7", inkMuted: "#8f8d85",
  grid: "#242422", surface: "#1a1a19",
  good: "#1fbf4a", critical: "#e66767"
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
function hexAlpha(hex, alpha) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex + a;
}
// Scriptable vertical gradient fill — soft glass wash, not a flat saturated block.
function verticalGradientFactory(hex, topAlpha, bottomAlpha) {
  return (context) => {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return hexAlpha(hex, topAlpha);
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, hexAlpha(hex, topAlpha));
    g.addColorStop(1, hexAlpha(hex, bottomAlpha));
    return g;
  };
}

/* ---------------- Crosshair (registered once, global) ---------------- */
const crosshairPlugin = {
  id: "crosshair",
  afterDatasetsDraw(chart) {
    const tt = chart.tooltip;
    if (!tt || !tt.opacity) return;
    const P = currentPalette();
    const { top, bottom } = chart.chartArea;
    const x = tt.caretX;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexAlpha(P.inkMuted, 0.4);
    ctx.stroke();
    ctx.restore();
  }
};
if (typeof Chart !== "undefined") Chart.register(crosshairPlugin);

/* ---------------- Custom external tooltip ---------------- */
function makeExternalTooltip(wrapEl, opts = {}) {
  let tooltipEl = wrapEl.querySelector(".chart-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chart-tooltip";
    wrapEl.appendChild(tooltipEl);
  }
  return (context) => {
    const tt = context.tooltip;
    if (!tt || tt.opacity === 0) { tooltipEl.style.opacity = 0; return; }
    let html = "";
    if (tt.title && tt.title.length) html += `<div class="ct-title">${tt.title[0]}</div>`;
    const totalPoint = tt.dataPoints.find(dp => dp.dataset._isTotal);
    const points = tt.dataPoints.filter(dp => !dp.dataset._isTotal && (opts.hideZero ? Math.abs(dp.parsed.y) > 0.5 : true))
      .sort((a, b) => Math.abs(b.parsed.y) - Math.abs(a.parsed.y));
    points.forEach(dp => {
      const color = dp.dataset._seriesColor || dp.dataset.borderColor || dp.dataset.backgroundColor;
      html += `<div class="ct-row"><span class="ct-key" style="background:${color}"></span><span class="ct-label">${dp.dataset.label}</span><span class="ct-value">${fmt$(dp.parsed.y)}</span></div>`;
    });
    if (totalPoint) {
      html += `<div class="ct-row ct-total"><span class="ct-label">${totalPoint.dataset.label}</span><span class="ct-value">${fmt$(totalPoint.parsed.y)}</span></div>`;
    }
    tooltipEl.innerHTML = html;
    tooltipEl.style.opacity = 1;

    const canvasRect = context.chart.canvas.getBoundingClientRect();
    const wrapRect = wrapEl.getBoundingClientRect();
    const originX = canvasRect.left - wrapRect.left;
    const originY = canvasRect.top - wrapRect.top;
    const ttW = tooltipEl.offsetWidth, ttH = tooltipEl.offsetHeight;
    let left = originX + tt.caretX + 14;
    if (left + ttW > wrapRect.width) left = originX + tt.caretX - ttW - 14;
    let top = originY + tt.caretY - ttH / 2;
    top = Math.max(4, Math.min(top, wrapRect.height - ttH - 4));
    tooltipEl.style.transform = `translate(${left}px, ${top}px)`;
  };
}

let charts = {};
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } }

const commonScales = (P) => ({
  x: { grid: { display: false }, border: { display: false }, ticks: { color: P.inkMuted, maxRotation: 0, autoSkip: true, font: { size: 10.5 } } },
  y: { grid: { color: P.grid, drawTicks: false }, border: { display: false }, ticks: { color: P.inkMuted, callback: (v) => fmt$(v), maxTicksLimit: 6, font: { size: 10.5 } } }
});
const legendOpts = (P) => ({
  position: "bottom", align: "start",
  labels: {
    color: P.inkSecondary, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "rectRounded",
    padding: 14, font: { size: 11, weight: "500" }
  }
});

function baseOptions(P, wrapEl, tooltipOpts) {
  return {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { top: 6, right: 6, bottom: 0, left: 0 } },
    interaction: { mode: "index", intersect: false },
    scales: commonScales(P),
    plugins: {
      legend: legendOpts(P),
      tooltip: { enabled: false, external: makeExternalTooltip(wrapEl, tooltipOpts) }
    }
  };
}

// Shared "modern glass" treatment for the two stacked hero charts: soft
// vertical-gradient fills with no hard border between bands, monotone
// smoothing (no fake overshoot bumps), and a bold neutral "Total" line
// drawn on top as the headline number.
function stackedAreaDataset(s, P) {
  return {
    label: s.label, data: s.data,
    borderColor: "transparent", backgroundColor: verticalGradientFactory(s.color, 0.5, 0.08),
    fill: true, stack: "s", borderWidth: 0,
    cubicInterpolationMode: "monotone",
    pointRadius: 0, pointHoverRadius: 4,
    pointHoverBackgroundColor: s.color, pointHoverBorderColor: P.surface, pointHoverBorderWidth: 2,
    _seriesColor: s.color, order: 1
  };
}
function totalLineDataset(label, data, P) {
  return {
    label, data, borderColor: P.ink, backgroundColor: P.ink,
    fill: false, stack: "total", borderWidth: 2.25,
    cubicInterpolationMode: "monotone",
    pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2,
    pointHoverBackgroundColor: P.ink, pointHoverBorderColor: P.surface,
    _isTotal: true, order: 0
  };
}

function renderNetWorthChart(rows) {
  const P = currentPalette();
  destroyChart("networth");
  const wrapEl = document.getElementById("chart-networth").parentElement;
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
  const opts = baseOptions(P, wrapEl, { hideZero: true });
  opts.scales.y.stacked = true; opts.scales.x.stacked = true;
  charts.networth = new Chart(document.getElementById("chart-networth"), {
    type: "line",
    data: {
      labels,
      datasets: [
        ...series.map(s => stackedAreaDataset(s, P)),
        totalLineDataset("Total Net Worth", rows.map(r => r.netWorth), P)
      ]
    },
    options: opts
  });
}

function renderIncomeChart(rows) {
  const P = currentPalette();
  destroyChart("income");
  const wrapEl = document.getElementById("chart-income").parentElement;
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
  const opts = baseOptions(P, wrapEl, { hideZero: true });
  opts.scales.y.stacked = true; opts.scales.x.stacked = true;
  charts.income = new Chart(document.getElementById("chart-income"), {
    type: "line",
    data: {
      labels,
      datasets: [
        ...series.map(s => stackedAreaDataset(s, P)),
        totalLineDataset("Total Income", rows.map(r => r.grossIncome), P)
      ]
    },
    options: opts
  });
}

function renderCashflowChart(rows) {
  const P = currentPalette();
  destroyChart("cashflow");
  const wrapEl = document.getElementById("chart-cashflow").parentElement;
  const labels = rows.map(r => r.calendarYear);
  const data = rows.map(r => r.surplus);
  const colors = data.map(v => v >= 0 ? P.good : P.critical);
  const radius = (ctx) => {
    const v = ctx.raw ?? 0;
    return v >= 0
      ? { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 }
      : { topLeft: 0, topRight: 0, bottomLeft: 3, bottomRight: 3 };
  };
  const opts = baseOptions(P, wrapEl, { hideZero: false, showTotal: false });
  opts.plugins.legend = {
    display: true, position: "bottom", align: "start",
    labels: {
      color: P.inkSecondary, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "rectRounded",
      padding: 14, font: { size: 11, weight: "500" },
      generateLabels: () => [
        { text: "Surplus", fillStyle: P.good, strokeStyle: P.good, pointStyle: "rectRounded" },
        { text: "Deficit", fillStyle: P.critical, strokeStyle: P.critical, pointStyle: "rectRounded" }
      ]
    }
  };
  charts.cashflow = new Chart(document.getElementById("chart-cashflow"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Surplus / Deficit", data, backgroundColor: colors, borderRadius: radius, borderSkipped: false, maxBarThickness: 18 }] },
    options: opts
  });
}

function renderRunwayChart(rows) {
  const P = currentPalette();
  destroyChart("runway");
  const wrapEl = document.getElementById("chart-runway").parentElement;
  const labels = rows.map(r => r.calendarYear);
  const series = [
    { label: "RRSP/RRIF", data: rows.map(r => r.balS1RRSP + r.balS2RRSP), color: P.cat[0] },
    { label: "TFSA", data: rows.map(r => r.balS1TFSA + r.balS2TFSA), color: P.cat[1] },
    { label: "Non-Registered", data: rows.map(r => r.balS1NonReg + r.balS2NonReg), color: P.cat[2] },
    { label: "Corporate", data: rows.map(r => r.balS1Corp + r.balS2Corp), color: P.cat[3] },
    { label: "RESP", data: rows.map(r => r.balRESP), color: P.cat[4] }
  ];
  const opts = baseOptions(P, wrapEl, { hideZero: true, showTotal: false });
  charts.runway = new Chart(document.getElementById("chart-runway"), {
    type: "line",
    data: {
      labels,
      datasets: series.map(s => ({
        label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2,
        pointHoverBorderColor: P.surface, pointHoverBackgroundColor: s.color, tension: 0.15
      }))
    },
    options: opts
  });
}

function renderAllCharts(rows) {
  renderNetWorthChart(rows);
  renderIncomeChart(rows);
  renderCashflowChart(rows);
  renderRunwayChart(rows);
}
