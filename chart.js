// ============================================================
// PREMIUM ANALYTICS & CHART LOGIC (v3.0 Professional)
// ============================================================

let chartInstances = {}; 
let currentView = 'arecanut'; 
let currentYear = new Date().getFullYear().toString();
let availableYears = [];

// ============================================================
// INITIALIZATION
// ============================================================
function initAnalytics() {
  if (!globalData || globalData.length === 0) {
    populateYearSelector([new Date().getFullYear()]);
    return;
  }

  // Extract unique years from data
  const years = new Set(globalData.map(d => {
    const date = new Date(d.date);
    return isNaN(date) ? null : date.getFullYear();
  }).filter(y => y !== null));
  
  years.add(new Date().getFullYear());
  availableYears = Array.from(years).sort((a,b) => b - a);
  
  populateYearSelector(availableYears);
}

function populateYearSelector(years) {
  const yearSelect = document.getElementById('yearSelect');
  if(!yearSelect) return;
  
  const oldVal = yearSelect.value;
  
  yearSelect.innerHTML = '<option value="all">📅 All Time</option>';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `📊 ${y}`;
    yearSelect.appendChild(opt);
  });

  // Restore or default selection
  if(years.includes(parseInt(currentYear))) {
    yearSelect.value = currentYear;
  } else if(oldVal && (oldVal === 'all' || years.includes(parseInt(oldVal)))) {
    yearSelect.value = oldVal;
  } else {
    yearSelect.value = "all";
  }
}

function handleYearChange() {
  const sel = document.getElementById('yearSelect');
  currentYear = sel.value;
  renderChartsAndAnalytics();
}

function updateAnalyticsView(view) {
  currentView = view;
  
  // Update tab buttons
  const views = ['arecanut', 'paddy', 'household'];
  views.forEach(v => {
    const btn = document.getElementById(`btn-${v}`);
    if(btn) {
      if(v === view) {
        btn.className = 'flex-1 py-2.5 px-4 text-xs font-bold rounded-lg transition-all bg-white text-emerald-600 shadow-md ring-2 ring-emerald-200';
      } else {
        btn.className = 'flex-1 py-2.5 px-4 text-xs font-bold rounded-lg transition-all text-slate-500 hover:bg-slate-200/50';
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
  
  if(availableYears.length === 0) initAnalytics();

  const ctx1 = document.getElementById('trendChart');
  const ctx2 = document.getElementById('categoryChart');
  const ctx3 = document.getElementById('profitChart');
  const ctx4 = document.getElementById('comparisonChart');

  if(!ctx1 || !ctx2 || !ctx3) return;

  // FILTER DATA by view and year
  const filteredData = globalData.filter(item => {
    const typeMatch = (currentView === 'household') ? (item.type === 'household') : (item.farm === currentView);
    if(!typeMatch) return false;

    if(currentYear === 'all') return true;
    
    const d = new Date(item.date);
    return !isNaN(d) && d.getFullYear().toString() === currentYear;
  });

  if(filteredData.length === 0) {
    renderEmptyState();
    return;
  }

  // PROCESS DATA
  const analytics = processAnalyticsData(filteredData);
  
  // UPDATE KPI CARDS
  updateKPICards(analytics);
  
  // RENDER CHARTS
  renderTrendChart(ctx1, analytics);
  renderCategoryChart(ctx2, analytics);
  renderProfitChart(ctx3, analytics);
  if(ctx4) renderComparisonChart(ctx4, analytics);
}

// ============================================================
// DATA PROCESSING
// ============================================================
function processAnalyticsData(data) {
  const monthlyStats = {};
  const categoryMap = {};
  const dailyData = [];
  
  let totalInc = 0;
  let totalExp = 0;
  let maxExpCat = { name: '---', val: 0 };
  let minExpCat = { name: '---', val: Infinity };
  let monthsCounted = new Set();
  let transactionCount = data.length;

  data.forEach(r => {
    const d = new Date(r.date);
    if(isNaN(d)) return;
    
    const monthKey = d.toLocaleString('default', { month: 'short' });
    const monthYearKey = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    monthsCounted.add(monthYearKey);

    // Monthly aggregation
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = { inc: 0, exp: 0, profit: 0, count: 0 };
    }
    
    if (r.type === 'income') {
      monthlyStats[monthKey].inc += r.amount;
      totalInc += r.amount;
    } else {
      monthlyStats[monthKey].exp += r.amount;
      totalExp += r.amount;
      
      // Category tracking
      const cat = r.category || 'Uncategorized';
      categoryMap[cat] = (categoryMap[cat] || 0) + r.amount;
      
      if(categoryMap[cat] > maxExpCat.val) {
        maxExpCat = { name: cat, val: categoryMap[cat] };
      }
      if(categoryMap[cat] < minExpCat.val && categoryMap[cat] > 0) {
        minExpCat = { name: cat, val: categoryMap[cat] };
      }
    }
    
    monthlyStats[monthKey].count++;
    monthlyStats[monthKey].profit = monthlyStats[monthKey].inc - monthlyStats[monthKey].exp;
    
    // Daily tracking for cumulative
    dailyData.push({
      date: d,
      amount: r.type === 'income' ? r.amount : -r.amount,
      type: r.type
    });
  });

  // Sort daily data
  dailyData.sort((a, b) => a.date - b.date);
  
  // Calculate cumulative
  const cumulativeData = [];
  const cumulativeLabels = [];
  let runningTotal = 0;
  
  const monthlyGroups = {};
  dailyData.forEach(d => {
    const monthKey = d.date.toLocaleString('default', { month: 'short' });
    if(!monthlyGroups[monthKey]) monthlyGroups[monthKey] = 0;
    monthlyGroups[monthKey] += d.amount;
  });
  
  Object.entries(monthlyGroups).forEach(([month, amount]) => {
    runningTotal += amount;
    cumulativeLabels.push(month);
    cumulativeData.push(runningTotal);
  });

  // Calculate derived metrics
  const netProfit = totalInc - totalExp;
  const monthCount = monthsCounted.size || 1;
  const avgIncome = totalInc / monthCount;
  const avgExpense = totalExp / monthCount;
  const profitMargin = totalInc > 0 ? ((netProfit / totalInc) * 100) : 0;
  
  // Top 5 categories
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    monthlyStats,
    categoryMap: Object.fromEntries(topCategories),
    cumulativeData,
    cumulativeLabels,
    totalInc,
    totalExp,
    netProfit,
    avgIncome,
    avgExpense,
    profitMargin,
    maxExpCat,
    minExpCat,
    monthCount,
    transactionCount
  };
}

// ============================================================
// KPI CARD UPDATES
// ============================================================
function updateKPICards(analytics) {
  const { netProfit, avgIncome, maxExpCat, profitMargin, avgExpense, transactionCount } = analytics;
  
  // Main KPIs
  updateElement('kpi-net', '₹' + Math.round(netProfit).toLocaleString('en-IN'));
  const netEl = document.getElementById('kpi-net');
  if(netEl) {
    netEl.className = `text-2xl font-extrabold mb-1 relative z-10 ${netProfit >= 0 ? 'text-slate-900' : 'text-red-500'}`;
  }
  
  updateElement('kpi-avg', '₹' + Math.round(avgIncome).toLocaleString('en-IN'));
  updateElement('kpi-exp', maxExpCat.name);
  updateElement('kpi-exp-val', '₹' + Math.round(maxExpCat.val).toLocaleString('en-IN'));
  updateElement('kpi-margin', profitMargin.toFixed(1) + '%');
  
  const marginEl = document.getElementById('kpi-margin');
  if(marginEl) {
    marginEl.className = `text-2xl font-extrabold mb-1 relative z-10 ${profitMargin >= 0 ? 'text-slate-900' : 'text-red-500'}`;
  }
  
  // Additional stats
  updateElement('kpi-avg-expense', '₹' + Math.round(avgExpense).toLocaleString('en-IN'));
  updateElement('kpi-total-transactions', transactionCount);
  updateElement('kpi-months-tracked', analytics.monthCount);
}

// ============================================================
// CHART 1: MONTHLY TREND (Bar Chart)
// ============================================================
function renderTrendChart(ctx, analytics) {
  if (chartInstances.trend) chartInstances.trend.destroy();

  const labels = Object.keys(analytics.monthlyStats);
  const incomeData = labels.map(m => analytics.monthlyStats[m].inc);
  const expenseData = labels.map(m => analytics.monthlyStats[m].exp);

  chartInstances.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { 
          label: 'Income', 
          data: incomeData,
          backgroundColor: createGradient(ctx, 'rgba(16, 185, 129, 0.9)', 'rgba(5, 150, 105, 0.9)'),
          borderRadius: 8,
          borderWidth: 0,
          barPercentage: 0.7,
        },
        { 
          label: 'Expense', 
          data: expenseData,
          backgroundColor: createGradient(ctx, 'rgba(239, 68, 68, 0.9)', 'rgba(220, 38, 38, 0.9)'),
          borderRadius: 8,
          borderWidth: 0,
          barPercentage: 0.7,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { 
        mode: 'index', 
        intersect: false 
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { 
            font: { size: 11, weight: '600' },
            color: '#64748b'
          }
        },
        y: { 
          grid: { 
            color: '#f1f5f9',
            drawBorder: false
          },
          ticks: { 
            callback: (v) => '₹' + (v/1000).toFixed(0) + 'k',
            font: { size: 11, weight: '600' },
            color: '#64748b'
          }
        }
      },
      plugins: { 
        legend: { 
          position: 'top',
          align: 'end',
          labels: { 
            usePointStyle: true,
            padding: 15,
            font: { size: 12, weight: '700' },
            color: '#334155'
          }
        },
        tooltip: { 
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: '#0f172a',
          bodyColor: '#475569',
          borderColor: '#e2e8f0',
          borderWidth: 2,
          padding: 12,
          displayColors: true,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12, weight: '600' },
          callbacks: {
            label: (context) => {
              return `${context.dataset.label}: ₹${context.parsed.y.toLocaleString('en-IN')}`;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// CHART 2: CATEGORY BREAKDOWN (Doughnut)
// ============================================================
function renderCategoryChart(ctx, analytics) {
  if (chartInstances.category) chartInstances.category.destroy();

  const categories = Object.keys(analytics.categoryMap);
  const values = Object.values(analytics.categoryMap);
  
  if(categories.length === 0) {
    renderEmptyChart(ctx, 'No expense data available');
    return;
  }

  const colors = [
    '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', 
    '#10b981', '#ef4444', '#06b6d4', '#f97316'
  ];

  chartInstances.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, categories.length),
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 15,
        hoverBorderWidth: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { 
        legend: { 
          position: 'right',
          labels: { 
            boxWidth: 12,
            padding: 12,
            font: { size: 11, weight: '600' },
            color: '#334155',
            generateLabels: (chart) => {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: `${label} (₹${(data.datasets[0].data[i]/1000).toFixed(1)}k)`,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: '#0f172a',
          bodyColor: '#475569',
          borderColor: '#e2e8f0',
          borderWidth: 2,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12, weight: '600' },
          callbacks: {
            label: (context) => {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `₹${value.toLocaleString('en-IN')} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// CHART 3: CUMULATIVE PROFIT (Line/Area)
// ============================================================
function renderProfitChart(ctx, analytics) {
  if (chartInstances.profit) chartInstances.profit.destroy();

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  chartInstances.profit = new Chart(ctx, {
    type: 'line',
    data: {
      labels: analytics.cumulativeLabels,
      datasets: [{
        label: 'Cumulative Profit',
        data: analytics.cumulativeData,
        borderColor: '#059669',
        backgroundColor: gradient,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#059669',
        pointBorderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { 
          grid: { display: false },
          ticks: { 
            font: { size: 11, weight: '600' },
            color: '#64748b'
          }
        },
        y: { 
          grid: { 
            color: '#f1f5f9',
            drawBorder: false
          },
          ticks: { 
            callback: (v) => '₹' + (v/1000).toFixed(0) + 'k',
            font: { size: 11, weight: '600' },
            color: '#64748b'
          }
        }
      },
      plugins: { 
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: '#0f172a',
          bodyColor: '#475569',
          borderColor: '#10b981',
          borderWidth: 2,
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12, weight: '600' },
          callbacks: {
            label: (context) => `Profit: ₹${context.parsed.y.toLocaleString('en-IN')}`
          }
        }
      }
    }
  });
}

// ============================================================
// CHART 4: MONTHLY COMPARISON (Optional)
// ============================================================
function renderComparisonChart(ctx, analytics) {
  if (chartInstances.comparison) chartInstances.comparison.destroy();

  const labels = Object.keys(analytics.monthlyStats);
  const profitData = labels.map(m => analytics.monthlyStats[m].profit);

  chartInstances.comparison = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Monthly Profit',
        data: profitData,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 3,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#8b5cf6',
        pointBorderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { 
          grid: { display: false },
          ticks: { font: { size: 11, weight: '600' }, color: '#64748b' }
        },
        y: { 
          grid: { color: '#f1f5f9', drawBorder: false },
          ticks: { 
            callback: (v) => '₹' + (v/1000).toFixed(0) + 'k',
            font: { size: 11, weight: '600' },
            color: '#64748b'
          }
        }
      },
      plugins: { 
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          titleColor: '#0f172a',
          bodyColor: '#475569',
          borderColor: '#8b5cf6',
          borderWidth: 2,
          padding: 12
        }
      }
    }
  });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function createGradient(ctx, color1, color2) {
  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function renderEmptyState() {
  ['kpi-net', 'kpi-avg', 'kpi-margin'].forEach(id => updateElement(id, '₹0'));
  updateElement('kpi-exp', 'No Data');
  updateElement('kpi-exp-val', '---');
  
  ['trendChart', 'categoryChart', 'profitChart', 'comparisonChart'].forEach(id => {
    const ctx = document.getElementById(id);
    if(ctx) renderEmptyChart(ctx, 'No data available for selected period');
  });
}

function renderEmptyChart(ctx, message) {
  const chart = chartInstances[ctx.id];
  if(chart) chart.destroy();
  
  const context = ctx.getContext('2d');
  context.clearRect(0, 0, ctx.width, ctx.height);
  context.font = '14px Inter';
  context.fillStyle = '#94a3b8';
  context.textAlign = 'center';
  context.fillText(message, ctx.width / 2, ctx.height / 2);
}