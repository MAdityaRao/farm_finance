const SHEET_ID = '1sNaYBjA3aLI1jL7EnKYXNtrm1JUWhpEi6LBTg-53WGU';
const SHEET_NAME = 'Sheet1'; 
const SHEET_READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzwLaBK9WBYeewLy2N-ov03AYryjNAz8RNbhj2GgK-TIraN-Tnfy8teEO5-xzLbmSQ/exec"; 

let globalData = [];
let chartInstances = {};

document.addEventListener('DOMContentLoaded', () => {
  if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
  loadRemoteData();
  toggleInputs();
});

function showTab(id) {
  document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
  const target = document.getElementById(id);
  if(target) target.classList.remove("hidden"), target.classList.add("animate-fade-in");

  // Update Bottom Nav Styling
  document.querySelectorAll("nav button").forEach(b => {
    b.classList.remove("text-emerald-500");
    b.classList.add("text-slate-400");
  });
  const activeBtn = Array.from(document.querySelectorAll("nav button")).find(b => b.getAttribute('onclick').includes(id));
  if(activeBtn) activeBtn.classList.replace("text-slate-400", "text-emerald-500");

  window.scrollTo(0, 0);
  if (id === 'analytics') renderChartsAndAnalytics();
}

function toggleInputs() {
  const type = document.getElementById("entryType").value;
  const incInputs = document.getElementById("incomeInputs");
  const farmGroup = document.getElementById("farmGroup");
  
  if (type === "income") {
    incInputs.classList.remove("hidden");
    farmGroup.classList.remove("hidden");
  } else {
    incInputs.classList.add("hidden");
    type === "expense" ? farmGroup.classList.remove("hidden") : farmGroup.classList.add("hidden");
  }
}

async function loadRemoteData() {
  const tbody = document.getElementById("recordsTableBody");
  if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-500">Syncing...</td></tr>';

  try {
    const response = await fetch(SHEET_READ_URL);
    const textData = await response.text();
    const json = JSON.parse(textData.substring(47).slice(0, -2));

    const remoteData = json.table.rows.map((row, index) => {
        const getCell = (i) => (row.c[i] ? (row.c[i].v !== null ? row.c[i].v : '') : '');
        let dateVal = getCell(0);
        if(typeof dateVal === 'string' && dateVal.includes('Date')) {
             const parts = /\d+,\d+,\d+/.exec(dateVal)[0].split(',');
             dateVal = new Date(parts[0], parts[1], parts[2]).toISOString().split('T')[0];
        }
        return {
            id: index, date: dateVal, type: getCell(1), farm: getCell(2),
            category: getCell(3), notes: getCell(4), amount: parseFloat(getCell(5)) || 0,
            quantity: parseFloat(getCell(6)) || 0
        };
    });

    remoteData.sort((a,b) => new Date(b.date) - new Date(a.date));
    processData(remoteData);
  } catch (e) {
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500">Offline</td></tr>';
  }
}

function processData(data) {
  globalData = data;
  const tbody = document.getElementById("recordsTableBody");
  if(!tbody) return;
  tbody.innerHTML = "";

  let totalInc = 0, totalExp = 0, household = 0;
  let areca = { inc: 0, exp: 0 }, paddy = { inc: 0, exp: 0 };

  data.forEach(r => {
    let badge = r.type === 'income' ? 'IN' : (r.type === 'expense' ? 'OUT' : 'HOME');
    let color = r.type === 'income' ? 'emerald' : (r.type === 'expense' ? 'red' : 'amber');

    // MOBILE CARD SUPPORT: Added data-label attributes
    tbody.innerHTML += `
      <tr class="hover:bg-slate-800/50">
        <td data-label="Date" class="p-4 text-slate-300">${r.date}</td>
        <td data-label="Type" class="p-4"><span class="px-2 py-0.5 bg-${color}-500/20 text-${color}-400 rounded text-[10px] font-bold">${badge}</span></td>
        <td data-label="Source" class="p-4 capitalize text-slate-300 text-xs">${r.farm}</td>
        <td data-label="Category" class="p-4 text-slate-300 text-xs">${r.category}</td>
        <td data-label="Notes" class="p-4 text-slate-400 text-[10px] italic">${r.notes || '-'}</td>
        <td data-label="Amount" class="p-4 text-right font-mono text-white">₹${r.amount.toLocaleString()}</td>
        <td data-label="Action" class="p-4 text-center"><a href="https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit" target="_blank" class="text-emerald-400 text-[10px]">VIEW</a></td>
      </tr>`;

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
  updateElement("totalIncome", "₹" + totalInc.toLocaleString());
  updateElement("totalExpense", "₹" + totalExp.toLocaleString());
  updateElement("householdTotal", "₹" + household.toLocaleString());
  updateElement("net", "₹" + netVal.toLocaleString());
  updateElement("headerNet", "₹" + netVal.toLocaleString());
  
  updateElement("arecanutNet", "₹" + (areca.inc - areca.exp).toLocaleString());
  updateElement("paddyNet", "₹" + (paddy.inc - paddy.exp).toLocaleString());
  
  if(document.getElementById("arecaBar")) document.getElementById("arecaBar").style.width = (areca.inc > 0 ? ((areca.inc-areca.exp)/areca.inc)*100 : 0) + "%";
}

function updateElement(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

function saveEntry() {
  const saveBtn = document.getElementById("saveBtn");
  const type = document.getElementById("entryType").value;
  const amt = parseFloat(document.getElementById("amount").value) || 0;
  if (amt <= 0) return alert("Enter valid amount");

  saveBtn.textContent = "Saving...";
  saveBtn.disabled = true;

  const formData = new FormData();
  formData.append("date", document.getElementById("date").value);
  formData.append("type", type);
  formData.append("farm", type === "household" ? "household" : document.getElementById("farmType").value);
  formData.append("category", document.getElementById("category").value);
  formData.append("amount", amt);
  formData.append("quantity", document.getElementById("quantity").value || 0);

  fetch(SCRIPT_URL, { method: "POST", body: formData })
    .then(r => r.json())
    .then(d => { if(d.result === "success") { loadRemoteData(); showTab('dashboard'); } })
    .finally(() => { saveBtn.textContent = "Save Entry"; saveBtn.disabled = false; });
}