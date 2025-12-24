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
  
  // Add loading state indicators
  showLoadingState();
  
  loadRemoteData();
  toggleInputs();
  showTab('dashboard');
  
  // Initialize quantity/rate calculator
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

  // Update navigation buttons state
  document.querySelectorAll(".nav-btn-mobile").forEach(b => {
    if(b.getAttribute('onclick').includes(id)) {
      b.classList.add("active", "text-emerald-500");
      b.classList.remove("inactive", "text-slate-400");
    } else {
      b.classList.add("inactive", "text-slate-400");
      b.classList.remove("active", "text-emerald-500");
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger chart rendering if entering analytics
  if(id === 'analytics' && typeof renderChartsAndAnalytics === 'function') {
    setTimeout(() => renderChartsAndAnalytics(), 150);
  }
}

function toggleInputs() {
  const type = document.getElementById("entryType").value;
  const incInputs = document.getElementById("incomeInputs");
  const farmGroup = document.getElementById("farmGroup");
  
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
  const tbody = document.getElementById("recordsTableBody");
  if(tbody) {
    tbody.innerHTML = `
      <tr><td colspan="4" class="p-8 text-center">
        <div class="flex flex-col items-center gap-3">
          <div class="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
          <p class="text-slate-500 font-semibold">Loading your data...</p>
        </div>
      </td></tr>
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
      
      // Handle Google Sheets date formatting
      if(typeof dateVal === 'string' && dateVal.includes('Date')) {
        const parts = /\d+,\d+,\d+/.exec(dateVal)[0].split(',');
        const d = new Date(parts[0], parts[1], parts[2]);
        const offset = d.getTimezoneOffset();
        d.setMinutes(d.getMinutes() - offset); 
        dateVal = d.toISOString().split('T')[0];
      }

      return {
        originalIndex: index, 
        date: dateVal, 
        type: getCell(1), 
        farm: getCell(2),
        category: getCell(3), 
        notes: getCell(4), 
        amount: parseFloat(getCell(5)) || 0,
        quantity: parseFloat(getCell(6)) || 0
      };
    });

    processData(remoteData);
    
    // Success feedback
    showToast('Data synced successfully', 'success');
    
  } catch (e) {
    console.error('Data loading error:', e);
    
    const tbody = document.getElementById("recordsTableBody");
    if(tbody && tbody.children.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="4" class="p-8 text-center">
          <div class="flex flex-col items-center gap-3">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <span class="text-2xl">⚠️</span>
            </div>
            <p class="text-red-600 font-bold">Connection Error</p>
            <button onclick="loadRemoteData()" class="mt-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all">
              Retry
            </button>
          </div>
        </td></tr>
      `;
    }
    
    showToast('Failed to load data. Please check your connection.', 'error');
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

  // Calculate all metrics
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
    } else { 
      household += amount; 
    }
    
    // Monthly aggregation
    const d = new Date(r.date);
    if(!isNaN(d)) {
      const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if(!monthlyData[monthKey]) monthlyData[monthKey] = 0;
      if(r.type === 'income') monthlyData[monthKey] += amount;
    }
  });

  // Calculate derived metrics
  const netVal = totalInc - totalExp - household;
  const monthCount = Object.keys(monthlyData).length || 1;
  const avgMonthly = totalInc / monthCount;
  const savingsRate = totalInc > 0 ? ((netVal / totalInc) * 100).toFixed(1) : 0;
  
  // Find best month
  let bestMonth = '---';
  let maxMonthIncome = 0;
  Object.entries(monthlyData).forEach(([month, income]) => {
    if(income > maxMonthIncome) {
      maxMonthIncome = income;
      bestMonth = month;
    }
  });

  // Update Dashboard - Main Cards
  updateElement("totalIncome", "₹" + totalInc.toLocaleString('en-IN'));
  updateElement("totalExpense", "₹" + totalExp.toLocaleString('en-IN'));
  updateElement("householdTotal", "₹" + household.toLocaleString('en-IN'));
  updateElement("net", "₹" + netVal.toLocaleString('en-IN'));
  
  // Update header
  const headerNet = document.getElementById("headerNet");
  if(headerNet) {
    headerNet.textContent = "₹" + netVal.toLocaleString('en-IN');
    headerNet.className = netVal >= 0 ? "text-lg font-bold text-emerald-600" : "text-lg font-bold text-red-500";
  }
  
  // Update farm-specific cards with detailed breakdown
  updateElement("arecanutNet", "₹" + (areca.inc - areca.exp).toLocaleString('en-IN'));
  updateElement("arecanutIncome", "₹" + areca.inc.toLocaleString('en-IN'));
  updateElement("arecanutExpense", "₹" + areca.exp.toLocaleString('en-IN'));
  
  updateElement("paddyNet", "₹" + (paddy.inc - paddy.exp).toLocaleString('en-IN'));
  updateElement("paddyIncome", "₹" + paddy.inc.toLocaleString('en-IN'));
  updateElement("paddyExpense", "₹" + paddy.exp.toLocaleString('en-IN'));
  
  // Update quick stats
  updateElement("totalTransactions", totalTransactions);
  updateElement("avgMonthly", "₹" + Math.round(avgMonthly).toLocaleString('en-IN'));
  updateElement("bestMonth", bestMonth);
  updateElement("savingsRate", savingsRate + "%");
  
  // Progress bars with percentages
  if(document.getElementById("arecaBar")) {
    let pAreca = areca.inc > 0 ? ((areca.inc - areca.exp) / areca.inc) * 100 : 0;
    pAreca = Math.max(0, Math.min(100, pAreca));
    document.getElementById("arecaBar").style.width = pAreca + "%";
    updateElement("arecaPercent", Math.round(pAreca) + "%");
    
    let pPaddy = paddy.inc > 0 ? ((paddy.inc - paddy.exp) / paddy.inc) * 100 : 0;
    pPaddy = Math.max(0, Math.min(100, pPaddy));
    if(document.getElementById("paddyBar")) {
      document.getElementById("paddyBar").style.width = pPaddy + "%";
      updateElement("paddyPercent", Math.round(pPaddy) + "%");
    }
  }

  // Initialize analytics
  if(typeof initAnalytics === 'function') {
    initAnalytics();
  }

  // Render charts if on analytics tab
  const analyticsSection = document.getElementById('analytics');
  if(analyticsSection && !analyticsSection.classList.contains('hidden') && typeof renderChartsAndAnalytics === 'function') {
    renderChartsAndAnalytics();
  }

  // Render transaction logs
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
      if(v === view) {
        btn.className = "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all bg-emerald-600 text-white shadow-md";
      } else {
        btn.className = "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all text-slate-500 hover:bg-slate-50";
      }
    }
  });

  renderLogsTable();
}

function renderLogsTable() {
  const tbody = document.getElementById("recordsTableBody");
  if(!tbody) return;
  tbody.innerHTML = "";

  // Filter data
  const filteredData = globalData.filter(item => {
    if(currentLogView === 'household') return item.type === 'household';
    return item.farm === currentLogView;
  });

  // Sort by date (newest first)
  const sortedData = filteredData.sort((a,b) => new Date(b.date) - new Date(a.date));

  // Empty state
  if(sortedData.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="4" class="block w-full p-12 text-center">
        <div class="flex flex-col items-center gap-4">
          <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
            <span class="text-4xl">📋</span>
          </div>
          <p class="text-slate-500 font-semibold">No records found for ${currentLogView}</p>
          <button onclick="showTab('add')" class="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all">
            Add First Entry
          </button>
        </div>
      </td></tr>
    `;
    return;
  }

  // Render cards
  sortedData.forEach((r) => {
    const actualIndex = globalData.findIndex(item => item.originalIndex === r.originalIndex);
    
    // Colors & formatting
    let amtColor = r.type === 'income' ? 'text-emerald-600' : (r.type === 'expense' ? 'text-red-500' : 'text-amber-500');
    let sign = r.type === 'income' ? '+' : '-';
    let bgGradient = r.type === 'income' ? 'from-emerald-50/50 to-white' : (r.type === 'expense' ? 'from-red-50/50 to-white' : 'from-amber-50/50 to-white');
    
    const dateObj = new Date(r.date);
    const day = isNaN(dateObj) ? '00' : dateObj.getDate();
    const month = isNaN(dateObj) ? '---' : dateObj.toLocaleString('default', { month: 'short' });

    const tr = document.createElement('tr');
    tr.className = `block bg-gradient-to-br ${bgGradient} mb-4 rounded-2xl border-2 border-slate-200/60 shadow-md overflow-hidden transition-all hover:shadow-lg`;
    
    // Click handler for expanding notes
    tr.onclick = function(e) {
      if(e.target.closest('button')) return;

      const notesDiv = this.querySelector('.notes-section');
      const chevron = this.querySelector('.chevron-icon');
      
      if (notesDiv.classList.contains('hidden')) {
        notesDiv.classList.remove('hidden');
        notesDiv.classList.add('animate-fade-in');
        chevron.style.transform = 'rotate(180deg)';
        this.classList.add('ring-2', 'ring-emerald-500/50'); 
      } else {
        notesDiv.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
        this.classList.remove('ring-2', 'ring-emerald-500/50');
      }
    };

    tr.innerHTML = `
      <td class="block w-full p-0 border-none">
        
        <div class="p-5 relative cursor-pointer">
          <div class="flex items-center justify-between gap-4">
            
            <!-- Date Badge -->
            <div class="flex items-center gap-4 overflow-hidden">
              <div class="flex flex-col items-center justify-center w-14 h-14 bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-xl shrink-0 shadow-sm">
                <span class="text-[10px] font-bold text-slate-400 uppercase leading-none">${month}</span>
                <span class="text-xl font-bold text-slate-800 leading-none mt-0.5">${day}</span>
              </div>
              
              <!-- Category Info -->
              <div class="min-w-0">
                <h4 class="text-slate-900 font-bold text-lg truncate leading-tight mb-1">${r.category}</h4>
                <div class="flex items-center gap-2">
                  ${r.quantity ? `<span class="px-2 py-0.5 bg-slate-100 rounded-md text-[10px] font-bold text-slate-600">${r.quantity} Kg</span>` : ''}
                  <div class="flex items-center gap-1">
                    <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      ${r.notes ? "Details" : "No Notes"}
                    </span>
                    <svg class="chevron-icon w-3 h-3 text-slate-300 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <!-- Amount -->
            <div class="${amtColor} font-mono font-extrabold text-xl whitespace-nowrap shrink-0">
              ${sign}₹${r.amount.toLocaleString('en-IN')}
            </div>
          </div>

          <!-- Expandable Notes Section -->
          <div class="notes-section hidden mt-5 pt-4 border-t border-dashed border-slate-300">
            <div class="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-slate-200">
              <p class="text-sm text-slate-700 leading-relaxed">
                ${r.notes || '<span class="italic text-slate-400">No additional notes</span>'}
              </p>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex w-full border-t-2 border-slate-200/60">
          
          <button onclick="editEntry(${actualIndex})" 
            class="w-1/2 py-4 flex items-center justify-center gap-2 text-slate-600 hover:text-emerald-600 hover:bg-white/80 transition-all active:scale-95 border-r-2 border-slate-200/60 font-bold">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span class="text-xs uppercase tracking-wider">Edit</span>
          </button>

          <button onclick="deleteEntry(${actualIndex}, this)" 
            class="w-1/2 py-4 flex items-center justify-center gap-2 text-slate-600 hover:text-red-500 hover:bg-white/80 transition-all active:scale-95 font-bold">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span class="text-xs uppercase tracking-wider">Delete</span>
          </button>

        </div>
      </td>
    `;
    tbody.appendChild(tr);
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
    document.getElementById("farmType").value = item.farm.toLowerCase();
  }

  document.getElementById("editRowIndex").value = item.originalIndex;
  document.getElementById("formTitle").textContent = "Edit Entry";
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Update Entry";
  
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  saveBtn.classList.remove("w-full");
  saveBtn.classList.add("w-2/3");
}

function deleteEntry(unsortedIndex, btn) {
  const item = globalData[unsortedIndex];
  if(!item) return;
  
  if(!confirm(`⚠️ Delete this entry?\n\nCategory: ${item.category}\nAmount: ₹${item.amount.toLocaleString('en-IN')}\n\nThis action cannot be undone.`)) return;
  
  const originalText = btn.innerHTML;
  btn.innerHTML = '<div class="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>';
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
        const row = btn.closest('tr');
        if(row) {
          row.style.transition = "all 0.3s";
          row.style.opacity = "0";
          row.style.transform = "scale(0.95)";
          setTimeout(() => row.remove(), 300);
        }
        setTimeout(() => loadRemoteData(), 500);
        showToast('Entry deleted successfully', 'success');
      } else {
        alert("Error: " + (d.error || "Unknown error"));
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    })
    .catch(err => {
      alert("Network Error: " + err);
      btn.innerHTML = originalText;
      btn.disabled = false;
      showToast('Delete failed. Please try again.', 'error');
    });
}

// ==================================
// SAVE ENTRY
// ==================================
function saveEntry() {
  const saveBtn = document.getElementById("saveBtn");
  const type = document.getElementById("entryType").value;
  const amt = parseFloat(document.getElementById("amount").value) || 0;
  const editIndex = document.getElementById("editRowIndex").value;
  const category = document.getElementById("category").value.trim();

  if (amt <= 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }
  
  if (!category) {
    showToast('Please enter a category', 'error');
    return;
  }
  
  const isEditing = (editIndex !== "" && editIndex !== null);

  saveBtn.innerHTML = `
    <div class="flex items-center justify-center gap-2">
      <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>${isEditing ? 'Updating...' : 'Saving...'}</span>
    </div>
  `;
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
        showToast(isEditing ? 'Entry updated successfully' : 'Entry added successfully', 'success');
      } else {
        alert("Error: " + d.error);
        showToast('Operation failed. Please try again.', 'error');
      }
    })
    .catch(err => {
      alert("Request Failed: " + err);
      showToast('Connection error. Please check your internet.', 'error');
    })
    .finally(() => { 
      saveBtn.innerHTML = document.getElementById("formTitle").textContent === "New Entry" ? "Save Entry" : "Update Entry";
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
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Save Entry";
  
  document.getElementById("cancelEditBtn").classList.add("hidden");
  saveBtn.classList.remove("w-2/3");
  saveBtn.classList.add("w-full");
}

// ==================================
// TOAST NOTIFICATIONS
// ==================================
function showToast(message, type = 'info') {
  const colors = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-amber-600'
  };
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  
  const toast = document.createElement('div');
  toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 ${colors[type]} text-white px-6 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 font-semibold animate-slide-up`;
  toast.innerHTML = `
    <span class="text-xl">${icons[type]}</span>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'all 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}