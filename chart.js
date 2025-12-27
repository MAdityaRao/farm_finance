// ============================================================

let chartInstances = {};
let currentView = 'overall';
let currentYear = 'all';
let analyticsData = {}; 

// ============================================================
// INITIALIZATION
// ============================================================
function initAnalytics() {
    if (typeof globalData === 'undefined' || !globalData || globalData.length === 0) {
        renderEmptyState();
        return;
    }

    const years = new Set(globalData.map(d => {
        const date = new Date(d.date);
        return isNaN(date.getTime()) ? null : date.getFullYear();
    }).filter(y => y !== null));
    
    years.add(new Date().getFullYear());
    // Sort years descending
    const availableYears = Array.from(years).sort((a,b) => b - a);
    
    populateYearSelector(availableYears);
    renderChartsAndAnalytics();
}

function populateYearSelector(years) {
    const yearSelect = document.getElementById('yearSelect');
    if(!yearSelect) return;
    
    const current = yearSelect.value;
    yearSelect.innerHTML = '<option value="all">All Time</option>';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y.toString();
        opt.textContent = `${y}`;
        yearSelect.appendChild(opt);
    });
    
    if(years.map(String).includes(current)) {
        yearSelect.value = current;
    } else {
        yearSelect.value = 'all';
    }
}

function handleYearChange() {
    const sel = document.getElementById('yearSelect');
    if (sel) {
        currentYear = sel.value;
        renderChartsAndAnalytics();
    }
}

function updateAnalyticsView(view) {
    currentView = view;
    
    const views = ['overall', 'arecanut', 'paddy', 'household'];
    views.forEach(v => {
        const btn = document.getElementById(`btn-${v}`);
        if(btn) {
            // Responsive classes: Grid style on mobile, Tab style on desktop
            const isActive = v === view;
            const baseClass = "flex-1 sm:flex-none px-4 py-2 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap";
            
            btn.className = isActive
                ? `${baseClass} bg-white text-slate-900 shadow-sm ring-1 ring-slate-200`
                : `${baseClass} text-slate-500 hover:text-slate-700 hover:bg-slate-50/50`;
        }
    });
    
    renderChartsAndAnalytics();
}

// ============================================================
// MAIN RENDERING
// ============================================================
function renderChartsAndAnalytics() {
    if (typeof globalData === 'undefined' || !globalData || globalData.length === 0) {
        renderEmptyState();
        return;
    }
    
    // 1. Filter Data
    const filteredData = globalData.filter(item => {
        // View Filter
        if (currentView === 'household') {
            if (item.type !== 'household' && item.farm !== 'household') return false;
        } else if (currentView !== 'overall') {
            if (item.farm !== currentView) return false;
        }

        // Year Filter
        if(currentYear === 'all') return true;
        const d = new Date(item.date);
        return !isNaN(d.getTime()) && d.getFullYear().toString() === currentYear.toString();
    });

    if(filteredData.length === 0) {
        renderEmptyState();
        return;
    }

    // 2. Process Data
    analyticsData = processAdvancedAnalytics(filteredData);
    
    // 3. Update UI
    updateKPICards(analyticsData.metrics);
    updateMonthlyBreakdown(analyticsData.monthlyStats);
    
    if (typeof Chart !== 'undefined') {
        renderCategoryChart('categoryChart', analyticsData);
        renderSeasonalChart('seasonalChart', analyticsData);
    }
}

// ============================================================
// DATA PROCESSING
// ============================================================
function processAdvancedAnalytics(data) {
    const result = {
        monthlyStats: {},
        categoryMap: {},
        seasonalPatterns: {},
        metrics: {}
    };

    let totalIncome = 0;
    let totalExpense = 0;
    let totalHousehold = 0;

    data.forEach(item => {
        const date = new Date(item.date);
        if (isNaN(date.getTime())) return;

        // Use 'YYYY-MM' as key for sorting, 'MMM YY' for display
        const sortKey = date.toISOString().slice(0, 7); // 2025-05
        const displayKey = date.toLocaleString('default', { month: 'short', year: '2-digit' }); // May 25
        
        if (!result.monthlyStats[sortKey]) {
            result.monthlyStats[sortKey] = { 
                label: displayKey,
                income: 0, expense: 0, household: 0, profit: 0, 
                rawDate: new Date(date.getFullYear(), date.getMonth(), 1) 
            };
        }

        const amount = item.amount || 0;
        const cat = item.category || 'General';
        const season = getSeason(date.getMonth());
        
        if(!result.seasonalPatterns[season]) {
            result.seasonalPatterns[season] = { income: 0, expense: 0, household: 0 };
        }

        // Logic Order: Household -> Income -> Expense
        if (item.type === 'household' || item.farm === 'household') {
            result.monthlyStats[sortKey].household += amount;
            totalHousehold += amount;
            result.categoryMap[cat] = (result.categoryMap[cat] || 0) + amount;
            result.seasonalPatterns[season].household += amount;
        } 
        else if (item.type === 'income') {
            result.monthlyStats[sortKey].income += amount;
            totalIncome += amount;
            
            // For Farm views, track income sources in category chart
            if (currentView !== 'household' && currentView !== 'overall') {
                 const incomeCat = `(Inc) ${cat}`;
                 result.categoryMap[incomeCat] = (result.categoryMap[incomeCat] || 0) + amount;
            }
            result.seasonalPatterns[season].income += amount;
        } 
        else if (item.type === 'expense') {
            result.monthlyStats[sortKey].expense += amount;
            totalExpense += amount;
            result.categoryMap[cat] = (result.categoryMap[cat] || 0) + amount;
            result.seasonalPatterns[season].expense += amount;
        }

        result.monthlyStats[sortKey].profit = 
            result.monthlyStats[sortKey].income - result.monthlyStats[sortKey].expense - result.monthlyStats[sortKey].household;
    });

    // Metrics Calculation
    const netProfit = totalIncome - totalExpense - totalHousehold;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome * 100) : 0;
    const roi = (totalExpense + totalHousehold) > 0 ? (netProfit / (totalExpense + totalHousehold) * 100) : 0;
    const efficiency = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0;

    result.metrics = {
        totalIncome,
        totalExpense,
        totalHousehold,
        netProfit,
        profitMargin: profitMargin.toFixed(1),
        roi: roi.toFixed(1),
        efficiency: efficiency.toFixed(1)
    };

    return result;
}

function getSeason(month) {
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
}

// ============================================================
// CHART RENDERING
// ============================================================

function renderCategoryChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances.category) chartInstances.category.destroy();
    
    const categories = Object.entries(data.categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); 
    
    if (categories.length === 0) {
        chartInstances.category = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['No Data'], datasets: [{ data: [1], backgroundColor: ['#f1f5f9'], borderWidth: 0 }] },
            options: { plugins: { tooltip: { enabled: false }, legend: { display: false } }, cutout: '75%' }
        });
        return;
    }
    
    chartInstances.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(c => c[0]),
            datasets: [{
                data: categories.map(c => c[1]),
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
                ],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 }, padding: 10 } } 
            },
            cutout: '70%'
        }
    });
}

function renderSeasonalChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances.seasonal) chartInstances.seasonal.destroy();
    
    const seasons = ['Spring', 'Summer', 'Fall', 'Winter'];
    const incomeData = seasons.map(s => data.seasonalPatterns[s]?.income || 0);
    const expenseData = seasons.map(s => data.seasonalPatterns[s]?.expense || 0);
    const householdData = seasons.map(s => data.seasonalPatterns[s]?.household || 0);
    
    let datasets = [];
    if(currentView === 'household') {
         datasets = [{ label: 'Household', data: householdData, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.6 }];
    } else {
         datasets = [
            { label: 'Income', data: incomeData, backgroundColor: '#10b981', borderRadius: 4, barPercentage: 0.6 },
            { label: 'Expense', data: expenseData, backgroundColor: '#ef4444', borderRadius: 4, barPercentage: 0.6 }
         ];
    }
    
    chartInstances.seasonal = new Chart(ctx, {
        type: 'bar',
        data: { labels: seasons, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    grid: { color: '#f1f5f9' },
                    ticks: { font: { size: 9 }, callback: v => '₹' + v.toLocaleString('en-IN', {notation: "compact"}) } 
                },
                x: { 
                    grid: { display: false },
                    ticks: { font: { size: 9 } } 
                }
            }
        }
    });
}

// ============================================================
// UI UPDATES
// ============================================================
function updateKPICards(metrics) {
    const formatCurrency = (value) => '₹' + Math.round(value).toLocaleString('en-IN');
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

    set('kpi-net', formatCurrency(metrics.netProfit));
    
    // Better handling for 0/NaN cases
    set('kpi-margin', metrics.totalIncome > 0 ? metrics.profitMargin + '%' : '-');
    set('kpi-roi', metrics.totalExpense > 0 ? metrics.roi + '%' : '-');
    set('kpi-efficiency', metrics.totalIncome > 0 ? metrics.efficiency + '%' : '-');
    
    const netEl = document.getElementById('kpi-net');
    if(netEl) {
        // CHANGED: Removed 'truncate' and added 'break-words'
        // Also adjusted font size to 'text-xl sm:text-2xl' to fit better on mobile
        netEl.className = metrics.netProfit >= 0 
            ? "text-xl sm:text-2xl font-bold text-slate-900 break-words" 
            : "text-xl sm:text-2xl font-bold text-red-600 break-words";
    }
}

function updateMonthlyBreakdown(monthlyStats) {
    const tbody = document.getElementById('monthlyBreakdown');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const keys = Object.keys(monthlyStats).sort().reverse();
    
    // Only show months that actually have data (ignore the 0-filled ones for the table to keep it clean)
    const activeKeys = keys.filter(k => 
        monthlyStats[k].income !== 0 || monthlyStats[k].expense !== 0 || monthlyStats[k].household !== 0
    );
    
    activeKeys.forEach(key => {
        const stats = monthlyStats[key];
        const row = document.createElement('tr');
        row.className = 'border-b border-slate-50 hover:bg-slate-50 transition-colors group';
        row.innerHTML = `
            <td class="p-3 font-medium text-slate-800 text-xs">${stats.label}</td>
            <td class="p-3 text-right font-medium text-emerald-600 text-xs opacity-75 group-hover:opacity-100">₹${Math.round(stats.income).toLocaleString('en-IN')}</td>
            <td class="p-3 text-right font-medium text-red-600 text-xs opacity-75 group-hover:opacity-100">₹${Math.round(stats.expense + stats.household).toLocaleString('en-IN')}</td>
            <td class="p-3 text-right font-bold ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'} text-xs">
                ₹${Math.round(stats.profit).toLocaleString('en-IN')}
            </td>
        `;
        tbody.appendChild(row);
    });
    
    if (activeKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 text-sm">No data available</td></tr>';
    }
}

function renderEmptyState() {
    ['kpi-net', 'kpi-margin', 'kpi-roi', 'kpi-efficiency'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = '--';
    });
    
    ['categoryChart', 'seasonalChart'].forEach(id => {
        const ctx = document.getElementById(id);
        if(ctx && chartInstances[id.replace('Chart', '')]) {
            chartInstances[id.replace('Chart', '')].destroy();
        }
    });

    const tbody = document.getElementById('monthlyBreakdown');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">No data available</td></tr>';
}
