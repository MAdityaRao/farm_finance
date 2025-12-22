/* ================= CONFIGURATION ================= */
const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const SHEET_READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

// IMPORTANT: Replace this with your deployed Google Apps Script URL
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzwLaBK9WBYeewLy2N-ov03AYryjNAz8RNbhj2GgK-TIraN-Tnfy8teEO5-xzLbmSQ/exec"; 

/* ================= STATE MANAGEMENT ================= */
let globalData = [];
let chartInstances = {};

/* ================= INITIALIZATION ================= */
document.addEventListener('DOMContentLoaded', () => {
  // Set default date
  if(document.getElementById("date")) {
    document.getElementById("date").valueAsDate = new Date();
  }
  
  // Initial Load
  loadRemoteData();
  
  // Setup Inputs
  toggleInputs();
});

/* ================= UI NAVIGATION ================= */
function showTab(id) {
  document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("block", "animate-fade-in"));
  
  const target = document.getElementById(id);
  if(target) {
      target.classList.remove("hidden");
      target.classList.add("block", "animate-fade-in");
  }

  // Update Nav Buttons
  document.querySelectorAll("nav button").forEach(b => {
    b.classList.remove("bg-emerald-600", "text-white", "shadow");
    b.classList.add("text-slate-400", "hover:bg-slate-700");
  });
  
  const activeBtn = Array.from(document.querySelectorAll("nav button")).find(b => b.getAttribute('onclick').includes(id));
  if(activeBtn) {
    activeBtn.classList.remove("text-slate-400", "hover:bg-slate-700");
    activeBtn.classList.add("bg-emerald-600", "text-white", "shadow");
  }

  if (id === 'analytics') renderChartsAndAnalytics();
}

function toggleInputs() {
  const typeEl = document.getElementById("entryType");
  if(!typeEl) return;

  const type = typeEl.value;
  const incInputs = document.getElementById("incomeInputs");
  const farmGroup = document.getElementById("farmGroup");
  
  if (type === "income") {
    incInputs.classList.remove("hidden");
    farmGroup.classList.remove("hidden");
  } else if (type === "expense") {
    incInputs.classList.add("hidden");
    farmGroup.classList.remove("hidden");
  } else {
    // Household
    incInputs.classList.add("hidden");
    farmGroup.classList.add("hidden");
  }
}

/* ================= CLOUD SYNC OPERATIONS ================= */

// 1. READ: Fetch Data from Google Sheet
async function loadRemoteData() {
  const tbody = document.getElementById("recordsTable");
  if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">Loading data from cloud...</td></tr>';

  try {
    const response = await fetch(SHEET_READ_URL);
    const textData = await response.text();
    
    // Parse Google Visualization API response
    // Remove /*O_o*/ prefix and ); suffix
    const jsonText = textData.substring(47).slice(0, -2);
    const json = JSON.parse(jsonText);

    // Map Sheet Rows to App Object Structure
    const remoteData = json.table.rows.map((row, index) => {
        const getCell = (i) => (row.c[i] ? (row.c[i].v !== null ? row.c[i].v : '') : '');
        
        // Handle Date formatting
        let dateVal = getCell(0);
        if(typeof dateVal === 'string' && dateVal.includes('Date')) {
             const matches = /\d+,\d+,\d+/.exec(dateVal);
             if(matches) {
                 const parts = matches[0].split(',');
                 // JS Months are 0-indexed in Date objects, but Gviz usually sends actual month index
                 const d = new Date(parts[0], parts[1], parts[2]);
                 dateVal = d.toISOString().split('T')[0];
             }
        }

        return {
            id: `sheet-${index}`, 
            isRemote: true,
            date: dateVal,
            type: getCell(1),
            farm: getCell(2),
            category: getCell(3),
            notes: getCell(4),
            amount: parseFloat(getCell(5)) || 0,
            quantity: parseFloat(getCell(6)) || 0,
        };
    });

    // Sort by date descending
    remoteData.sort((a,b) => new Date(b.date) - new Date(a.date));

    console.log(`Loaded ${remoteData.length} rows.`);
    processData(remoteData);

  } catch (error) {
    console.error("Error fetching sheet data:", error);
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500">Error loading data. Check console.</td></tr>';
  }
}

// 2. WRITE: Send Data to Google Sheet (via Apps Script)
function saveEntry() {
  const saveBtn = document.getElementById("saveBtn");
  if(saveBtn.textContent === "Update Transaction") {
      alert("Editing existing cloud entries is not supported in this version. Please edit directly in Google Sheets.");
      return;
  }

  // Validation
  const type = document.getElementById("entryType").value;
  const farm = type === "household" ? "household" : document.getElementById("farmType").value;
  const qty = parseFloat(document.getElementById("quantity").value) || 0;
  const rateVal = parseFloat(document.getElementById("rate").value) || 0;
  let amt = parseFloat(document.getElementById("amount").value) || 0;
  const dateVal = document.getElementById("date").value;
  const catVal = document.getElementById("category").value;
  const notesVal = document.getElementById("notes").value;

  if (type === "income" && qty > 0 && rateVal > 0) amt = qty * rateVal;
  if (!dateVal || !catVal || amt <= 0) return alert("Please fill in Date, Category and valid Amount");

  // UI State - Saving
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "Saving to Cloud...";
  saveBtn.disabled = true;

  // Create FormData
  const formData = new FormData();
  formData.append("date", dateVal);
  formData.append("type", type);
  formData.append("farm", farm);
  formData.append("category", catVal);
  formData.append("notes", notesVal);
  formData.append("amount", amt);
  formData.append("quantity", qty);

  // Send to Apps Script
  fetch(SCRIPT_URL, {
    method: "POST",
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if(data.result === "success") {
      alert("Saved to Google Sheet!");
      loadRemoteData(); // Refresh list
      cancelEdit();     // Reset form
    } else {
      alert("Error saving: " + JSON.stringify(data));
    }
  })
  .catch(err => {
    console.error(err);
    alert("Network Error. Check console.");
  })
  .finally(() => {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
  });
}

// 3. EDIT/DELETE Handlers
function editEntry(id) {
    // Since we are now fully cloud-based, we block editing for simplicity
    // To support editing, we would need a complex row-ID lookup system in the Apps Script
    alert("To edit this entry, please open the Google Sheet directly.");
}

function del(id) {
    alert("To delete this entry, please open the Google Sheet directly.");
}

function cancelEdit() {
  document.getElementById("editId").value = "";
  document.getElementById("amount").value = "";
  document.getElementById("quantity").value = "";
  document.getElementById("rate").value = "";
  document.getElementById("notes").value = "";
  document.getElementById("category").value = "";
  if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Save Transaction";
  saveBtn.classList.add("w-full");
  saveBtn.classList.remove("w-2/3");
  
  const cancelBtn = document.getElementById("cancelEditBtn");
  if(cancelBtn) cancelBtn.classList.add("hidden");
}

/* ================= DATA PROCESSING & VISUALIZATION ================= */

function processData(data) {
  globalData = data;
  const tbody = document.getElementById("recordsTable");
  if(!tbody) return;
  
  tbody.innerHTML = "";

  let totalInc = 0, totalExp = 0, household = 0;
  let areca = { inc: 0, exp: 0 };
  let paddy = { inc: 0, exp: 0 };

  data.forEach(r => {
    // Badges
    let typeBadge = r.type === 'income' 
      ? '<span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-bold">IN</span>' 
      : (r.type === 'expense' 
         ? '<span class="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold">OUT</span>'
         : '<span class="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-bold">HOME</span>');

    const idParam = typeof r.id === 'string' ? `'${r.id}'` : r.id;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-700/50">
        <td class="p-4 whitespace-nowrap text-slate-300">${r.date}</td>
        <td class="p-4">${typeBadge}</td>
        <td class="p-4 capitalize text-slate-300">${r.farm}</td>
        <td class="p-4 text-slate-300">${r.category}</td>
        <td class="p-4 text-slate-400 text-sm italic max-w-[150px] truncate">
            ${r.notes || '-'}
        </td>
        <td class="p-4 text-right font-mono text-white">₹${r.amount.toLocaleString()}</td>
        <td class="p-4 text-center">
            <a href="https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit" target="_blank" class="text-slate-600 hover:text-emerald-400 text-xs">View Sheet</a>
        </td>
      </tr>`;

    // Calculations
    if (r.type === 'income') {
      totalInc += r.amount;
      if (r.farm === 'arecanut') areca.inc += r.amount;
      if (r.farm === 'paddy') paddy.inc += r.amount;
    } else if (r.type === 'expense') {
      totalExp += r.amount;
      if (r.farm === 'arecanut') areca.exp += r.amount;
      if (r.farm === 'paddy') paddy.exp += r.amount;
    } else if (r.type === 'household') {
      household += r.amount;
    }
  });

  // Update Dashboard Cards
  updateElement("totalIncome", "₹" + totalInc.toLocaleString());
  updateElement("totalExpense", "₹" + totalExp.toLocaleString());
  updateElement("householdTotal", "₹" + household.toLocaleString());
  updateElement("net", "₹" + (totalInc - totalExp - household).toLocaleString());

  const arecaNet = areca.inc - areca.exp;
  const paddyNet = paddy.inc - paddy.exp;

  updateElement("arecanutNet", "₹" + arecaNet.toLocaleString());
  updateElement("paddyNet", "₹" + paddyNet.toLocaleString());
  
  // Progress Bars
  const aMarg = areca.inc > 0 ? (arecaNet / areca.inc) * 100 : 0;
  const pMarg = paddy.inc > 0 ? (paddyNet / paddy.inc) * 100 : 0;
  
  const ab = document.getElementById("arecaBar");
  const pb = document.getElementById("paddyBar");
  if(ab) ab.style.width = Math.max(0, aMarg) + "%";
  if(pb) pb.style.width = Math.max(0, pMarg) + "%";
  
  // Refresh Charts if active
  const analyticsTab = document.getElementById("analytics");
  if(analyticsTab && !analyticsTab.classList.contains("hidden")) {
      renderChartsAndAnalytics();
  }
}

function updateElement(id, value) {
    const el = document.getElementById(id);
    if(el) el.textContent = value;
}

function renderChartsAndAnalytics() {
  if(!globalData.length) return;

  const yieldStats = { arecanut: { kg: 0, rev: 0 }, paddy: { kg: 0, rev: 0 } };
  const timeMap = {};
  const catMap = {};

  globalData.forEach(r => {
    // Yield
    if(r.type === 'income' && r.quantity > 0) {
      if(yieldStats[r.farm]) {
        yieldStats[r.farm].kg += r.quantity;
        yieldStats[r.farm].rev += r.amount;
      }
    }

    // Time Series
    const m = r.date ? r.date.substring(0, 7) : 'Unknown';
    if(!timeMap[m]) timeMap[m] = { inc: 0, exp: 0 };
    if(r.type === 'income') timeMap[m].inc += r.amount;
    else timeMap[m].exp += r.amount;

    // Categories
    if(r.type === 'expense' || r.type === 'household') {
      catMap[r.category] = (catMap[r.category] || 0) + r.amount;
    }
  });

  // Render Yield Table
  const yTable = document.getElementById("yieldTable");
  if(yTable) {
    yTable.innerHTML = "";
    Object.keys(yieldStats).forEach(f => {
        const s = yieldStats[f];
        const avg = s.kg > 0 ? (s.rev / s.kg).toFixed(2) : "0.00";
        yTable.innerHTML += `
        <tr>
            <td class="p-4 capitalize text-slate-300 font-medium">${f}</td>
            <td class="p-4 text-right text-slate-400">${s.kg}</td>
            <td class="p-4 text-right text-emerald-400">₹${s.rev.toLocaleString()}</td>
            <td class="p-4 text-right text-white font-mono">₹${avg}</td>
        </tr>
        `;
    });
  }

  const months = Object.keys(timeMap).sort();
  const incData = months.map(m => timeMap[m].inc);
  const expData = months.map(m => timeMap[m].exp);

  // Render Charts using Chart.js
  const c1 = document.getElementById("trendChart");
  if(c1) {
    const ctx1 = c1.getContext("2d");
    if(chartInstances.trend) chartInstances.trend.destroy();
    
    chartInstances.trend = new Chart(ctx1, {
        type: 'line',
        data: {
        labels: months,
        datasets: [
            { label: 'Income', data: incData, borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.3 },
            { label: 'Expense', data: expData, borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.3 }
        ]
        },
        options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
            y: { ticks: { color: '#64748b' }, grid: { color: '#334155' } },
            x: { ticks: { color: '#64748b' }, grid: { display: false } }
        }
        }
    });
  }

  const c2 = document.getElementById("categoryChart");
  if(c2) {
    const ctx2 = c2.getContext("2d");
    if(chartInstances.cat) chartInstances.cat.destroy();

    chartInstances.cat = new Chart(ctx2, {
        type: 'doughnut',
        data: {
        labels: Object.keys(catMap),
        datasets: [{
            data: Object.values(catMap),
            backgroundColor: ['#f59e0b', '#3b82f6', '#ec4899', '#6366f1', '#84cc16', '#a855f7'],
            borderWidth: 0
        }]
        },
        options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
        }
    });
  }
}