// ----------------------------------------------------
// ANALYTICS & CHART LOGIC (WHITE THEME)
// ----------------------------------------------------

let chartInstances = {}; 
let currentView = 'arecanut'; 

function renderChartsAndAnalytics() {
  if (typeof globalData === 'undefined' || !globalData || globalData.length === 0) return;

  const ctx1 = document.getElementById('trendChart');
  const ctx2 = document.getElementById('categoryChart');
  if(!ctx1 || !ctx2) return;

  // Cleanup Old Charts
  if (chartInstances.trend) chartInstances.trend.destroy();
  if (chartInstances.category) chartInstances.category.destroy();

  // Filter Data
  const filteredData = globalData.filter(item => {
      if (currentView === 'household') return item.type === 'household';
      return item.farm === currentView;
  });

  const chartTitle = document.getElementById('barChartTitle');
  if(chartTitle) {
      chartTitle.textContent = `${currentView.charAt(0).toUpperCase() + currentView.slice(1)} Cash Flow`;
  }

  // Bar Chart Data (Monthly)
  const monthlyStats = {};
  [...filteredData].reverse().forEach(r => {
      const dateObj = new Date(r.date);
      if(isNaN(dateObj)) return; 
      const monthKey = dateObj.toLocaleString('default', { month: 'short', year: '2-digit' });
      
      if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { inc: 0, exp: 0 };
      if (r.type === 'income') monthlyStats[monthKey].inc += r.amount;
      else monthlyStats[monthKey].exp += r.amount;
  });

  const labels = Object.keys(monthlyStats).slice(-6);
  
  // RENDER BAR CHART (Dark Text for White Theme)
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
              x: { ticks: { color: '#64748b', font: {size: 11, weight: '600'} }, grid: { display: false } },
              y: { ticks: { display: false }, grid: { color: '#f1f5f9' } }
          },
          plugins: { legend: { labels: { color: '#475569', font: {size: 11, weight: 'bold'} } } }
      }
  });

  // Pie Chart Data
  const catMap = {};
  filteredData.forEach(r => {
      if (r.type === 'expense' || r.type === 'household') {
          catMap[r.category] = (catMap[r.category] || 0) + r.amount;
      }
  });

  const pieLabels = Object.keys(catMap);
  const pieData = Object.values(catMap);

  // RENDER DOUGHNUT CHART
  chartInstances.category = new Chart(ctx2, {
      type: 'doughnut',
      data: {
          labels: pieLabels,
          datasets: [{
              data: pieData,
              backgroundColor: ['#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'],
              borderWidth: 2,
              borderColor: '#ffffff'
          }]
      },
      options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: { legend: { position: 'right', labels: { color: '#475569', font: {size: 12, weight: '600'} } } }
      }
  });
}

function updateAnalyticsView(view) {
    currentView = view;
    const views = ['arecanut', 'paddy', 'household'];
    views.forEach(v => {
        const btn = document.getElementById(`btn-${v}`);
        if(btn) {
            if(v === view) {
                btn.classList.add('bg-emerald-600', 'text-white');
                btn.classList.remove('text-slate-400');
            } else {
                btn.classList.remove('bg-emerald-600', 'text-white');
                btn.classList.add('text-slate-400');
            }
        }
    });
    renderChartsAndAnalytics();
}