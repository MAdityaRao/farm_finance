// ============================================================
// ADVANCED ANALYTICS ENGINE - FIXED VERSION
// ============================================================

let chartInstances = {};
let currentView = 'overall';
let currentYear = 'all';
let availableYears = [];
let analyticsData = {}; // Global store for processed data

// ============================================================
// INITIALIZATION
// ============================================================
function initAnalytics() {
    // Safety check for globalData
    if (typeof globalData === 'undefined' || !globalData || globalData.length === 0) {
        console.warn("Global Data not found or empty.");
        populateYearSelector([new Date().getFullYear()]);
        renderEmptyState();
        return;
    }

    // Extract unique years from data
    const years = new Set(globalData.map(d => {
        const date = new Date(d.date);
        return isNaN(date.getTime()) ? null : date.getFullYear();
    }).filter(y => y !== null));
    
    // Always include current year
    years.add(new Date().getFullYear());
    
    // Sort descending
    availableYears = Array.from(years).sort((a,b) => b - a);
    
    populateYearSelector(availableYears);
    
    // Initial Render
    renderChartsAndAnalytics();
}

function populateYearSelector(years) {
    const yearSelect = document.getElementById('yearSelect');
    if(!yearSelect) return;
    
    yearSelect.innerHTML = '<option value="all">All Time</option>';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y.toString();
        opt.textContent = `${y}`;
        yearSelect.appendChild(opt);
    });
    
    yearSelect.value = currentYear;
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
    
    // Update tab buttons visual state
    const views = ['overall', 'arecanut', 'paddy', 'household'];
    views.forEach(v => {
        const btn = document.getElementById(`btn-${v}`);
        if(btn) {
            if(v === view) {
                btn.className = 'flex-1 py-2 text-[11px] font-bold rounded-md bg-white text-slate-900 shadow-sm transition-all border border-slate-200';
            } else {
                btn.className = 'flex-1 py-2 text-[11px] font-bold rounded-md text-slate-500 hover:text-slate-700 transition-all';
            }
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
    
    if(availableYears.length === 0 && globalData.length > 0) {
        // localized lazy init if needed
        const years = new Set(globalData.map(d => new Date(d.date).getFullYear()));
        availableYears = Array.from(years).sort((a,b) => b - a);
    }

    // FILTER DATA by view and year
    const filteredData = globalData.filter(item => {
        // 1. Handle View Filtering
        if (currentView === 'household') {
            if (item.type !== 'household') return false;
        } else if (currentView !== 'overall') {
            // For 'arecanut' or 'paddy', filter by farm property
            if (item.farm !== currentView) return false;
        }

        // 2. Handle Year Filtering
        if(currentYear === 'all') return true;
        
        const d = new Date(item.date);
        return !isNaN(d.getTime()) && d.getFullYear().toString() === currentYear.toString();
    });

    if(filteredData.length === 0) {
        renderEmptyState();
        return;
    }

    // PROCESS DATA & UPDATE GLOBAL STORE
    // FIX: Assign result to global 'analyticsData' so other functions can access it
    analyticsData = processAdvancedAnalytics(filteredData);
    
    // UPDATE KPI CARDS
    updateKPICards(analyticsData.metrics);
    
    // RENDER CHARTS
    // Check if Chart.js is loaded
    if (typeof Chart !== 'undefined') {
        renderTrendChart('trendChart', analyticsData);
        renderCategoryChart('categoryChart', analyticsData);
        renderSeasonalChart('seasonalChart', analyticsData);
        renderForecastChart('forecastChart', analyticsData);
    } else {
        console.error("Chart.js library is not loaded.");
    }
    
    // Update monthly breakdown table
    updateMonthlyBreakdown(analyticsData.monthlyStats);
}

// ============================================================
// DATA PROCESSING
// ============================================================
function processAdvancedAnalytics(data) {
    const result = {
        monthlyStats: {},
        categoryMap: {},
        seasonalPatterns: {},
        forecastData: {},
        metrics: {},
        farmBreakdown: {}
    };

    let totalIncome = 0;
    let totalExpense = 0;
    let totalHousehold = 0;
    
    // Initialize farm breakdown structure
    result.farmBreakdown = {
        arecanut: { income: 0, expense: 0 },
        paddy: { income: 0, expense: 0 },
        household: { income: 0, expense: 0 },
        other: { income: 0, expense: 0 }
    };

    data.forEach(item => {
        const date = new Date(item.date);
        if (isNaN(date.getTime())) return;

        // Create a sortable key (YYYY-MM) and a display key
        const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        
        if (!result.monthlyStats[monthKey]) {
            result.monthlyStats[monthKey] = { 
                income: 0, 
                expense: 0, 
                household: 0,
                profit: 0,
                transactions: 0,
                rawDate: date // Store one date instance for sorting later
            };
        }

        // Determine farm type safely
        const farmType = item.type === 'household' ? 'household' : (item.farm || 'other');
        
        // Ensure the farm type exists in our breakdown (handle unexpected types)
        if (!result.farmBreakdown[farmType]) {
            result.farmBreakdown[farmType] = { income: 0, expense: 0 };
        }

        if (item.type === 'income') {
            result.monthlyStats[monthKey].income += item.amount;
            totalIncome += item.amount;
            result.farmBreakdown[farmType].income += item.amount;
        } else if (item.type === 'expense') {
            result.monthlyStats[monthKey].expense += item.amount;
            totalExpense += item.amount;
            result.farmBreakdown[farmType].expense += item.amount;
            
            // Category analysis (only for expenses)
            const category = item.category || 'Uncategorized';
            result.categoryMap[category] = (result.categoryMap[category] || 0) + item.amount;
        } else if (item.type === 'household') {
            result.monthlyStats[monthKey].household += item.amount;
            totalHousehold += item.amount;
            result.farmBreakdown.household.expense += item.amount;
        }

        // Net calculation for the month
        result.monthlyStats[monthKey].profit = 
            result.monthlyStats[monthKey].income - result.monthlyStats[monthKey].expense - result.monthlyStats[monthKey].household;
        result.monthlyStats[monthKey].transactions++;

        // Seasonal patterns
        const season = getSeason(date.getMonth());
        if (!result.seasonalPatterns[season]) {
            result.seasonalPatterns[season] = { income: 0, expense: 0, household: 0 };
        }
        
        if (item.type === 'income') {
            result.seasonalPatterns[season].income += item.amount;
        } else if (item.type === 'expense') {
            result.seasonalPatterns[season].expense += item.amount;
        } else {
            result.seasonalPatterns[season].household += item.amount;
        }
    });

    // Calculate advanced metrics
    const netProfit = totalIncome - totalExpense - totalHousehold;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome * 100) : 0;
    
    // ROI calculation (Investment = Total Expenses)
    const totalInvestment = totalExpense + totalHousehold; // Including household in investment base for total ROI
    const roi = totalInvestment > 0 ? (netProfit / totalInvestment * 100) : 0;
    
    // Efficiency calculation (Farm only)
    const efficiency = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0;
    
    // Find peak month
    let peakMonth = { name: '---', value: 0 };
    Object.entries(result.monthlyStats).forEach(([month, stats]) => {
        if (stats.income > peakMonth.value) {
            peakMonth = { name: month, value: stats.income };
        }
    });

    // Calculate growth rate (comparing last 2 available months)
    let growthRate = 0;
    const months = Object.keys(result.monthlyStats); // These are keys, order is not guaranteed yet
    // We need to sort months chronologically to calculate growth correctly
    const sortedMonths = months.sort((a, b) => {
        const dateA = result.monthlyStats[a].rawDate;
        const dateB = result.monthlyStats[b].rawDate;
        return dateA - dateB;
    });

    if (sortedMonths.length >= 2) {
        const recentMonths = sortedMonths.slice(-2);
        const recentIncome1 = result.monthlyStats[recentMonths[0]].income; // Previous
        const recentIncome2 = result.monthlyStats[recentMonths[1]].income; // Current
        growthRate = recentIncome1 > 0 ? ((recentIncome2 - recentIncome1) / recentIncome1 * 100) : 0;
    }

    // Calculate forecasting
    result.forecastData = calculateForecast(result.monthlyStats, sortedMonths);

    result.metrics = {
        totalIncome,
        totalExpense,
        totalHousehold,
        netProfit,
        profitMargin: profitMargin.toFixed(1),
        roi: roi.toFixed(1),
        efficiency: efficiency.toFixed(1),
        growthRate: growthRate.toFixed(1),
        peakMonth: peakMonth.name,
        avgMonthlyIncome: totalIncome / Math.max(1, months.length),
        farmBreakdown: result.farmBreakdown,
        costEfficiency: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0,
        yieldRatio: totalExpense > 0 ? (totalIncome / totalExpense) : 0
    };

    return result;
}

function getSeason(month) {
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
}

function calculateForecast(monthlyStats, sortedMonthKeys) {
    const incomeData = sortedMonthKeys.map(m => monthlyStats[m].income);
    
    if (incomeData.length < 2) {
        return {
            nextMonths: ['Next Month'],
            forecastValues: [incomeData.length > 0 ? incomeData[0] : 0]
        };
    }
    
    // Simple linear regression for forecasting
    const n = incomeData.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = incomeData;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return { nextMonths: [], forecastValues: [] };

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    
    // Forecast next 3 months
    const forecast = [];
    for (let i = 0; i < 3; i++) {
        forecast.push(intercept + slope * (n + i));
    }
    
    return {
        nextMonths: ['Next Month', 'Month+2', 'Month+3'],
        forecastValues: forecast.map(v => Math.max(0, v)) // Prevent negative income forecast
    };
}

// ============================================================
// CHART RENDERING FUNCTIONS
// ============================================================
function renderTrendChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances.trend) chartInstances.trend.destroy();
    
    // Ensure we sort months chronologically for the chart
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
        datasets = [
            {
                label: 'Income',
                data: incomeData,
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgb(16, 185, 129)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            },
            {
                label: 'Expense',
                data: expenseData,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgb(239, 68, 68)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            },
            {
                label: 'Household',
                data: householdData,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }
        ];
    } else if (trendType === 'profit') {
        datasets = [{
            label: 'Net Profit',
            data: profitData,
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            borderColor: 'rgb(139, 92, 246)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
        }];
    } else {
        // Cumulative
        let cumulative = 0;
        const cumulativeData = profitData.map(p => {
            cumulative += p;
            return cumulative;
        });
        
        datasets = [{
            label: 'Cumulative Profit',
            data: cumulativeData,
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            borderColor: 'rgb(245, 158, 11)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
        }];
    }
    
    chartInstances.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            return label + '₹' + context.parsed.y.toLocaleString('en-IN');
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₹' + value.toLocaleString('en-IN')
                    }
                }
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
        .slice(0, 8); // Top 8 categories
    
    if (categories.length === 0) {
        // Render simple placeholder if no expenses
        const ctx2d = ctx.getContext('2d');
        ctx2d.clearRect(0, 0, ctx.width, ctx.height);
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
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 10, font: { size: 10 } }
                }
            }
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
    
    chartInstances.seasonal = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: seasons,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderRadius: 4
                },
                {
                    label: 'Expense',
                    data: expenseData,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + v.toLocaleString('en-IN', {notation: "compact"}) }
                }
            }
        }
    });
}

function renderForecastChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances.forecast) chartInstances.forecast.destroy();
    
    // Sort month keys correctly using the stored rawDate
    const months = Object.keys(data.monthlyStats).sort((a, b) => {
        return data.monthlyStats[a].rawDate - data.monthlyStats[b].rawDate;
    });

    const last6Months = months.slice(-6);
    const historicalData = last6Months.map(m => data.monthlyStats[m].income);
    
    chartInstances.forecast = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...last6Months, ...data.forecastData.nextMonths],
            datasets: [
                {
                    label: 'Actual Income',
                    data: [...historicalData, ...Array(data.forecastData.forecastValues.length).fill(null)],
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 2,
                    tension: 0.3
                },
                {
                    label: 'Forecast',
                    data: [...Array(historicalData.length).fill(null), ...data.forecastData.forecastValues],
                    borderColor: 'rgb(139, 92, 246)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '₹' + v.toLocaleString('en-IN', {notation: "compact"}) }
                }
            }
        }
    });
}

// ============================================================
// UI UPDATE FUNCTIONS
// ============================================================
function updateKPICards(metrics) {
    const formatCurrency = (value) => '₹' + Math.round(value).toLocaleString('en-IN');
    
    // Helper to safely set text content
    const set = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.textContent = val;
    };

    set('kpi-net', formatCurrency(metrics.netProfit));
    set('kpi-margin', metrics.profitMargin + '%');
    set('kpi-roi', metrics.roi + '%');
    set('kpi-efficiency', metrics.efficiency + '%');
    
    set('kpi-avg-monthly', formatCurrency(metrics.avgMonthlyIncome));
    set('kpi-peak-month', metrics.peakMonth);
    set('kpi-growth-rate', metrics.growthRate + '%');
    set('kpi-cost-efficiency', Math.round(metrics.costEfficiency) + '%');
    set('kpi-yield-ratio', metrics.yieldRatio.toFixed(1) + 'x');
    
    // Color coding
    colorCodeElement('kpi-net', metrics.netProfit);
    colorCodeElement('kpi-margin', parseFloat(metrics.profitMargin));
    colorCodeElement('kpi-roi', parseFloat(metrics.roi));
    colorCodeElement('kpi-growth-rate', parseFloat(metrics.growthRate));

    // Update Progress Bars
    updateProgressBar('cost-efficiency-bar', metrics.costEfficiency, 100);
    updateProgressBar('yield-ratio-bar', metrics.yieldRatio * 20, 100); // Scale yield for bar
    
    // Risk Level Calculation
    const margin = parseFloat(metrics.profitMargin);
    let riskLevel = 'Low';
    let riskClass = 'bg-emerald-500';
    let riskWidth = '25%';

    if (margin < 10) {
        riskLevel = 'High';
        riskClass = 'bg-red-500';
        riskWidth = '90%';
    } else if (margin < 25) {
        riskLevel = 'Medium';
        riskClass = 'bg-amber-500';
        riskWidth = '60%';
    }
    
    set('kpi-risk-level', riskLevel);
    const riskBar = document.getElementById('risk-level-bar');
    if (riskBar) {
        riskBar.style.width = riskWidth;
        riskBar.className = `h-full rounded-full ${riskClass}`;
    }
}

function updateProgressBar(id, value, max) {
    const bar = document.getElementById(id);
    if (!bar) return;
    
    const percentage = Math.min(100, Math.max(0, value));
    bar.style.width = percentage + '%';
    
    if (percentage > 66) bar.className = 'h-full rounded-full bg-emerald-500';
    else if (percentage > 33) bar.className = 'h-full rounded-full bg-amber-500';
    else bar.className = 'h-full rounded-full bg-red-500';
}

function colorCodeElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Reset colors
    element.classList.remove('text-emerald-600', 'text-red-600', 'text-slate-900');
    
    if (value > 0) element.classList.add('text-emerald-600');
    else if (value < 0) element.classList.add('text-red-600');
    else element.classList.add('text-slate-900');
}

function updateMonthlyBreakdown(monthlyStats) {
    const tbody = document.getElementById('monthlyBreakdown');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Sort months strictly by date (Newest first)
    const months = Object.keys(monthlyStats).sort((a, b) => {
        return monthlyStats[b].rawDate - monthlyStats[a].rawDate;
    });
    
    months.forEach(month => {
        const stats = monthlyStats[month];
        const margin = stats.income > 0 ? 
            ((stats.income - stats.expense - stats.household) / stats.income * 100) : 0;
        
        const row = document.createElement('tr');
        row.className = 'border-t border-slate-100 hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="p-3 font-medium text-slate-800 text-xs">${month}</td>
            <td class="p-3 text-right font-medium text-emerald-600 text-xs">₹${Math.round(stats.income).toLocaleString('en-IN')}</td>
            <td class="p-3 text-right font-medium text-red-600 text-xs">₹${Math.round(stats.expense).toLocaleString('en-IN')}</td>
            <td class="p-3 text-right font-bold ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'} text-xs">
                ₹${Math.round(stats.profit).toLocaleString('en-IN')}
            </td>
            <td class="p-3 text-right font-medium ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'} text-xs">
                ${margin.toFixed(1)}%
            </td>
        `;
        tbody.appendChild(row);
    });
    
    if (months.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-slate-400 text-sm">
                    No monthly data available
                </td>
            </tr>
        `;
    }
}

// Triggered by the HTML Dropdown
function updateTrendChart() {
    if (analyticsData && typeof Chart !== 'undefined') {
        renderTrendChart('trendChart', analyticsData);
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function renderEmptyState() {
    // Reset KPIs to empty state
    const kpis = ['kpi-net', 'kpi-margin', 'kpi-roi', 'kpi-efficiency', 
                  'kpi-avg-monthly', 'kpi-peak-month', 'kpi-growth-rate', 
                  'kpi-cost-efficiency', 'kpi-yield-ratio'];
    
    kpis.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = '--';
    });
    
    // Reset Risk
    const riskEl = document.getElementById('kpi-risk-level');
    if(riskEl) riskEl.textContent = 'Low';
    
    // Zero out bars
    ['cost-efficiency-bar', 'yield-ratio-bar', 'risk-level-bar'].forEach(id => {
        const bar = document.getElementById(id);
        if (bar) bar.style.width = '0%';
    });
    
    // Clear Canvas
    const chartIds = ['trendChart', 'categoryChart', 'seasonalChart', 'forecastChart'];
    chartIds.forEach(id => {
        if (chartInstances[id.replace('Chart', '')]) {
            chartInstances[id.replace('Chart', '')].destroy();
        }
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', canvas.width/2, canvas.height/2);
        }
    });

    const tbody = document.getElementById('monthlyBreakdown');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">No data available</td></tr>';
    }
}