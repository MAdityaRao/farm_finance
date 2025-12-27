// ============================================================
// ADVANCED ANALYTICS ENGINE - FIXED FOR HOUSEHOLD/PODDY
// ============================================================

let chartInstances = {};
let currentView = 'overall';
let currentYear = 'all';
let availableYears = [];
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
    availableYears = Array.from(years).sort((a,b) => b - a);
    
    populateYearSelector(availableYears);
    renderChartsAndAnalytics();
}

function populateYearSelector(years) {
    const yearSelect = document.getElementById('yearSelect');
    if(!yearSelect) return;
    
    const current = yearSelect.value;
    yearSelect.innerHTML = '<option value="all">All</option>';
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
            btn.className = v === view
                ? 'px-4 py-2 text-[11px] font-bold rounded-md bg-white text-slate-900 shadow-sm whitespace-nowrap transition-all'
                : 'px-4 py-2 text-[11px] font-bold rounded-md text-slate-500 whitespace-nowrap transition-all';
        }
    });
    
    renderChartsAndAnalytics();
}

// ============================================================
// MAIN RENDERING FUNCTION
// ============================================================
function renderChartsAndAnalytics() {
    if (typeof globalData === 'undefined' || !globalData || globalData.length === 0) {
        renderEmptyState();
        return;
    }
    
    const filteredData = globalData.filter(item => {
        // FIX: Broad filter for Household data
        if (currentView === 'household') {
            if (item.type !== 'household' && item.farm !== 'household') return false;
        } else if (currentView !== 'overall') {
            if (item.farm !== currentView) return false;
        }

        if(currentYear === 'all') return true;
        const d = new Date(item.date);
        return !isNaN(d.getTime()) && d.getFullYear().toString() === currentYear.toString();
    });

    if(filteredData.length === 0) {
        renderEmptyState();
        return;
    }

    analyticsData = processAdvancedAnalytics(filteredData);
    
    updateKPICards(analyticsData.metrics);
    updateMonthlyBreakdown(analyticsData.monthlyStats);
    
    if (typeof Chart !== 'undefined') {
        renderTrendChart('trendChart', analyticsData);
        renderCategoryChart('categoryChart', analyticsData);
        renderSeasonalChart('seasonalChart', analyticsData);
    }
}

// ============================================================
// DATA PROCESSING ENGINE
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

        const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        
        if (!result.monthlyStats[monthKey]) {
            result.monthlyStats[monthKey] = { 
                income: 0, expense: 0, household: 0, profit: 0, rawDate: date 
            };
        }

        const amount = item.amount || 0;

        if (item.type === 'income') {
            result.monthlyStats[monthKey].income += amount;
            totalIncome += amount;
            
            const season = getSeason(date.getMonth());
            if(!result.seasonalPatterns[season]) result.seasonalPatterns[season] = { income: 0, expense: 0, household: 0 };
            result.seasonalPatterns[season].income += amount;

        } else if (item.type === 'expense') {
            result.monthlyStats[monthKey].expense += amount;
            totalExpense += amount;
            
            const cat = item.category || 'Uncategorized';
            result.categoryMap[cat] = (result.categoryMap[cat] || 0) + amount;
            
            const season = getSeason(date.getMonth());
            if(!result.seasonalPatterns[season]) result.seasonalPatterns[season] = { income: 0, expense: 0, household: 0 };
            result.seasonalPatterns[season].expense += amount;

        } else if (item.type === 'household' || item.farm === 'household') {
            result.monthlyStats[monthKey].household += amount;
            totalHousehold += amount;
            
            // FIX: Add Household to Category Map so Pie Chart works
            const cat = item.category || 'General';
            result.categoryMap[cat] = (result.categoryMap[cat] || 0) + amount;
            
            const season = getSeason(date.getMonth());
            if(!result.seasonalPatterns[season]) result.seasonalPatterns[season] = { income: 0, expense: 0, household: 0 };
            result.seasonalPatterns[season].household += amount;
        }

        result.monthlyStats[monthKey].profit = 
            result.monthlyStats[monthKey].income - result.monthlyStats[monthKey].expense - result.monthlyStats[monthKey].household;
    });

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
function renderTrendChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances.trend) chartInstances.trend.destroy();
    
    const months = Object.keys(data.monthlyStats).sort((a, b) => {
        return data.monthlyStats[a].rawDate - data.monthlyStats[b].rawDate;
    });

    const incomeData = months.map(m => data.monthlyStats[m].income);
    const expenseData = months.map(m => data.monthlyStats[m].expense);
    const householdData = months.map(m => data.monthlyStats[m].household);
    const profitData = months.map(m => data.monthlyStats[m].profit);
    
    const trendType = document.getElementById('trendType')?.value || 'income_expense';
    
    let datasets = [];
    
    if (trendType === 'income_expense') {
        if (currentView === 'household') {
            // FIX: Only show Household line for Home View
            datasets = [{
                label: 'Household Spend',
                data: householdData,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 2,
                pointRadius: 4, // Bigger dots for visibility
                fill: true,
                tension: 0.3
            }];
        } else if (currentView === 'overall') {
            datasets = [
                {
                    label: 'Income',
                    data: incomeData,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Expense',
                    data: expenseData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Household',
                    data: householdData,
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 2,
                    pointRadius: 3,
                    borderDash: [5, 5],
                    tension: 0.3,
                    fill: false
                }
            ];
        } else {
            // FIX: Hide Household for Farm Views (Paddy/Areca)
            datasets = [
                {
                    label: 'Income',
                    data: incomeData,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Expense',
                    data: expenseData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true
                }
            ];
        }
    } else if (trendType === 'profit') {
        datasets = [{
            label: 'Net Profit',
            data: profitData,
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            borderColor: 'rgb(139, 92, 246)',
            borderWidth: 2,
            pointRadius: 4,
            fill: true,
            tension: 0.3
        }];
    } else {
        let cumulative = 0;
        const cumulativeData = profitData.map(p => { cumulative += p; return cumulative; });
        datasets = [{
            label: 'Cumulative',
            data: cumulativeData,
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            borderColor: 'rgb(245, 158, 11)',
            borderWidth: 2,
            pointRadius: 4,
            fill: true,
            tension: 0.3
        }];
    }
    
    chartInstances.trend = new Chart(ctx, {
        type: 'line',
        data: { labels: months, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: v => '₹' + v.toLocaleString('en-IN', {notation: "compact"}) } },
                x: { ticks: { font: { size: 9 } } }
            }
        }
    });
}

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
            options: { plugins: { tooltip: { enabled: false }, legend: { display: false } }, cutout: '70%' }
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
                borderWidth: 1,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }
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
         datasets = [{ label: 'Household', data: householdData, backgroundColor: '#3b82f6', borderRadius: 4 }];
    } else {
         datasets = [
            { label: 'Income', data: incomeData, backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Expense', data: expenseData, backgroundColor: '#ef4444', borderRadius: 4 }
         ];
    }
    
    chartInstances.seasonal = new Chart(ctx, {
        type: 'bar',
        data: { labels: seasons, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: v => '₹' + v.toLocaleString('en-IN', {notation: "compact"}) } },
                x: { ticks: { font: { size: 9 } } }
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
    set('kpi-margin', metrics.profitMargin + '%');
    set('kpi-roi', metrics.roi + '%');
    set('kpi-efficiency', metrics.efficiency + '%');
    
    const netEl = document.getElementById('kpi-net');
    if(netEl) {
        netEl.className = metrics.netProfit >= 0 ? "text-2xl font-bold text-slate-900 truncate" : "text-2xl font-bold text-red-600 truncate";
    }
}

function updateMonthlyBreakdown(monthlyStats) {
    const tbody = document.getElementById('monthlyBreakdown');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const months = Object.keys(monthlyStats).sort((a, b) => {
        return monthlyStats[b].rawDate - monthlyStats[a].rawDate;
    });
    
    months.forEach(month => {
        const stats = monthlyStats[month];
        const row = document.createElement('tr');
        row.className = 'border-b border-slate-50 hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-3 font-medium text-slate-800 text-xs">${month}</td>
            <td class="p-3 text-right font-medium text-emerald-600 text-xs">₹${Math.round(stats.income).toLocaleString('en-IN')}</td>
            <td class="p-3 text-right font-medium text-red-600 text-xs">₹${Math.round(stats.expense + stats.household).toLocaleString('en-IN')}</td>
            <td class="p-3 text-right font-bold ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'} text-xs">
                ₹${Math.round(stats.profit).toLocaleString('en-IN')}
            </td>
        `;
        tbody.appendChild(row);
    });
    
    if (months.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 text-sm">No data available</td></tr>';
    }
}

function updateTrendChart() {
    if (analyticsData && typeof Chart !== 'undefined') {
        renderTrendChart('trendChart', analyticsData);
    }
}

function renderEmptyState() {
    ['kpi-net', 'kpi-margin', 'kpi-roi', 'kpi-efficiency'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = '--';
    });
    
    ['trendChart', 'categoryChart', 'seasonalChart'].forEach(id => {
        const ctx = document.getElementById(id);
        if(ctx && chartInstances[id.replace('Chart', '')]) {
            chartInstances[id.replace('Chart', '')].destroy();
        }
    });

    const tbody = document.getElementById('monthlyBreakdown');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">No data available</td></tr>';
}