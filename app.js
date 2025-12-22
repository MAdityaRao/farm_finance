const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const SHEET_READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzwLaBK9WBYeewLy2N-ov03AYryjNAz8RNbhj2GgK-TIraN-Tnfy8teEO5-xzLbmSQ/exec"; 

let globalData = [];
let chartInstances = {}; // Stores chart objects to destroy/update them later

document.addEventListener('DOMContentLoaded', () => {
  if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
  
  // Initialize UI
  loadRemoteData();
  toggleInputs();
  showTab('dashboard'); 
});

// ---------------------------
// NAVIGATION & UI
// ---------------------------
function showTab(id) {
  // Hide all contents
  document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
  
  // Show target
  const target = document.getElementById(id);
  if(target) {
    target.classList.remove("hidden");
    target.classList.add("animate-fade-in");
  }

  // Update Bottom Nav Colors
  document.querySelectorAll(".nav-btn-mobile").forEach(b => {
    if(b.getAttribute('onclick').includes(id)) {
        b.classList.add("active", "text-emerald-500");
        b.classList.remove("inactive", "text-slate-400");
    } else {
        b.classList.add("inactive", "text-slate-400");
        b.classList.remove("active", "text-emerald-500");
    }
  });

  window.scrollTo(0, 0);
  
  // TRIGGER ANALYTICS RENDERING HERE
  if (id === 'analytics') {
      setTimeout(() => renderChartsAndAnalytics(), 100); // Small delay to ensure canvas is visible
  }
}

function toggleInputs() {
  const type = document.getElementById("entryType").value;
  const incInputs = document.getElementById("incomeInputs");
  const farmGroup = document.getElementById("farmGroup");
  
  if (type === "income") {
    incInputs.classList.remove("hidden");
    farmGroup.classList.remove("hidden");
  } else if (type === "expense") {
    incInputs.classList.add("hidden");
    farmGroup.classList.remove("hidden");
  } else {
    incInputs.classList.add("hidden");
    farmGroup.classList.add("hidden");
  }
}

// ---------------------------
// DATA FETCHING & PROCESSING
// ---------------------------
async function loadRemoteData() {
  const tbody = document.getElementById("recordsTableBody");
  if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 animate-pulse">Syncing with Cloud...</td></tr>';

  try {
    const response = await fetch(SHEET_READ_URL);
    const textData = await response.text();
    const json = JSON.parse(textData.substring(47).slice(0, -2));

    const remoteData = json.table.rows.map((row, index) => {
        const getCell = (i) => (row.c[i] ? (row.c[i].v !== null ? row.c[i].v : '') : '');
        
        let dateVal = getCell(0);
        if(typeof dateVal === 'string' && dateVal.includes('Date')) {
             const parts = /\d+,\d+,\d+/.exec(dateVal)[0].split(',');
             const d = new Date(parts[0], parts[1], parts[2]);
             const offset = d.getTimezoneOffset();
             d.setMinutes(d.getMinutes() - offset); 
             dateVal = d.toISOString().split('T')[0];
        }

        return {
            row_index: index, 
            date: dateVal, 
            type: getCell(1), 
            farm: getCell(2),
            category: getCell(3), 
            notes: getCell(4), 
            amount: parseFloat(getCell(5)) || 0,
            quantity: parseFloat(getCell(6)) || 0
        };
    });

    remoteData.sort((a,b) => new Date(b.date) - new Date(a.date));
    processData(remoteData);
  } catch (e) {
    console.error(e);
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-500 font-bold">Offline / Error</td></tr>';
  }
}

function processData(data) {
  globalData = data;
  const tbody = document.getElementById("recordsTableBody");
  if(!tbody) return;
  tbody.innerHTML = "";

  let totalInc = 0, totalExp = 0, household = 0;
  let areca = { inc: 0, exp: 0 }, paddy = { inc: 0, exp: 0 };

  data.forEach((r, displayIndex) => {
    // Determine Color for Amount text since Type column is gone
    let amtColor = r.type === 'income' ? 'text-emerald-400' : (r.type === 'expense' ? 'text-red-400' : 'text-amber-400');
    let sign = r.type === 'income' ? '+' : '-';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 group";
    
    // Removed 'Type' and 'Source' columns
    tr.innerHTML = `
        <td data-label="Date" class="p-3 text-slate-300 font-mono text-xs whitespace-nowrap">${r.date}</td>
        <td data-label="Category" class="p-3 text-slate-400 text-sm">${r.category}</td>
        <td data-label="Amount" class="p-3 text-right font-mono ${amtColor} font-bold text-base">${sign}₹${r.amount.toLocaleString('en-IN')}</td>
        <td data-label="Action" class="p-3">
            <div class="flex items-center justify-end gap-2 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                <button onclick="editEntry(${displayIndex})" class="text-amber-400 hover:text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1 bg-slate-800 px-2 py-1.5 rounded border border-slate-700 hover:border-amber-500/50 transition-colors">
                    <span>✏️</span> Edit
                </button>
                <button onclick="deleteEntry(${displayIndex}, this)" class="text-red-400 hover:text-red-300 text-[10px] font-bold uppercase flex items-center gap-1 bg-slate-800 px-2 py-1.5 rounded border border-slate-700 hover:border-red-500/50 transition-colors">
                    <span>🗑️</span> Del
                </button>
            </div>
        </td>
    `;
    tbody.appendChild(tr);

    if (r.type === 'income') {
        totalInc += r.amount;
        if (r.farm === 'arecanut') areca.inc += r.amount;
        if (r.farm === 'paddy') paddy.inc += r.amount;
    } else if (r.type === 'expense') {
        totalExp += r.amount;
        if (r.farm === 'arecanut') areca.exp += r.amount;
        if (r.farm === 'paddy') paddy.exp += r.amount;
    } else { household += r.amount; }
  });

  const netVal = totalInc - totalExp - household;
  updateElement("totalIncome", "₹" + totalInc.toLocaleString('en-IN'));
  updateElement("totalExpense", "₹" + totalExp.toLocaleString('en-IN'));
  updateElement("householdTotal", "₹" + household.toLocaleString('en-IN'));
  updateElement("net", "₹" + netVal.toLocaleString('en-IN'));
  
  const headerNet = document.getElementById("headerNet");
  if(headerNet) {
      headerNet.textContent = "₹" + netVal.toLocaleString('en-IN');
      headerNet.className = netVal >= 0 ? "text-emerald-400" : "text-red-400";
  }
  
  updateElement("arecanutNet", "₹" + (areca.inc - areca.exp).toLocaleString('en-IN'));
  updateElement("paddyNet", "₹" + (paddy.inc - paddy.exp).toLocaleString('en-IN'));
  
  if(document.getElementById("arecaBar")) {
    let p = areca.inc > 0 ? ((areca.inc - areca.exp) / areca.inc) * 100 : 0;
    document.getElementById("arecaBar").style.width = Math.max(0, p) + "%";
  }
}

function updateElement(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

// ---------------------------
// ANALYTICS & CHARTS
// ---------------------------
function renderChartsAndAnalytics() {
  if (!globalData || globalData.length === 0) return;

  const ctx1 = document.getElementById('trendChart');
  const ctx2 = document.getElementById('categoryChart');
  
  if(!ctx1 || !ctx2) return;

  // Destroy old charts to prevent "ghosting" effects
  if (chartInstances.trend) chartInstances.trend.destroy();
  if (chartInstances.category) chartInstances.category.destroy();

  // ==========================================================
  // CHART 1: Bar Graph - Monthly Income vs Expense (Financial Health)
  // ==========================================================
  
  // 1. Group data by Month (YYYY-MM)
  const monthlyStats = {};
  
  // Process data from Oldest to Newest for the graph
  const chronologicalData = [...globalData].reverse(); 

  chronologicalData.forEach(r => {
    // Extract "Jan", "Feb" etc. from date
    const dateObj = new Date(r.date);
    const monthKey = dateObj.toLocaleString('default', { month: 'short', year: '2-digit' }); // e.g., "Dec 24"

    if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { inc: 0, exp: 0 };

    if (r.type === 'income') {
        monthlyStats[monthKey].inc += r.amount;
    } else {
        // Combine Farm Expense + Household for total outflow
        monthlyStats[monthKey].exp += r.amount;
    }
  });

  // 2. Get last 6 months only (for mobile readability)
  const labels = Object.keys(monthlyStats).slice(-6);
  const incomeData = labels.map(m => monthlyStats[m].inc);
  const expenseData = labels.map(m => monthlyStats[m].exp);

  chartInstances.trend = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: '#10b981', // Emerald 500
          borderRadius: 4,
          barPercentage: 0.6
        },
        {
          label: 'Expense',
          data: expenseData,
          backgroundColor: '#ef4444', // Red 500
          borderRadius: 4,
          barPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: {size: 10} } },
        tooltip: {
            callbacks: {
                label: function(context) {
                    return ' ' + context.dataset.label + ': ₹' + context.raw.toLocaleString();
                }
            }
        }
      },
      scales: {
        x: { 
            ticks: { color: '#94a3b8', font: {size: 10} }, 
            grid: { display: false } 
        },
        y: { 
            ticks: { display: false }, // Hide Y-axis numbers to save space on mobile
            grid: { color: '#334155', drawBorder: false } 
        }
      }
    }
  });

  // ==========================================================
  // CHART 2: Doughnut - Expense Breakdown (Where money goes)
  // ==========================================================

  // 1. Aggregate expenses by Category
  const catMap = {};
  let totalExpForChart = 0;

  globalData.forEach(r => {
    if (r.type === 'expense' || r.type === 'household') {
        catMap[r.category] = (catMap[r.category] || 0) + r.amount;
        totalExpForChart += r.amount;
    }
  });

  // 2. Sort categories by highest spend
  let sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // 3. Logic: Take top 4 categories, group the rest as "Others"
  let finalLabels = [];
  let finalData = [];
  let otherSum = 0;

  sortedCats.forEach((item, index) => {
    if (index < 4) {
        finalLabels.push(item[0]);
        finalData.push(item[1]);
    } else {
        otherSum += item[1];
    }
  });

  if (otherSum > 0) {
      finalLabels.push('Others');
      finalData.push(otherSum);
  }

  chartInstances.category = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: finalLabels,
      datasets: [{
        data: finalData,
        backgroundColor: [
            '#3b82f6', // Blue
            '#f59e0b', // Amber
            '#ec4899', // Pink
            '#8b5cf6', // Violet
            '#64748b'  // Slate (Others)
        ],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%', // Makes it a thinner ring
      plugins: {
        legend: { 
            position: 'right', 
            labels: { color: '#cbd5e1', boxWidth: 12, font: {size: 11} } 
        },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let val = context.raw;
                    let pct = ((val / totalExpForChart) * 100).toFixed(1) + '%';
                    return ` ${context.label}: ₹${val.toLocaleString()} (${pct})`;
                }
            }
        }
      }
    }
  });
}

// ---------------------------
// EDIT & SAVE LOGIC
// ---------------------------
function editEntry(displayIndex) {
  const item = globalData[displayIndex];
  if(!item) return;

  showTab('add');

  document.getElementById("entryType").value = item.type;
  toggleInputs();

  document.getElementById("date").value = item.date;
  document.getElementById("category").value = item.category;
  document.getElementById("amount").value = item.amount;
  document.getElementById("quantity").value = item.quantity || "";
  
  if (item.type !== "household") {
    document.getElementById("farmType").value = item.farm.toLowerCase();
  }

  document.getElementById("editRowIndex").value = item.row_index;
  document.getElementById("formTitle").textContent = "Edit Entry";
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Update Entry";
  saveBtn.className = "w-full bg-amber-600 hover:bg-amber-500 py-4 rounded-xl font-bold text-lg text-white shadow-lg";
  
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  document.getElementById("cancelEditBtn").classList.add("w-1/3");
  saveBtn.classList.remove("w-full");
  saveBtn.classList.add("w-2/3");
}

function deleteEntry(displayIndex, btn) {
  const item = globalData[displayIndex];
  if(!item) return;

  if(!confirm(`Are you sure you want to delete this entry?\n\nDate: ${item.date}\nCategory: ${item.category}\nAmount: ₹${item.amount}`)) return;

  // UI Feedback
  const originalText = btn.innerHTML;
  btn.textContent = "Wait..";
  btn.disabled = true;

  const formData = new FormData();
  formData.append("action", "delete");
  formData.append("rowIndex", item.row_index);

  fetch(SCRIPT_URL, { method: "POST", body: formData })
    .then(r => r.json())
    .then(d => { 
        if(d.result === "success") { 
            loadRemoteData(); 
        } else {
            alert("Error: " + (d.error || "Unknown error"));
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    })
    .catch(err => {
        alert("Network error occurred.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

function resetForm() {
  document.getElementById("editRowIndex").value = "";
  document.getElementById("formTitle").textContent = "New Entry";
  document.getElementById("date").valueAsDate = new Date();
  document.getElementById("amount").value = "";
  document.getElementById("quantity").value = "";
  document.getElementById("category").value = "";
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Save Entry";
  saveBtn.className = "w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-xl font-bold text-lg text-white shadow-lg";
  
  document.getElementById("cancelEditBtn").classList.add("hidden");
  saveBtn.classList.remove("w-2/3");
  saveBtn.classList.add("w-full");
}

function saveEntry() {
  const saveBtn = document.getElementById("saveBtn");
  const type = document.getElementById("entryType").value;
  const amt = parseFloat(document.getElementById("amount").value) || 0;
  const editIndex = document.getElementById("editRowIndex").value;

  if (amt <= 0) return alert("Please enter a valid amount");

  saveBtn.textContent = editIndex ? "Updating..." : "Saving...";
  saveBtn.disabled = true;

  const formData = new FormData();
  formData.append("date", document.getElementById("date").value);
  formData.append("type", type);
  formData.append("farm", type === "household" ? "household" : document.getElementById("farmType").value);
  formData.append("category", document.getElementById("category").value);
  formData.append("amount", amt);
  formData.append("quantity", document.getElementById("quantity").value || 0);

  if (editIndex !== "") {
    formData.append("action", "edit"); 
    formData.append("rowIndex", editIndex);
  } else {
    formData.append("action", "add");
  }

  fetch(SCRIPT_URL, { method: "POST", body: formData })
    .then(r => r.json())
    .then(d => { 
        if(d.result === "success") { 
            resetForm();
            loadRemoteData(); 
            showTab('dashboard'); 
        } else {
            alert("Error: " + d.error);
        }
    })
    .catch(err => {
        // Fallback if script doesn't return JSON
        resetForm();
        loadRemoteData();
        showTab('dashboard');
    })
    .finally(() => { 
        if(!editIndex) saveBtn.textContent = "Save Entry"; 
        saveBtn.disabled = false; 
    });
}
let currentView = 'arecanut'; // Default view

function updateAnalyticsView(view) {
    currentView = view;
    
    // Update Button UI
    const views = ['arecanut', 'paddy', 'household'];
    views.forEach(v => {
        const btn = document.getElementById(`btn-${v}`);
        if(v === view) {
            btn.classList.add('bg-emerald-600', 'text-white');
            btn.classList.remove('text-slate-400');
        } else {
            btn.classList.remove('bg-emerald-600', 'text-white');
            btn.classList.add('text-slate-400');
        }
    });

    renderChartsAndAnalytics();
}

function renderChartsAndAnalytics() {
    if (!globalData || globalData.length === 0) return;

    const ctx1 = document.getElementById('trendChart');
    const ctx2 = document.getElementById('categoryChart');
    if(!ctx1 || !ctx2) return;

    if (chartInstances.trend) chartInstances.trend.destroy();
    if (chartInstances.category) chartInstances.category.destroy();

    // 1. FILTER DATA BASED ON VIEW
    const filteredData = globalData.filter(item => {
        if (currentView === 'household') return item.type === 'household';
        return item.farm === currentView;
    });

    // Update Titles
    document.getElementById('barChartTitle').textContent = `${currentView} Cash Flow`;

    // 2. LOGIC FOR BAR CHART (Monthly)
    const monthlyStats = {};
    [...filteredData].reverse().forEach(r => {
        const monthKey = new Date(r.date).toLocaleString('default', { month: 'short', year: '2-digit' });
        if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { inc: 0, exp: 0 };
        
        if (r.type === 'income') monthlyStats[monthKey].inc += r.amount;
        else monthlyStats[monthKey].exp += r.amount;
    });

    const labels = Object.keys(monthlyStats).slice(-6);
    
    chartInstances.trend = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Income', data: labels.map(m => monthlyStats[m].inc), backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'Expense', data: labels.map(m => monthlyStats[m].exp), backgroundColor: '#ef4444', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#94a3b8', font: {size: 10} }, grid: { display: false } },
                y: { ticks: { display: false }, grid: { color: '#334155' } }
            },
            plugins: { legend: { labels: { color: '#cbd5e1', font: {size: 10} } } }
        }
    });

    // 3. LOGIC FOR PIE CHART (Expense Breakdown)
    const catMap = {};
    filteredData.forEach(r => {
        if (r.type === 'expense' || r.type === 'household') {
            catMap[r.category] = (catMap[r.category] || 0) + r.amount;
        }
    });

    const pieLabels = Object.keys(catMap);
    const pieData = Object.values(catMap);

    chartInstances.category = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: pieLabels,
            datasets: [{
                data: pieData,
                backgroundColor: ['#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'right', labels: { color: '#cbd5e1', font: {size: 11} } }
            }
        }
    });
}