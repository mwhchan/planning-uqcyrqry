/* ==========================================================================
   main.js — PIN gate, tab wiring, and the recalculation scheduler.

   PIN: stored only as a SHA-256 hash (client-side check — obscurity, not
   real security, since this is a static site with no server). Change the
   PIN by hashing a new 4-digit code, e.g. in a browser console:
     crypto.subtle.digest("SHA-256", new TextEncoder().encode("1234"))
       .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")))
   and swapping PIN_HASH below.
   ========================================================================== */

const PIN_HASH = "13b15ff5b941ca90e9bc41495c160cd29bda02991b4236d78268a40acd861955";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function tryUnlock() {
  const input = document.getElementById("pin-input");
  const err = document.getElementById("pin-error");
  const hash = await sha256Hex(input.value.trim());
  if (hash === PIN_HASH) {
    sessionStorage.setItem("rf_unlocked", "1");
    document.getElementById("pin-gate").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    initApp();
  } else {
    err.textContent = "Incorrect PIN.";
    input.value = "";
    input.focus();
  }
}

function initPinGate() {
  if (sessionStorage.getItem("rf_unlocked") === "1") {
    document.getElementById("pin-gate").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    initApp();
    return;
  }
  document.getElementById("pin-submit").addEventListener("click", tryUnlock);
  document.getElementById("pin-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
}

let recalcTimer = null;
function scheduleRecalc() {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(recomputeAndRender, 180);
}

function wireTabs() {
  document.querySelectorAll(".main-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".main-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-inputs").classList.toggle("hidden", btn.dataset.tab !== "inputs");
      document.getElementById("tab-outputs").classList.toggle("hidden", btn.dataset.tab !== "outputs");
    });
  });
  document.querySelectorAll(".sub-tabs").forEach(nav => {
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".sub-tab");
      if (!btn) return;
      const panelRoot = nav.parentElement;
      nav.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      panelRoot.querySelectorAll(".sub-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === btn.dataset.sub));
    });
  });
}

function wireHeader() {
  const nameInput = document.getElementById("scenario-name");
  nameInput.value = STATE.meta.scenarioName;
  nameInput.addEventListener("input", () => { STATE.meta.scenarioName = nameInput.value; });
}

function wireExport() {
  document.getElementById("btn-export-excel").addEventListener("click", exportToExcel);
  document.getElementById("btn-print").addEventListener("click", () => window.print());
  document.getElementById("btn-save-json").addEventListener("click", saveScenarioJSON);
  document.getElementById("btn-load-json").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) loadScenarioJSON(e.target.files[0]);
    e.target.value = "";
  });
}

function initApp() {
  wireTabs();
  wireHeader();
  wireExport();
  renderInputsAll();
  renderOutputSliders();
  recomputeAndRender();
}

document.addEventListener("DOMContentLoaded", initPinGate);
