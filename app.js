const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const BASE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
// IMPORTANT: Update this URL if you redeploy your Google Script
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdUIq-qzjnC82b-pdPGCJ3tbOpt-M8-gkDnrRSv7RKMMD5wg9qzQ4YK6vl06LK5L0/exec"; 

let globalData = [];
// New variable to track current log view
let currentLogView = 'arecanut';

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

  // Trigger charts if entering analytics
  if(id === 'analytics' && typeof renderChartsAndAnalytics === 'function') {
      setTimeout(() => renderChartsAndAnalytics(), 100);
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
      tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 animate-pulse">Syncing...</td></tr>';
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
  } catch (e) {
    console.error(e);
    if(tbody && tbody.children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500 font-bold">Offline / Error</td></tr>';
    }
  }
}

function processData(data) {
  globalData = data;
  
  let totalInc = 0, totalExp = 0, household = 0;
  let areca = { inc: 0, exp: 0 }, paddy = { inc: 0, exp: 0 };

  // Calculate Totals only
  data.forEach(r => {
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

  // Update Top Cards and Dashboard
  const netVal = totalInc - totalExp - household;
  updateElement("totalIncome", "₹" + totalInc.toLocaleString('en-IN'));
  updateElement("totalExpense", "₹" + totalExp.toLocaleString('en-IN'));
  updateElement("householdTotal", "₹" + household.toLocaleString('en-IN'));
  updateElement("net", "₹" + netVal.toLocaleString('en-IN'));
  
  const headerNet = document.getElementById("headerNet");
  if(headerNet) {
      headerNet.textContent = "₹" + netVal.toLocaleString('en-IN');
      headerNet.className = netVal >= 0 ? "text-emerald-600" : "text-red-500";
  }
  
  updateElement("arecanutNet", "₹" + (areca.inc - areca.exp).toLocaleString('en-IN'));
  updateElement("paddyNet", "₹" + (paddy.inc - paddy.exp).toLocaleString('en-IN'));
  
  if(document.getElementById("arecaBar")) {
    let pAreca = areca.inc > 0 ? ((areca.inc - areca.exp) / areca.inc) * 100 : 0;
    document.getElementById("arecaBar").style.width = Math.max(0, pAreca) + "%";
    
    let pPaddy = paddy.inc > 0 ? ((paddy.inc - paddy.exp) / paddy.inc) * 100 : 0;
    if(document.getElementById("paddyBar")) document.getElementById("paddyBar").style.width = Math.max(0, pPaddy) + "%";
  }

  const analyticsSection = document.getElementById('analytics');
  if(analyticsSection && !analyticsSection.classList.contains('hidden') && typeof renderChartsAndAnalytics === 'function') {
      renderChartsAndAnalytics();
  }

  // Render the logs table based on current filter
  renderLogsTable();
}

// ---------------------------
// LOGS VIEW LOGIC (NEW)
// ---------------------------
function updateLogsView(view) {
    currentLogView = view;
    
    // Update Button Styling
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

//
function renderLogsTable() {
    const tbody = document.getElementById("recordsTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";

    // 1. Filter Data
    const filteredData = globalData.filter(item => {
        if(currentLogView === 'household') return item.type === 'household';
        return item.farm === currentLogView;
    });

    // 2. Sort by Date (Newest first)
    const sortedData = filteredData.sort((a,b) => new Date(b.date) - new Date(a.date));

    // 3. Empty State
    if(sortedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="block w-full p-8 text-center text-slate-400 italic">No records found for ${currentLogView}</td></tr>`;
        return;
    }

    // 4. Render Rows
    sortedData.forEach((r) => {
        const actualIndex = globalData.findIndex(item => item.originalIndex === r.originalIndex);
        
        // Colors & Formatting
        let amtColor = r.type === 'income' ? 'text-emerald-600' : (r.type === 'expense' ? 'text-red-500' : 'text-amber-500');
        let sign = r.type === 'income' ? '+' : '-';
        
        const dateObj = new Date(r.date);
        const day = isNaN(dateObj) ? '00' : dateObj.getDate();
        const month = isNaN(dateObj) ? '---' : dateObj.toLocaleString('default', { month: 'short' });

        const tr = document.createElement('tr');
        
        // CARD CONTAINER STYLING
        tr.className = "block bg-white mb-4 rounded-2xl border border-slate-200 shadow-sm overflow-hidden";
        
        // CLICK HANDLER (Toggle Notes Only)
        tr.onclick = function(e) {
            // Stop if clicking buttons
            if(e.target.closest('button')) return;

            const notesDiv = this.querySelector('.notes-section');
            const chevron = this.querySelector('.chevron-icon');
            
            if (notesDiv.classList.contains('hidden')) {
                notesDiv.classList.remove('hidden');
                notesDiv.classList.add('animate-fade-in');
                chevron.style.transform = 'rotate(180deg)';
                this.classList.add('ring-1', 'ring-emerald-500'); // Highlight active card
            } else {
                notesDiv.classList.add('hidden');
                chevron.style.transform = 'rotate(0deg)';
                this.classList.remove('ring-1', 'ring-emerald-500');
            }
        };

        tr.innerHTML = `
            <td class="block w-full p-0 border-none">
                
                <div class="p-4 relative active:bg-slate-50 transition-colors cursor-pointer">
                    <div class="flex items-center justify-between gap-3">
                        
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="flex flex-col items-center justify-center w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl shrink-0">
                                <span class="text-[10px] font-bold text-slate-400 uppercase leading-none">${month}</span>
                                <span class="text-xl font-bold text-slate-800 leading-none mt-0.5">${day}</span>
                            </div>
                            
                            <div class="min-w-0">
                                <h4 class="text-slate-900 font-bold text-base truncate leading-tight">${r.category}</h4>
                                <div class="flex items-center gap-1.5 mt-1">
                                    <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                                        ${r.notes ? "View Notes" : "No Details"}
                                    </span>
                                    <svg class="chevron-icon w-3 h-3 text-slate-300 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div class="${amtColor} font-mono font-bold text-lg whitespace-nowrap shrink-0">
                            ${sign}₹${r.amount.toLocaleString('en-IN')}
                        </div>
                    </div>

                    <div class="notes-section hidden mt-4 pt-3 border-t border-dashed border-slate-200">
                        <div class="bg-slate-50 p-3 rounded-lg">
                            <p class="text-sm text-slate-600 italic leading-relaxed">
                                "${r.notes || 'No notes provided.'}"
                            </p>
                            ${r.quantity ? `<div class="mt-2 text-xs font-bold text-slate-500">QTY: ${r.quantity} Kg</div>` : ''}
                        </div>
                    </div>
                </div>

                <div class="flex w-full border-t border-slate-100 bg-slate-50/50">
                    
                    <button onclick="editEntry(${actualIndex})" 
                        class="w-1/2 py-3.5 flex items-center justify-center gap-2 text-slate-600 hover:text-emerald-600 hover:bg-white transition-all active:scale-95 border-r border-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span class="text-xs font-bold uppercase tracking-wider">Edit</span>
                    </button>

                    <button onclick="deleteEntry(${actualIndex}, this)" 
                        class="w-1/2 py-3.5 flex items-center justify-center gap-2 text-slate-600 hover:text-red-500 hover:bg-white transition-all active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span class="text-xs font-bold uppercase tracking-wider">Delete</span>
                    </button>

                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateElement(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

// ---------------------------
// EDIT & SAVE LOGIC
// ---------------------------
function editEntry(unsortedIndex) {
  const item = globalData[unsortedIndex];
  if(!item) return;

  showTab('add');

  document.getElementById("entryType").value = item.type;
  toggleInputs();

  document.getElementById("date").value = item.date;
  document.getElementById("category").value = item.category;
  
  // Load notes
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
  
  // Reset styling for update button
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  saveBtn.classList.remove("w-full");
  saveBtn.classList.add("w-2/3");
}

function deleteEntry(unsortedIndex, btn) {
  const item = globalData[unsortedIndex];
  if(!item) return;
  
  if(!confirm(`Delete this entry?\n\nCategory: ${item.category}\nAmount: ₹${item.amount}`)) return;
  
  const originalText = btn.innerHTML;
  btn.textContent = "Deleting...";
  btn.disabled = true;
  
  const params = new URLSearchParams();
  params.append("action", "delete");
  params.append("rowIndex", item.originalIndex);
  
  // Extra data for Smart Delete Verification
  params.append("category", item.category);
  params.append("amount", item.amount);
  params.append("type", item.type);
  
  fetch(SCRIPT_URL, { method: "POST", body: params })
    .then(r => r.json())
    .then(d => { 
      if(d.result === "success") { 
        // Fade out row
        const row = btn.closest('tr');
        if(row) {
          row.style.transition = "all 0.3s";
          row.style.opacity = "0";
          setTimeout(() => row.remove(), 300);
        }
        setTimeout(() => loadRemoteData(), 500);
      } else {
        alert("Server Error: " + (d.error || "Unknown error"));
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    })
    .catch(err => {
      alert("Network Error: " + err);
      btn.innerHTML = originalText;
      btn.disabled = false;
    });
}

function saveEntry() {
  const saveBtn = document.getElementById("saveBtn");
  const type = document.getElementById("entryType").value;
  const amt = parseFloat(document.getElementById("amount").value) || 0;
  const editIndex = document.getElementById("editRowIndex").value;

  if (amt <= 0) return alert("Please enter a valid amount");
  
  const isEditing = (editIndex !== "" && editIndex !== null);

  saveBtn.textContent = isEditing ? "Updating..." : "Saving...";
  saveBtn.disabled = true;

  const params = new URLSearchParams();
  params.append("date", document.getElementById("date").value);
  params.append("type", type);
  params.append("farm", type === "household" ? "household" : document.getElementById("farmType").value);
  params.append("category", document.getElementById("category").value);
  
  // Send notes
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
        } else {
            alert("Error: " + d.error);
        }
    })
    .catch(err => {
        alert("Request Failed: " + err);
    })
    .finally(() => { 
        if(document.getElementById("formTitle").textContent === "New Entry") saveBtn.textContent = "Save Entry"; 
        saveBtn.disabled = false; 
    });
}

function resetForm() {
  document.getElementById("editRowIndex").value = "";
  document.getElementById("formTitle").textContent = "New Entry";
  document.getElementById("date").valueAsDate = new Date();
  document.getElementById("amount").value = "";
  document.getElementById("quantity").value = "";
  document.getElementById("category").value = "";
  
  // Clear notes
  document.getElementById("notes").value = "";
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Save Entry";
  
  document.getElementById("cancelEditBtn").classList.add("hidden");
  saveBtn.classList.remove("w-2/3");
  saveBtn.classList.add("w-full");
}