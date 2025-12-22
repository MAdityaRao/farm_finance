const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const BASE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzr_NtlcND89fVBb18VnN1tjw0nc5IQ8Zix6Oxi8UsucSkOQwpB48P5PGyWmXFp5Gvu/exec"; 

let globalData = [];
let chartInstances = {}; 

document.addEventListener('DOMContentLoaded', () => {
  if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
  loadRemoteData();
  toggleInputs();
  showTab('dashboard'); 
});

// ---------------------------
// NAVIGATION & UI
// ---------------------------
function showTab(id) {
  document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
  const target = document.getElementById(id);
  if(target) {
    target.classList.remove("hidden");
    target.classList.add("animate-fade-in");
  }

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
  
  if (id === 'analytics') {
      setTimeout(() => renderChartsAndAnalytics(), 300); 
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
  if(tbody && tbody.children.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 animate-pulse">Syncing with Cloud...</td></tr>';
  }

  try {
    const response = await fetch(`${BASE_SHEET_URL}&_=${new Date().getTime()}`);
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
            row_index: index, // Script adds +2, so we send the raw 0-based index
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
    if(tbody && tbody.children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-500 font-bold">Offline / Error</td></tr>';
    }
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
    let amtColor = r.type === 'income' ? 'text-emerald-400' : (r.type === 'expense' ? 'text-red-400' : 'text-amber-400');
    let sign = r.type === 'income' ? '+' : '-';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-800/50 transition-colors border-b border-slate-700/50 group";
    
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
    let pAreca = areca.inc > 0 ? ((areca.inc - areca.exp) / areca.inc) * 100 : 0;
    document.getElementById("arecaBar").style.width = Math.max(0, pAreca) + "%";
    
    let pPaddy = paddy.inc > 0 ? ((paddy.inc - paddy.exp) / paddy.inc) * 100 : 0;
    if(document.getElementById("paddyBar")) document.getElementById("paddyBar").style.width = Math.max(0, pPaddy) + "%";
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

  if (chartInstances.trend) chartInstances.trend.destroy();
  if (chartInstances.category) chartInstances.category.destroy();

  const filteredData = globalData.filter(item => {
      if (currentView === 'household') return item.type === 'household';
      return item.farm === currentView;
  });

  const chartTitle = document.getElementById('barChartTitle');
  if(chartTitle) chartTitle.textContent = `${currentView} Cash Flow`;

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
          plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', font: {size: 11} } } }
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

  if(!confirm(`Delete this entry?\n₹${item.amount} - ${item.category}`)) return;

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
            const deletedRowIndex = item.row_index;
            globalData.splice(displayIndex, 1);
            
            // Adjust indices for remaining items so subsequent deletes work
            globalData.forEach(row => {
                if (row.row_index > deletedRowIndex) {
                    row.row_index = row.row_index - 1;
                }
            });

            processData(globalData);
            renderChartsAndAnalytics();
        } else {
            alert("Error: " + (d.error || "Unknown error"));
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    })
    .catch(err => {
        alert("Network error.");
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
            setTimeout(loadRemoteData, 500); 
            showTab('dashboard'); 
        } else {
            alert("Error: " + d.error);
        }
    })
    .catch(err => {
        resetForm();
        setTimeout(loadRemoteData, 500);
        showTab('dashboard');
    })
    .finally(() => { 
        if(!editIndex) saveBtn.textContent = "Save Entry"; 
        saveBtn.disabled = false; 
    });
}

let currentView = 'arecanut'; 

function updateAnalyticsView(view) {
    currentView = view;
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