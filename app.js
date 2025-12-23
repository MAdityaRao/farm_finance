const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const BASE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
// IMPORTANT: Update this URL if you redeploy your Google Script
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdUIq-qzjnC82b-pdPGCJ3tbOpt-M8-gkDnrRSv7RKMMD5wg9qzQ4YK6vl06LK5L0/exec"; 

let globalData = [];

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
  const tbody = document.getElementById("recordsTableBody");
  if(!tbody) return;
  tbody.innerHTML = "";

  let totalInc = 0, totalExp = 0, household = 0;
  let areca = { inc: 0, exp: 0 }, paddy = { inc: 0, exp: 0 };

  const sortedData = [...data].sort((a,b) => new Date(b.date) - new Date(a.date));

  sortedData.forEach((r, displayIndex) => {
    // WHITE THEME COLORS
    let amtColor = r.type === 'income' ? 'text-emerald-600' : (r.type === 'expense' ? 'text-red-500' : 'text-amber-500');
    let sign = r.type === 'income' ? '+' : '-';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100 group";
    
    const actualIndex = data.findIndex(item => item.originalIndex === r.originalIndex);
    
    // Only show note row if there is a note, otherwise empty string
    // We use a specific class 'mobile-note-text' to target it in CSS
    const noteContent = r.notes ? `<span class="mobile-note-text">${r.notes}</span>` : '<span class="text-slate-300 text-xs">-</span>';

    tr.innerHTML = `
        <td data-label="Date" class="p-4 text-slate-500 font-mono text-xs whitespace-nowrap font-medium">${r.date}</td>
        
        <td data-label="Category" class="p-4 text-slate-800 text-sm font-bold">
            ${r.category}
        </td>

        <td data-label="Notes" class="p-4 sm:max-w-[200px] sm:truncate">
            ${noteContent}
        </td>

        <td data-label="Amount" class="p-4 text-right font-mono ${amtColor} font-bold text-base">${sign}₹${r.amount.toLocaleString('en-IN')}</td>
        
        <td data-label="Action" class="p-4">
            <div class="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onclick="editEntry(${actualIndex})" class="text-amber-600 hover:text-amber-700 text-[10px] font-bold uppercase flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors">
                    <span>✏️</span> Edit
                </button>
                <button onclick="deleteEntry(${actualIndex}, this)" class="text-red-600 hover:text-red-700 text-[10px] font-bold uppercase flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-colors">
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