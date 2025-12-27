const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const BASE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdUIq-qzjnC82b-pdPGCJ3tbOpt-M8-gkDnrRSv7RKMMD5wg9qzQ4YK6vl06LK5L0/exec"; 

let globalData = [];
let currentLogView = 'arecanut';
let isLoading = false;

// ==================================
// INITIALIZATION
// ==================================
document.addEventListener('DOMContentLoaded', () => {
  if(document.getElementById("date")) {
    document.getElementById("date").valueAsDate = new Date();
  }
  
  showLoadingState();
  loadRemoteData();
  toggleInputs();
  showTab('dashboard');
  initPriceCalculator();
});

// ==================================
// NAVIGATION & UI MANAGEMENT
// ==================================
function showTab(id) {
  document.querySelectorAll(".tab-content").forEach(s => {
    s.classList.add("hidden");
    s.classList.remove("animate-fade-in");
  });
  
  const target = document.getElementById(id);
  if(target) {
    target.classList.remove("hidden");
    target.classList.add("animate-fade-in");
  }

  document.querySelectorAll(".nav-btn-mobile").forEach(b => {
    const isTarget = b.getAttribute('onclick').includes(id);
    b.classList.toggle("text-emerald-600", isTarget);
    b.classList.toggle("text-slate-400", !isTarget);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Force chart render when opening Analytics
  if(id === 'analytics') {
    if(typeof renderChartsAndAnalytics === 'function') {
      setTimeout(() => renderChartsAndAnalytics(), 50);
    }
  }
  
}

function toggleInputs() {
  const type = document.getElementById("entryType").value;
  const incInputs = document.getElementById("incomeInputs");
  const farmGroup = document.getElementById("farmGroup");
  
  const radios = document.getElementsByName('entryTypeSelect');
  radios.forEach(r => { if(r.value === type) r.checked = true; });
  
  if (type === "income") {
    incInputs?.classList.remove("hidden");
    farmGroup?.classList.remove("hidden");
  } else if (type === "expense") {
    incInputs?.classList.add("hidden");
    farmGroup?.classList.remove("hidden");
  } else {
    incInputs?.classList.add("hidden");
    farmGroup?.classList.add("hidden");
  }
}

// ==================================
// PRICE CALCULATOR
// ==================================
function initPriceCalculator() {
  const quantity = document.getElementById("quantity");
  const rate = document.getElementById("rate");
  const amount = document.getElementById("amount");
  
  if(!quantity || !rate || !amount) return;
  
  const calculateAmount = () => {
    const qty = parseFloat(quantity.value) || 0;
    const rt = parseFloat(rate.value) || 0;
    if(qty > 0 && rt > 0) {
      amount.value = (qty * rt).toFixed(2);
    }
  };
  
  quantity.addEventListener('input', calculateAmount);
  rate.addEventListener('input', calculateAmount);
}

// ==================================
// DATA FETCHING & PROCESSING
// ==================================
function showLoadingState() {
  const container = document.getElementById("recordsTableBody");
  if(container) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-slate-400">
        <div class="w-8 h-8 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-3"></div>
        <p class="text-xs font-semibold">Loading data...</p>
      </div>
    `;
  }
}

async function loadRemoteData() {
  if(isLoading) return;
  isLoading = true;
  showLoadingState();

  try {
    const response = await fetch(`${BASE_SHEET_URL}&_=${new Date().getTime()}`);
    if(!response.ok) throw new Error('Network response failed');
    
    const textData = await response.text();
    const json = JSON.parse(textData.substring(47).slice(0, -2));

    const remoteData = json.table.rows.map((row, index) => {
      const getCell = (i) => (row.c[i] ? (row.c[i].v !== null ? row.c[i].v : '') : '');
      let dateVal = getCell(0);
      
      // Fix Date formatting
      if(typeof dateVal === 'string' && dateVal.includes('Date')) {
        const parts = /\d+,\d+,\d+/.exec(dateVal)[0].split(',');
        const d = new Date(parts[0], parts[1], parts[2]);
        const offset = d.getTimezoneOffset();
        d.setMinutes(d.getMinutes() - offset); 
        dateVal = d.toISOString().split('T')[0];
      }

      // Safe String Cleaning (Crucial for filtering)
      const cleanString = (val) => String(val).toLowerCase().trim();

      return {
        originalIndex: index, 
        date: dateVal, 
        type: cleanString(getCell(1)), 
        farm: cleanString(getCell(2)),
        category: getCell(3), 
        notes: getCell(4), 
        amount: parseFloat(getCell(5)) || 0,
        quantity: parseFloat(getCell(6)) || 0
      };
    });

    processData(remoteData);
    showToast('Data Synced', 'success');
    
  } catch (e) {
    console.error('Data loading error:', e);
    const container = document.getElementById("recordsTableBody");
    if(container && container.children.length <= 1) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10">
          <p class="text-red-500 font-bold text-sm mb-2">Connection Failed</p>
          <button onclick="loadRemoteData()" class="px-4 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-700">Retry</button>
        </div>
      `;
    }
    showToast('Connection Error', 'error');
  } finally {
    isLoading = false;
  }
}

function processData(data) {
  globalData = data;
  
  let totalInc = 0, totalExp = 0, household = 0;
  let areca = { inc: 0, exp: 0 }, paddy = { inc: 0, exp: 0 };
  let monthlyData = {};
  let totalTransactions = data.length;

  data.forEach(r => {
    const amount = r.amount || 0;
    
    if (r.type === 'income') {
      totalInc += amount;
      if (r.farm === 'arecanut') areca.inc += amount;
      if (r.farm === 'paddy') paddy.inc += amount;
    } else if (r.type === 'expense') {
      totalExp += amount;
      if (r.farm === 'arecanut') areca.exp += amount;
      if (r.farm === 'paddy') paddy.exp += amount;
    } else if (r.type === 'household' || r.farm === 'household') { 
      household += amount; 
    }
    
    const d = new Date(r.date);
    if(!isNaN(d)) {
      const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if(!monthlyData[monthKey]) monthlyData[monthKey] = 0;
      if(r.type === 'income') monthlyData[monthKey] += amount;
    }
  });

  const netVal = totalInc - totalExp - household;
  const monthCount = Object.keys(monthlyData).length || 1;
  const avgMonthly = totalInc / monthCount;
  const savingsRate = totalInc > 0 ? ((netVal / totalInc) * 100).toFixed(1) : 0;
  
  let bestMonth = '---';
  let maxMonthIncome = 0;
  Object.entries(monthlyData).forEach(([month, income]) => {
    if(income > maxMonthIncome) {
      maxMonthIncome = income;
      bestMonth = month;
    }
  });

  const toINR = (v) => "₹" + Math.round(v).toLocaleString('en-IN');
  const arecaNet = areca.inc - areca.exp;
  const paddyNet = paddy.inc - paddy.exp;

  // --- UI UPDATES ---
  updateElement("totalIncome", toINR(totalInc));
  updateElement("totalExpense", toINR(totalExp));
  updateElement("householdTotal", toINR(household));
  updateElement("net", toINR(netVal));
  
  const headerNet = document.getElementById("headerNet");
  const headerBadge = document.getElementById("headerBadge");
  if(headerNet && headerBadge) {
    headerNet.textContent = toINR(netVal);
    headerNet.className = netVal >= 0 
      ? "text-sm font-bold text-emerald-700 truncate block"
      : "text-sm font-bold text-red-600 truncate block";
    headerBadge.className = netVal >= 0 
      ? "bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100/50"
      : "bg-red-50 px-3 py-1.5 rounded-full border border-red-100/50";
  }

  const savingsEl = document.getElementById("savingsRate");
  if(savingsEl) {
      savingsEl.textContent = savingsRate + "%";
      savingsEl.className = parseFloat(savingsRate) >= 0 
        ? "text-lg font-bold text-emerald-600 truncate" 
        : "text-lg font-bold text-red-600 truncate";
  }
  
  updateElement("arecanutNet", toINR(arecaNet));
  updateElement("arecanutIncome", toINR(areca.inc));
  updateElement("arecanutExpense", toINR(areca.exp));
  
  const arecaNetEl = document.getElementById("arecanutNet");
  if(arecaNetEl) {
      arecaNetEl.className = arecaNet >= 0 
        ? "font-mono font-bold text-sm bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md border border-emerald-100/50"
        : "font-mono font-bold text-sm bg-red-50 text-red-600 px-2 py-1 rounded-md border border-red-100/50";
  }

  updateElement("paddyNet", toINR(paddyNet));
  updateElement("paddyIncome", toINR(paddy.inc));
  updateElement("paddyExpense", toINR(paddy.exp));

  const paddyNetEl = document.getElementById("paddyNet");
  if(paddyNetEl) {
      paddyNetEl.className = paddyNet >= 0 
        ? "font-mono font-bold text-sm bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md border border-emerald-100/50"
        : "font-mono font-bold text-sm bg-red-50 text-red-600 px-2 py-1 rounded-md border border-red-100/50";
  }
  
  if(document.getElementById("arecaBar")) {
    let pAreca = areca.inc > 0 ? ((areca.inc - areca.exp) / areca.inc) * 100 : 0;
    pAreca = Math.max(0, Math.min(100, pAreca));
    document.getElementById("arecaBar").style.width = pAreca + "%";
    
    let pPaddy = paddy.inc > 0 ? ((paddy.inc - paddy.exp) / paddy.inc) * 100 : 0;
    pPaddy = Math.max(0, Math.min(100, pPaddy));
    if(document.getElementById("paddyBar")) {
      document.getElementById("paddyBar").style.width = pPaddy + "%";
    }
  }

  updateElement("totalTransactions", totalTransactions);
  updateElement("avgMonthly", toINR(avgMonthly));
  updateElement("bestMonth", bestMonth);

  if(typeof initAnalytics === 'function') initAnalytics();
  
  const analyticsSection = document.getElementById('analytics');
  if(analyticsSection && !analyticsSection.classList.contains('hidden')) {
      if(typeof renderChartsAndAnalytics === 'function') {
        renderChartsAndAnalytics();
      }
  }

  renderLogsTable();
}

// ==================================
// LOGS VIEW MANAGEMENT
// ==================================
function updateLogsView(view) {
  currentLogView = view;
  
  const views = ['arecanut', 'paddy', 'household'];
  views.forEach(v => {
    const btn = document.getElementById(`log-btn-${v}`);
    if(btn) {
      btn.className = v === view
        ? "flex-1 py-2 text-[11px] font-bold rounded-md bg-white text-slate-900 shadow-sm transition-all"
        : "flex-1 py-2 text-[11px] font-bold rounded-md text-slate-500 transition-all";
    }
  });

  renderLogsTable();
}

function renderLogsTable() {
  const container = document.getElementById("recordsTableBody");
  if(!container) return;
  container.innerHTML = "";

  const filteredData = globalData.filter(item => {
    if(currentLogView === 'household') return item.type === 'household' || item.farm === 'household';
    return item.farm === currentLogView;
  });

  const sortedData = filteredData.sort((a,b) => new Date(b.date) - new Date(a.date));

  if(sortedData.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <p class="text-slate-400 font-medium text-xs">No records found</p>
      </div>
    `;
    return;
  }

  sortedData.forEach((r) => {
    const actualIndex = globalData.findIndex(item => item.originalIndex === r.originalIndex);
    
    let amtColor = r.type === 'income' ? 'text-emerald-600' : (r.type === 'expense' ? 'text-red-600' : 'text-blue-600');
    let sign = r.type === 'income' ? '+' : '-';
    let iconBg = r.type === 'income' ? 'bg-emerald-50' : (r.type === 'expense' ? 'bg-red-50' : 'bg-blue-50');
    let iconColor = r.type === 'income' ? 'text-emerald-500' : (r.type === 'expense' ? 'text-red-500' : 'text-blue-500');
    
    let iconSvg = '';
    if(r.type === 'income') iconSvg = '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>';
    else if(r.type === 'household' || r.farm === 'household') iconSvg = '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>';
    else iconSvg = '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>';

    const dateObj = new Date(r.date);
    const dateStr = isNaN(dateObj) ? 'Invalid Date' : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    const card = document.createElement('div');
    card.className = "bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3 active:scale-[0.99] transition-transform";
    
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 ${iconBg} ${iconColor} rounded-full flex items-center justify-center shrink-0">
            ${iconSvg}
          </div>
          <div>
            <h4 class="font-bold text-slate-800 text-sm leading-tight">${r.category}</h4>
            <p class="text-xs text-slate-500 font-medium">${dateStr} ${r.quantity ? `• ${r.quantity}kg` : ''}</p>
          </div>
        </div>
        <div class="${amtColor} font-bold text-base">
          ${sign}₹${r.amount.toLocaleString('en-IN')}
        </div>
      </div>
      
      ${r.notes ? `<p class="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg">${r.notes}</p>` : ''}
      
      <div class="flex gap-2 pt-1">
        <button onclick="editEntry(${actualIndex})" class="flex-1 py-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 rounded hover:bg-slate-100">Edit</button>
        <button onclick="deleteEntry(${actualIndex}, this)" class="flex-1 py-1.5 text-[10px] font-bold text-red-400 bg-red-50/50 rounded hover:bg-red-50">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function updateElement(id, val) { 
  const el = document.getElementById(id); 
  if(el) el.textContent = val; 
}

// ==================================
// EDIT & DELETE OPERATIONS
// ==================================
function editEntry(unsortedIndex) {
  const item = globalData[unsortedIndex];
  if(!item) return;

  showTab('add');

  document.getElementById("entryType").value = item.type;
  toggleInputs();

  document.getElementById("date").value = item.date;
  document.getElementById("category").value = item.category;
  document.getElementById("notes").value = item.notes || ""; 
  document.getElementById("amount").value = item.amount;
  document.getElementById("quantity").value = item.quantity || "";
  
  if (item.type !== "household") {
    document.getElementById("farmType").value = item.farm;
  }

  document.getElementById("editRowIndex").value = item.originalIndex;
  document.getElementById("formTitle").textContent = "Edit Entry";
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Update Entry";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
}

function deleteEntry(unsortedIndex, btn) {
  const item = globalData[unsortedIndex];
  if(!item) return;
  
  if(!confirm(`Delete this entry?\n${item.category} - ₹${item.amount}`)) return;
  
  const originalText = btn.innerHTML;
  btn.innerHTML = '...';
  btn.disabled = true;
  
  const params = new URLSearchParams();
  params.append("action", "delete");
  params.append("rowIndex", item.originalIndex);
  params.append("category", item.category);
  params.append("amount", item.amount);
  params.append("type", item.type);
  
  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(r => r.json())
    .then(d => { 
      if(d.result === "success") { 
        loadRemoteData();
        showToast('Deleted', 'success');
      } else {
        alert("Error");
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    })
    .catch(err => {
      alert("Network Error");
      btn.innerHTML = originalText;
      btn.disabled = false;
    });
}

function saveEntry() {
  const saveBtn = document.getElementById("saveBtn");
  const type = document.getElementById("entryType").value;
  const amt = parseFloat(document.getElementById("amount").value) || 0;
  const editIndex = document.getElementById("editRowIndex").value;
  const category = document.getElementById("category").value.trim();

  if (amt <= 0 || !category) {
    showToast('Invalid Input', 'error');
    return;
  }
  
  const isEditing = (editIndex !== "" && editIndex !== null);

  saveBtn.textContent = "Saving...";
  saveBtn.disabled = true;

  const params = new URLSearchParams();
  params.append("date", document.getElementById("date").value);
  params.append("type", type);
  params.append("farm", type === "household" ? "household" : document.getElementById("farmType").value);
  params.append("category", category);
  params.append("notes", document.getElementById("notes").value); 
  params.append("amount", amt);
  params.append("quantity", document.getElementById("quantity").value || 0);

  if (isEditing) {
    params.append("action", "edit"); 
    params.append("rowIndex", editIndex);
  } else {
    params.append("action", "add");
  }

  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(r => r.json())
    .then(d => { 
      if(d.result === "success") { 
        resetForm();
        setTimeout(loadRemoteData, 500); 
        showTab('dashboard');
        showToast('Saved', 'success');
      } else {
        alert("Error");
      }
    })
    .catch(err => {
      alert("Failed");
    })
    .finally(() => { 
      saveBtn.textContent = document.getElementById("formTitle").textContent === "New Entry" ? "Save Entry" : "Update Entry";
      saveBtn.disabled = false; 
    });
}

function resetForm() {
  document.getElementById("editRowIndex").value = "";
  document.getElementById("formTitle").textContent = "New Entry";
  document.getElementById("date").valueAsDate = new Date();
  document.getElementById("amount").value = "";
  document.getElementById("quantity").value = "";
  document.getElementById("rate").value = "";
  document.getElementById("category").value = "";
  document.getElementById("notes").value = "";
  document.getElementById("entryType").value = "income";
  toggleInputs();
  
  document.getElementById("saveBtn").textContent = "Save Entry";
  document.getElementById("cancelEditBtn").classList.add("hidden");
}

function showToast(message, type) {
  const bg = type === 'success' ? 'bg-slate-800' : 'bg-red-600';
  const toast = document.createElement('div');
  toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 ${bg} text-white px-4 py-2 rounded-lg shadow-lg z-50 text-xs font-bold animate-slide-up`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}