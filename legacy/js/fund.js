// ================================
// FUND MODULE
// All fund-related functions
// ================================

window.FundModule = {
  async updateCollectionTabTotal() {
    // Always use cached data first for instant display
    this.updateCollectionTabTotalOffline();

    // Then try to update from server in background (only at init/refresh)
    if (App.shouldFetchFreshData) {
      try {
        const { data, error } = await db.from('fund').select('amount, month, type');
        if (error) throw error;

        // Update cache
        const fullData = await db.from('fund').select('*').order('month', { ascending: true }).order('timestamp', { ascending: true });
        if (fullData.data) {
          localStorage.setItem('allFundData', JSON.stringify(fullData.data));
          App.state.allFundData = fullData.data;
        }

        const allIncome = (data || []).filter(d => d.type === 'income');
        const totalIncome = allIncome.reduce((sum, item) => sum + item.amount, 0);

        // ALWAYS use actual current month (not selected month)
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthIncome = allIncome.filter(d => d.month === currentMonthKey).reduce((sum, item) => sum + item.amount, 0);

        document.getElementById('collectionTabTotal').textContent = `৳ ${totalIncome.toLocaleString()}`;
        document.getElementById('collectionTabMonth').textContent = `৳ ${monthIncome.toLocaleString()} this month`;
      } catch (err) {
        console.error('Error updating collection tab from server:', err);
        // Already showing cached data, so no action needed
      }
    }
  },

  updateCollectionTabTotalOffline() {
    try {
      const allCached = App.state.allFundData.length > 0
        ? App.state.allFundData
        : JSON.parse(localStorage.getItem('allFundData') || '[]');

      const allIncome = allCached.filter(d => d.type === 'income');
      const totalIncome = allIncome.reduce((sum, item) => sum + item.amount, 0);

      // ALWAYS use actual current month (not selected month)
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthIncome = allIncome.filter(d => d.month === currentMonthKey).reduce((sum, item) => sum + item.amount, 0);

      document.getElementById('collectionTabTotal').textContent = `৳ ${totalIncome.toLocaleString()}`;
      document.getElementById('collectionTabMonth').textContent = `৳ ${monthIncome.toLocaleString()} this month`;
    } catch (err) {
      console.error('Error updating collection tab offline:', err);
    }
  },

  async calculateTotalFund() {
    let data = [];
    const { data: freshData, error } = await db.from('fund').select('type, amount, is_calculation');

    if (error || !freshData) {
      // Use cached data if network fails
      const cached = localStorage.getItem('allFundData');
      data = cached ? JSON.parse(cached) : [];
    } else {
      data = freshData;
      // Save to cache
      localStorage.setItem('allFundData', JSON.stringify(freshData));
      App.state.allFundData = freshData;
    }

    const total = data.reduce((acc, entry) => {
      if (entry.type === 'income') return acc + entry.amount;
      // Only subtract expenses where is_calculation is true (NULL/false in DB)
      if (entry.type === 'expense' && !entry.is_calculation) return acc - entry.amount;
      return acc;
    }, 0);

    App.state.totalFund = total;
    App.elements.totalFundDisplay.textContent = `৳ ${total.toLocaleString()}`;

    // Save total to cache
    localStorage.setItem('totalFund', total.toString());
  },

  async loadAllSadakah() {
    // Try to use pre-calculated cache first
    try {
      const cachedExpenses = JSON.parse(localStorage.getItem('allSadakahCache') || '[]');

      if (cachedExpenses.length > 0) {
        this.renderAllSadakahList(cachedExpenses);
        const totalAmount = cachedExpenses.reduce((sum, item) => sum + item.amount, 0);
        const totalCount = cachedExpenses.length;
        document.getElementById('sadakahTabTotal').textContent = `৳ ${totalAmount.toLocaleString()}`;
        document.getElementById('sadakahTabCount').textContent = `${totalCount} entries`;
        return;
      }
    } catch (err) {
      console.error('Error loading cached sadakah:', err);
    }

    // Fallback to calculating from allFundData
    const allCached = App.state.allFundData.length > 0
      ? App.state.allFundData
      : JSON.parse(localStorage.getItem('allFundData') || '[]');

    // Filter by isDisplay: show only entries where is_display is NULL or false (inverse logic)
    const cachedExpenses = allCached.filter(d => d.type === 'expense' && !d.is_display)
      .sort((a, b) => {
        if (b.month !== a.month) return b.month.localeCompare(a.month);
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

    if (cachedExpenses.length > 0) {
      this.renderAllSadakahList(cachedExpenses);
      // Total of all isDisplay sadakahs (regardless of isCalculation)
      const displayTotal = cachedExpenses.reduce((sum, item) => sum + item.amount, 0);

      // Total of all isCalculation sadakahs (must fetch from full dataset)
      const allCachedData = App.state.allFundData.length > 0
        ? App.state.allFundData
        : JSON.parse(localStorage.getItem('allFundData') || '[]');
      const calculationExpenses = allCachedData.filter(d => d.type === 'expense' && !d.is_calculation);
      const calculationTotal = calculationExpenses.reduce((sum, item) => sum + item.amount, 0);

      const isBn = localStorage.getItem('lang') === 'bn';
      document.getElementById('sadakahTabTotal').textContent = `৳ ${displayTotal.toLocaleString()}`;
      document.getElementById('sadakahTabCount').textContent = isBn
        ? `৳ ${calculationTotal.toLocaleString()} ফান্ড থেকে`
        : `৳ ${calculationTotal.toLocaleString()} from fund`;
    } else {
      const isBn = localStorage.getItem('lang') === 'bn';
      App.elements.allSadakahList.innerHTML = `<div class="text-gray-400 text-center py-8">${isBn ? 'কোনো সাদাকাহ নেই' : 'No sadakah entries'}</div>`;
      document.getElementById('sadakahTabTotal').textContent = `৳ 0`;
      document.getElementById('sadakahTabCount').textContent = `0 entries`;
    }
  },

  renderAllSadakahList(sadakahList) {
    if (sadakahList.length === 0) {
      const isBn = localStorage.getItem('lang') === 'bn';
      App.elements.allSadakahList.innerHTML = `<div class="text-gray-400 text-center py-8">${isBn ? 'কোনো সাদাকাহ নেই' : 'No sadakah entries'}</div>`;
      return;
    }

    App.elements.allSadakahList.innerHTML = sadakahList.map(item => {
      // Use the month field instead of timestamp for display
      const [year, month] = item.month.split('-');
      const date = new Date(year, parseInt(month) - 1, 1);
      const monthName = date.toLocaleString('default', { month: 'long' });

      // Process additional info: preserve line breaks and make links clickable
      let additionalInfo = '';
      if (item.additional_info) {
        let processedText = item.additional_info
          .replace(/\n/g, '<br>')
          .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-blue-600 underline hover:text-blue-800">$1</a>');
        additionalInfo = `<div class="text-sm text-gray-600 mt-1">${processedText}</div>`;
      }

      return `
        <div class="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-300">
          <div class="flex justify-between items-start mb-1">
            <span class="font-semibold text-gray-800">${item.description || 'Unnamed'}</span>
            <span class="font-bold text-blue-700">৳ ${item.amount.toLocaleString()}</span>
          </div>
          <div class="text-xs text-gray-500">${monthName} ${year}</div>
          ${additionalInfo}
        </div>
      `;
    }).join('');
  },

  async loadFundData() {

    // Cancel any previous ongoing load
    if (App.state.isLoading.fund) {
    }
    App.state.isLoading.fund = true;

    // Store the month we're loading for - to handle race conditions
    const loadingForMonth = App.state.currentMonth.toISOString();

    App.renderLoader('fund');
    App.updateMonthDisplay();

    const monthKey = `${App.state.currentMonth.getFullYear()}-${String(App.state.currentMonth.getMonth() + 1).padStart(2, '0')}`;

    // Load from cache first (for immediate display)
    const allCached = JSON.parse(localStorage.getItem('allFundData') || '[]');
    const monthlyCache = JSON.parse(localStorage.getItem('cachedMonthlyData') || '{}');

    App.state.allFundData = allCached;
    App.state.cachedMonthlyData = monthlyCache;

    // Check if we're still on the same month before rendering
    if (loadingForMonth !== App.state.currentMonth.toISOString()) {
      App.state.isLoading.fund = false;
      return;
    }

    // Render cached data immediately
    const cachedMonthData = monthlyCache[monthKey] || allCached.filter(d => d.month === monthKey);
    if (cachedMonthData.length > 0) {
      this.renderFundData(cachedMonthData);
      await this.calculateNetWorth();
    }

    // Update collection tab total for non-admin (works offline with cache)
    if (!App.state.isAdmin) {
      this.updateCollectionTabTotalOffline();
    }

    // Then try to fetch fresh data in background
    try {
      const { data: allData, error: allError } = await db.from('fund').select('*').order('month', { ascending: true }).order('timestamp', { ascending: true });
      if (!allError && allData) {
        localStorage.setItem('allFundData', JSON.stringify(allData));
        App.state.allFundData = allData;

        // Cache monthly aggregated data
        const monthlyCache = {};
        allData.forEach(entry => {
          if (!monthlyCache[entry.month]) {
            monthlyCache[entry.month] = [];
          }
          monthlyCache[entry.month].push(entry);
        });
        localStorage.setItem('cachedMonthlyData', JSON.stringify(monthlyCache));
        App.state.cachedMonthlyData = monthlyCache;

        // Check again if we're still on the same month
        if (loadingForMonth !== App.state.currentMonth.toISOString()) {
          App.state.isLoading.fund = false;
          return;
        }

        // Get current month data and re-render with fresh data
        const monthData = allData.filter(d => d.month === monthKey);
        this.renderFundData(monthData);
        await this.calculateNetWorth();

        // Update collection tab with fresh data
        if (!App.state.isAdmin) {
          this.updateCollectionTabTotal();
        }
      }
    } catch (err) {
      // Already rendered cached data above, so just continue
    }

    App.state.isLoading.fund = false;
  },

  renderFundData(data) {
    const income = data.filter(d => d.type === 'income');
    const expense = data.filter(d => d.type === 'expense');

    // For admin: show all expenses
    // For non-admin (Collection tab): only show expenses with isCalculation=true (NULL/false in DB)
    const expenseToShow = App.state.isAdmin ? expense : expense.filter(e => !e.is_calculation);

    this.renderFundList(income, App.elements.incomeList, 'green');
    this.renderFundList(expenseToShow, App.elements.expenseList, 'red');
    this.updateFundTotals(income, expenseToShow);
  },

  renderFundList(items, element, color) {
    if (items.length === 0) {
      const isBn = localStorage.getItem('lang') === 'bn';
      const noEntriesText = color === 'green'
        ? (isBn ? 'কোনো এন্ট্রি নেই' : 'No collection entries')
        : (isBn ? 'কোনো এন্ট্রি নেই' : 'No sadakah entries');
      element.innerHTML = `<div class="text-gray-400 text-center py-4">${noEntriesText}</div>`;
      return;
    }

    element.innerHTML = items.map((item, index) => {
      const textColor = item.highlighted ? 'text-red-600' : 'text-gray-800';

      // Determine background color for expenses based on display/calculation flags
      let bgClass = `bg-${color}-50`;
      let opacity = '';

      if (color === 'red' && item.type === 'expense') {
        const isDisplay = !item.is_display; // NULL/false in DB = true (displayed)
        const isCalculation = !item.is_calculation; // NULL/false in DB = true (calculated)

        if (isDisplay && isCalculation) {
          // Both: normal (as it is)
          bgClass = 'bg-red-50';
        } else if (isDisplay && !isCalculation) {
          // Only display: more transparent
          bgClass = 'bg-red-50';
          opacity = 'opacity-50';
        } else if (!isDisplay && isCalculation) {
          // Only calculation: darker
          bgClass = 'bg-red-200';
        } else {
          // Neither: gray
          bgClass = 'bg-gray-200';
        }
      }

      // Convert to Bangladesh time (UTC+6)
      const bdTime = new Date(new Date(item.timestamp).getTime() + (6 * 60 * 60 * 1000));
      const formattedTime = bdTime.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      // Alternating background colors (very subtle)
      const rowBg = index % 2 === 0 ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)';

      return `
        <div class="${bgClass} ${opacity} p-1.5 rounded-lg text-sm relative group" title="${formattedTime}" style="background-image: linear-gradient(${rowBg}, ${rowBg});">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <span class="font-semibold text-gray-600">${index + 1}.</span>
              <span class="ml-2 ${textColor}">${item.name || item.description}</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="font-bold text-${color}-700">৳ ${item.amount}</div>
              ${App.state.isAdmin ? `
                <button data-edit-fund="${item.id}" data-fund-type="${item.type}" class="ml-1 text-blue-500 hover:text-blue-700" style="width: 20px; height: 20px;"><img src="svgs/icon-edit.svg" style="width: 16px; height: 16px;"></button>
                <button data-delete-fund="${item.id}" class="text-red-500 hover:text-red-700" style="width: 20px; height: 20px;"><img src="svgs/icon-delete.svg" style="width: 16px; height: 16px;"></button>
              ` : ''}
            </div>
          </div>
          <div class="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">${formattedTime}</div>
        </div>
      `;
    }).join('');
  },

  updateFundTotals(income, expense) {
    const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);

    // For admin: only sum expenses that have is_calculation = true (NULL/false in DB)
    // For non-admin: expense is already filtered by renderFundData
    const totalExpense = App.state.isAdmin
      ? expense.filter(e => !e.is_calculation).reduce((sum, item) => sum + item.amount, 0)
      : expense.reduce((sum, item) => sum + item.amount, 0);

    const balance = totalIncome - totalExpense;

    App.elements.totalIncome.textContent = `৳ ${totalIncome}`;
    App.elements.totalExpense.textContent = `৳ ${totalExpense}`;
    App.elements.monthlyBalance.textContent = `৳ ${balance}`;
    App.elements.monthlyBalance.style.color = balance >= 0 ? 'var(--brand-green-dark)' : '#dc2626';
  },

  async calculateNetWorth() {
    const currentMonthKey = `${App.state.currentMonth.getFullYear()}-${String(App.state.currentMonth.getMonth() + 1).padStart(2, '0')}`;

    let data = [];

    try {
      // Try to get fresh data
      const { data: freshData, error } = await db.from('fund').select('type, amount, month, is_calculation').lte('month', currentMonthKey);

      if (!error && freshData) {
        data = freshData;
      } else {
        throw new Error('Network error');
      }
    } catch (err) {
      // Use cached data
      const allCached = App.state.allFundData.length > 0
        ? App.state.allFundData
        : JSON.parse(localStorage.getItem('allFundData') || '[]');

      data = allCached.filter(entry => entry.month <= currentMonthKey);
    }

    const netWorth = data.reduce((acc, entry) => {
      if (entry.type === 'income') return acc + entry.amount;
      // Only subtract expenses where is_calculation is true (NULL/false in DB)
      if (entry.type === 'expense' && !entry.is_calculation) return acc - entry.amount;
      return acc;
    }, 0);

    const netWorthElement = document.getElementById('netWorth');
    if (netWorthElement) {
      netWorthElement.textContent = `৳ ${netWorth.toLocaleString()}`;
      netWorthElement.style.color = netWorth >= 0 ? '#2563eb' : '#dc2626';
    }
  },

  async loadYearlyChartData() {
    const year = App.state.currentYear;

    // Try to use pre-calculated cache first
    try {
      const yearlyCache = JSON.parse(localStorage.getItem('yearlyOverviewCache') || '{}');
      if (yearlyCache[year]) {
        const { monthlyIncome, monthlyExpense, monthlyBalance } = yearlyCache[year];
        this.renderYearlyChart(monthlyIncome, monthlyExpense, monthlyBalance);
        return;
      }
    } catch (err) {
      console.error('Error loading cached yearly overview:', err);
    }

    // Fallback to calculating from allFundData
    let data = [];
    const allCached = App.state.allFundData.length > 0
      ? App.state.allFundData
      : JSON.parse(localStorage.getItem('allFundData') || '[]');

    data = allCached.filter(entry => {
      const entryYear = parseInt(entry.month.split('-')[0]);
      return entryYear === year;
    });

    if (!data || data.length === 0) {
      const canvas = App.elements.yearlyChart;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#6b7280';
        ctx.font = '20px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No data available for this year', canvas.width / 2, canvas.height / 2);
      }
      return;
    }

    // Initialize arrays for 12 months
    const monthlyIncome = new Array(12).fill(0);
    const monthlyExpense = new Array(12).fill(0);
    const monthlyBalance = new Array(12).fill(0);

    // Aggregate data by month (only isCalculation=true expenses)
    data.forEach(entry => {
      const monthIndex = parseInt(entry.month.split('-')[1]) - 1;
      if (entry.type === 'income') {
        monthlyIncome[monthIndex] += entry.amount;
      } else if (entry.type === 'expense' && !entry.is_calculation) {
        monthlyExpense[monthIndex] += entry.amount;
      }
    });

    // Calculate cumulative balance
    let cumulativeBalance = 0;

    // Get balance from previous years (only isCalculation=true expenses)
    const { data: previousData } = await db.from('fund').select('type, amount, is_calculation').lt('month', `${year}-01`);
    if (previousData) {
      cumulativeBalance = previousData.reduce((acc, entry) => {
        if (entry.type === 'income') return acc + entry.amount;
        // Only subtract expenses where is_calculation is true (NULL/false in DB)
        if (entry.type === 'expense' && !entry.is_calculation) return acc - entry.amount;
        return acc;
      }, 0);
    }

    for (let i = 0; i < 12; i++) {
      cumulativeBalance += monthlyIncome[i] - monthlyExpense[i];
      monthlyBalance[i] = cumulativeBalance;
    }

    this.renderYearlyChart(monthlyIncome, monthlyExpense, monthlyBalance);
  },

  renderYearlyChart(income, expense, balance) {
    const canvas = App.elements.yearlyChart;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Store data for hover detection
    App.chartData = { income, expense, balance };
    const width = canvas.width;
    const height = canvas.height;
    const padding = 80;
    const rightPadding = 50;
    const chartWidth = width - padding - rightPadding;
    const chartHeight = height - padding - 50;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Find max value for scaling
    const actualMaxValue = Math.max(...income, ...expense, ...balance.map(Math.abs));
    const actualMinValue = Math.min(0, ...balance);
    const maxValue = actualMaxValue * 1.1;
    const minValue = actualMinValue * 1.1;
    const range = maxValue - minValue;

    // Helper function to get Y coordinate
    const getY = (value) => {
      return padding + chartHeight - ((value - minValue) / range) * chartHeight;
    };

    // Helper function to get X coordinate
    const getX = (index) => {
      return padding + (index / 11) * chartWidth;
    };

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }

    // Draw zero line if balance goes negative
    if (minValue < 0) {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const zeroY = getY(0);
      ctx.moveTo(padding, zeroY);
      ctx.lineTo(padding + chartWidth, zeroY);
      ctx.stroke();
    }

    // Draw lines
    const drawLine = (data, color, lineWidth = 2) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      data.forEach((value, i) => {
        const x = getX(i);
        const y = getY(value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw points
      ctx.fillStyle = color;
      data.forEach((value, i) => {
        const x = getX(i);
        const y = getY(value);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    drawLine(income, '#10b981', 3); // Green
    drawLine(expense, '#ef4444', 3); // Red
    drawLine(balance, '#3b82f6', 3); // Blue

    // Draw month labels
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((month, i) => {
      const x = padding + (i / 11) * chartWidth;
      ctx.fillText(month, x, height - 50 + 20);
    });

    ctx.textAlign = 'right';
    ctx.font = 'bold 18px system-ui';
    for (let i = 0; i <= 5; i++) {
      const value = minValue + (range * i / 5);
      const y = padding + chartHeight - (i / 5) * chartHeight;
      ctx.fillText(Math.round(value).toLocaleString(), padding - 10, y + 4);
    }

    // Add click functionality to show values
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Scale coordinates
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const scaledX = mouseX * scaleX;
      const scaledY = mouseY * scaleY;

      let clickedPoint = null;
      let minDistance = 40; // pixels - larger hitbox for clicks

      // Check all points
      [income, expense, balance].forEach((data, dataIndex) => {
        data.forEach((value, i) => {
          const x = getX(i);
          const y = getY(value);
          const distance = Math.sqrt(Math.pow(scaledX - x, 2) + Math.pow(scaledY - y, 2));

          if (distance < minDistance) {
            minDistance = distance;
            const labels = ['Collection', 'Sadakah', 'Total Fund'];
            const isBn = localStorage.getItem('lang') === 'bn';
            const labelsBn = ['কালেকশন', 'সাদাকাহ', 'ফান্ডে মোট অর্থ'];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            clickedPoint = {
              x, y, value,
              label: isBn ? labelsBn[dataIndex] : labels[dataIndex],
              month: months[i]
            };
          }
        });
      });

      // Store clicked point
      canvas.clickedPoint = clickedPoint;

      // Redraw chart with clicked point highlighted
      this.renderYearlyChart(income, expense, balance);

      if (clickedPoint) {
        // Draw highlight circle at clicked point
        ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(clickedPoint.x, clickedPoint.y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.beginPath();
        ctx.arc(clickedPoint.x, clickedPoint.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Draw tooltip
        const tooltipText = `${clickedPoint.month}: ৳ ${Math.round(clickedPoint.value).toLocaleString()}`;
        const tooltipWidth = ctx.measureText(tooltipText).width + 20;
        const tooltipHeight = 30;
        let tooltipX = clickedPoint.x - tooltipWidth / 2;
        let tooltipY = clickedPoint.y - 40;

        // Keep tooltip inside canvas
        if (tooltipX < 10) tooltipX = 10;
        if (tooltipX + tooltipWidth > width - 10) tooltipX = width - tooltipWidth - 10;
        if (tooltipY < 10) tooltipY = clickedPoint.y + 20;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + 20);

        ctx.fillStyle = '#10b981';
        ctx.font = '12px system-ui';
        ctx.fillText(clickedPoint.label, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight + 15);
      }
    };

    // Remove old listeners if exist
    const oldClick = canvas.clickHandler;
    if (oldClick) canvas.removeEventListener('click', oldClick);

    // Add new listener
    canvas.clickHandler = handleClick;
    canvas.addEventListener('click', handleClick);
    canvas.style.cursor = 'pointer';
  },

  changeYear(delta) {
    App.state.currentYear += delta;
    // Don't go before 2017 or beyond current year
    if (App.state.currentYear < 2017) App.state.currentYear = 2017;
    if (App.state.currentYear > new Date().getFullYear()) App.state.currentYear = new Date().getFullYear();

    App.elements.currentYearDisplay.textContent = App.state.currentYear;
    this.loadYearlyChartData();
  },

  async updateFundEntry(id, details) {
    const { error } = await db.from('fund').update(details).eq('id', parseInt(id));

    if (error) {
      App.showNotification(error.message, true);
    } else {
      App.showNotification('Entry updated successfully.');
      App.hideAllModals();
      this.loadFundData();
      this.calculateTotalFund();
    }
  },

  async editFundEntry(id, type) {
    const { data, error } = await db.from('fund').select('*').eq('id', parseInt(id)).single();
    if (error) return App.showNotification(error.message, true);

    const isBn = localStorage.getItem('lang') === 'bn';

    if (type === 'income') {
      document.getElementById('incomeId').value = id;
      document.getElementById('incomeName').value = data.name || '';
      document.getElementById('incomeAmount').value = data.amount || '';
      document.getElementById('incomeHighlighted').checked = data.highlighted || false;

      // Update modal title
      const modalTitle = document.querySelector('#addIncomeModal h2');
      modalTitle.textContent = isBn ? 'কালেকশন এডিট করুন' : 'Edit Collection';

      // Update submit button
      const submitBtn = document.querySelector('#addIncomeForm button[type="submit"]');
      submitBtn.textContent = isBn ? 'আপডেট করুন' : 'Update';

      App.showModal('addIncomeModal');
    } else if (type === 'expense') {
      document.getElementById('expenseId').value = id;
      document.getElementById('expenseDesc').value = data.description || '';
      document.getElementById('expenseAmount').value = data.amount || '';
      document.getElementById('expenseAdditionalInfo').value = data.additional_info || '';
      document.getElementById('expenseHighlighted').checked = data.highlighted || false;

      // Inverse logic: NULL/false in DB = checked (true) in UI
      document.getElementById('expenseDisplay').checked = !data.is_display;
      document.getElementById('expenseCalculation').checked = !data.is_calculation;

      // Show advanced options if any non-default values
      if (data.highlighted || data.is_display || data.is_calculation) {
        document.getElementById('advancedOptions').classList.remove('hide');
        document.getElementById('advancedArrow').textContent = '▲';
      }

      const modalTitle = document.querySelector('#addExpenseModal h2');
      modalTitle.textContent = isBn ? 'সাদাকাহ এডিট করুন' : 'Edit Sadakah';

      const submitBtn = document.querySelector('#addExpenseForm button[type="submit"]');
      submitBtn.textContent = isBn ? 'আপডেট করুন' : 'Update';

      App.showModal('addExpenseModal');
    }
  },

  async addFundEntry(type, details) {
    const monthKey = `${App.state.currentMonth.getFullYear()}-${String(App.state.currentMonth.getMonth() + 1).padStart(2, '0')}`;

    // Clean up the details object - remove null/undefined values
    const cleanDetails = {};
    for (const key in details) {
      if (details[key] !== null && details[key] !== undefined && details[key] !== '') {
        cleanDetails[key] = details[key];
      }
    }

    const { error } = await db.from('fund').insert({
      ...cleanDetails,
      month: monthKey,
      type: type,
      updated_by: App.state.currentUser.id,
    });

    if (error) {
      App.showNotification(error.message, true);
    } else {
      App.showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} added successfully.`);
      App.hideAllModals();
      this.loadFundData();
      this.calculateTotalFund();
    }
  },

  async deleteFundEntry(id) {
    if (!App.state.isAdmin || !confirm('Are you sure you want to delete this entry?')) return;
    const { error } = await db.from('fund').delete().eq('id', id);
    if (error) {
      App.showNotification(error.message, true);
    } else {
      App.showNotification('Entry deleted.');
      this.loadFundData();
      this.calculateTotalFund();
    }
  },

  changeMonth(delta, skipAnimation = false) {

    // Create new date object to avoid mutation issues
    const newMonth = new Date(App.state.currentMonth.getFullYear(), App.state.currentMonth.getMonth() + delta, 1);

    // Check boundaries
    const minDate = new Date(2017, 5, 1);
    const now = new Date();
    const maxDate = new Date(now.getFullYear(), now.getMonth(), 1);

    let shouldLoadData = true;

    // Prevent going before June 2017
    if (newMonth < minDate) {
      App.showNotification('Cannot go before June 2017', true);
      return; // Just return without doing anything
    }

    // Prevent going beyond current month
    if (newMonth > maxDate) {
      App.showNotification('Cannot go beyond current month', true);
      return; // Just return without doing anything
    }

    // If we got here, the month change is valid
    App.state.currentMonth = newMonth;

    // STEP 1: Update the month name text
    App.updateMonthDisplay();

    // STEP 2: Animate the content sliding if not skipped
    if (!skipAnimation) {
      this.animateMonthChange(delta);
    } else {
      // If animation skipped, load data immediately
      this.loadFundData();
      return;
    }

    // STEP 3: Cancel any pending data load
    if (this.loadFundDataTimeout) {
      clearTimeout(this.loadFundDataTimeout);
    }

    // STEP 4: Schedule new data load to start slightly before animation completes
    this.loadFundDataTimeout = setTimeout(() => {
      this.loadFundData();
    }, 250);
  },

  animateMonthChange(direction) {

    const container = document.getElementById('collectionView');
    if (!container) {
      return;
    }

    let slider = container.querySelector('.month-slider');

    // If slider doesn't exist, create it now (for button navigation)
    if (!slider) {
      slider = document.createElement('div');
      slider.className = 'month-slider';

      const content = document.createElement('div');
      content.className = 'month-content';

      // Move all children into content
      while (container.firstChild) {
        content.appendChild(container.firstChild);
      }

      slider.appendChild(content);
      container.appendChild(slider);
    }

    const currentContent = slider.querySelector('.month-content');
    if (!currentContent) {
      return;
    }

    // STEP 1: Clone the CURRENT (old) content to slide out
    const clone = currentContent.cloneNode(true);
    clone.classList.add('month-content-clone');
    clone.style.position = 'absolute';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.width = '100%';
    clone.style.transform = 'translateX(0)';
    clone.style.transition = 'none';
    clone.style.zIndex = '2'; // Clone on top

    // STEP 2: Add clone to slider
    slider.appendChild(clone);

    // STEP 3: Keep current content in place but hide it visually
    currentContent.style.position = 'relative';
    currentContent.style.zIndex = '1'; // Below clone
    currentContent.style.opacity = '0'; // Hide but keep structure

    // STEP 4: Start animation immediately
    const slideDirection = direction > 0 ? 100 : -100;

    // Force reflow
    slider.offsetHeight;

    requestAnimationFrame(() => {

      clone.style.transition = 'transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1)';
      clone.style.transform = `translateX(${-slideDirection}%)`;
    });

    // STEP 5: Clean up after animation
    setTimeout(() => {

      // Remove the clone
      if (slider.contains(clone)) {
        slider.removeChild(clone);
      }

      // Show the content (which should now have new data)
      currentContent.style.opacity = '1';
      currentContent.style.position = '';
      currentContent.style.zIndex = '';
    }, 300);
  },

  updateFundTabView() {
    if (App.state.isAdmin) return; // Admin sees everything always

    const isCollection = App.state.activeFundTab === 'collection';

    App.elements.collectionView.classList.toggle('hide', !isCollection);
    App.elements.sadakahListView.classList.toggle('hide', isCollection);

    // Show/hide month navigation based on active tab
    const monthNav = document.getElementById('monthNavigation');
    if (monthNav) {
      monthNav.classList.toggle('hide', !isCollection);
    }

    // Update active tab styling
    document.getElementById('collectionTabBtn').classList.toggle('bg-emerald-100', isCollection);
    document.getElementById('collectionTabBtn').classList.toggle('border-2', isCollection);
    document.getElementById('collectionTabBtn').classList.toggle('border-emerald-500', isCollection);

    document.getElementById('sadakahTabBtn').classList.toggle('bg-emerald-100', !isCollection);
    document.getElementById('sadakahTabBtn').classList.toggle('border-2', !isCollection);
    document.getElementById('sadakahTabBtn').classList.toggle('border-emerald-500', !isCollection);

    // Load sadakah list if switching to that tab
    if (!isCollection) {
      this.loadAllSadakah();
    }
  },

  async copyIncomeList() {
    const monthKey = `${App.state.currentMonth.getFullYear()}-${String(App.state.currentMonth.getMonth() + 1).padStart(2, '0')}`;
    const { data, error } = await db.from('fund').select('*').eq('month', monthKey).eq('type', 'income').order('timestamp', { ascending: true });

    if (error || !data || data.length === 0) {
      return App.showNotification('No collection data to copy', true);
    }

    // Get current date in Bangladesh time (UTC+6)
    const now = new Date();
    const bdTime = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    const monthName = bdTime.toLocaleString('en-US', { month: 'long' });
    const date = bdTime.getDate();

    const dateHeader = `আজ ${monthName} এর ${date} তারিখ:\n\n`;
    const collectionList = data.map((item, index) => `${index + 1}. ${item.name}- ${item.amount} tk`).join('\n');

    let text = dateHeader + collectionList;

    // Only add admin suffix if user is admin
    if (App.state.isAdmin) {
      text += '\n\nঅনেক ভাইরা বাকি, আমরা আল্লাহর জন্য নিয়াত করি দেওয়ার ভাইরা। এই কাজ গুলোতো আপনাদের সদাকার মাধ্যমে হচ্ছে আল্লাহর তৌফিকে। \n+880 1937-222273 - nogod \n+880 1515-214867 - bkash\n\nআমাদের ফান্ডের ওয়েবসাইট লিংকঃ eshoobodanrakhi.web.app';
    } else {
      text += '';
    }

    try {
      await navigator.clipboard.writeText(text);
      App.showNotification('Collection list copied to clipboard!');
    } catch (err) {
      App.showNotification('Failed to copy to clipboard', true);
    }
  },

  calculateCompleteHistory(data) {
    const monthlyData = {};
    data.forEach(entry => {
      if (!monthlyData[entry.month]) {
        monthlyData[entry.month] = { income: 0, expenses: [] };
      }
      if (entry.type === 'income') {
        monthlyData[entry.month].income += entry.amount;
      } else if (entry.type === 'expense' && !entry.is_calculation) {
        // Only include expenses where is_calculation is true (NULL/false in DB)
        monthlyData[entry.month].expenses.push(entry);
      }
    });
    return monthlyData;
  },

  async showCompleteHistory() {
    App.showModal('completeHistoryModal');
    const content = document.getElementById('completeHistoryContent');
    const modeToggle = document.getElementById('historyModeToggle');
    const isBn = localStorage.getItem('lang') === 'bn';
    let isYearlyBrief = true;
    modeToggle.textContent = isBn ? 'সংক্ষিপ্ত' : 'Yearly Brief';
    content.innerHTML = '<div class="loader"></div>';

    // Try to use pre-calculated cache first
    let monthlyData = null;
    try {
      monthlyData = JSON.parse(localStorage.getItem('completeHistoryCache') || 'null');
      if (monthlyData) {
      }
    } catch (err) {
      console.error('Error loading cached history:', err);
    }

    // Fallback to calculating from allFundData
    if (!monthlyData) {
      const data = App.state.allFundData.length > 0
        ? App.state.allFundData
        : JSON.parse(localStorage.getItem('allFundData') || '[]');

      if (!data || data.length === 0) {
        content.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 2rem;">কোনো তথ্য নেই</div>';
        return;
      }

      monthlyData = this.calculateCompleteHistory(data);
    }

    modeToggle.addEventListener('click', () => {
      isYearlyBrief = !isYearlyBrief;
      const isBn = localStorage.getItem('lang') === 'bn';
      if (isYearlyBrief) {
        modeToggle.textContent = isBn ? 'সংক্ষিপ্ত' : 'Yearly Brief';
        modeToggle.classList.remove('bg-gray-600');
        modeToggle.classList.add('bg-blue-600');
      } else {
        modeToggle.textContent = isBn ? 'বিস্তারিত' : 'Elaborate';
        modeToggle.classList.remove('bg-blue-600');
        modeToggle.classList.add('bg-gray-600');
      }
      renderHistory(isYearlyBrief);
    });

    const renderHistory = (isYearlyBrief) => {
      // monthlyData is already available from cache or calculated above

      // Build the history HTML
      let html = '';
      let runningBalance = 0;
      const months = Object.keys(monthlyData).sort();
      const currentYear = new Date().getFullYear();

      if (isYearlyBrief) {
        // Calculate previous year's balance
        const previousYearMonths = months.filter(m => parseInt(m.split('-')[0]) < currentYear);
        previousYearMonths.forEach(month => {
          const monthData = monthlyData[month];
          runningBalance += monthData.income;
          // expenses are already filtered by calculateCompleteHistory
          monthData.expenses.forEach(expense => {
            runningBalance -= expense.amount;
          });
        });

        if (previousYearMonths.length > 0) {
          const lastYear = currentYear - 1;
          html += `<div class="font-bold text-purple-700 mb-4">${lastYear} সালের শেষে অবশিষ্ট টাকা: ৳ ${runningBalance.toLocaleString()}</div>`;
        }

        html += `<div class="font-bold text-gray-800 mb-3">${currentYear} সাল:</div>`;

        // Show only current year
        const currentYearMonths = months.filter(m => parseInt(m.split('-')[0]) === currentYear);
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        currentYearMonths.forEach(month => {
          const monthData = monthlyData[month];
          const date = new Date(month + '-01');
          const monthName = date.toLocaleString('default', { month: 'long' });
          const isCurrentMonth = month === currentMonthKey;

          // For current month, show day + month
          if (isCurrentMonth) {
            const today = now.getDate();
            const monthNameBn = date.toLocaleString('default', { month: 'long' });
            html += `<div class="font-bold text-gray-700 mt-3 mb-1">${today} ${monthNameBn} পর্যন্ত:</div>`;
          } else {
            html += `<div class="font-bold text-gray-700 mt-3 mb-1">${monthName}:</div>`;
          }

          // For current month, show expenses first, then income
          if (isCurrentMonth) {
            if (monthData.expenses.length > 0) {
              monthData.expenses.filter(e => !e.is_calculation).forEach(expense => {
                runningBalance -= expense.amount;
                html += `<div class="text-red-600 ml-2">সাদাকাহ (${expense.description}): ${expense.amount.toLocaleString()} টাকা</div>`;
              });
              html += `<div class="text-blue-600 ml-2 font-semibold">মোট অবশিষ্ট থাকে: ${runningBalance.toLocaleString()} টাকা</div>`;
            }

            if (monthData.income > 0) {
              runningBalance += monthData.income;
              html += `<div class="text-green-700 ml-2">মোট কালেকশন: ${monthData.income.toLocaleString()} টাকা</div>`;
              html += `<div class="text-blue-600 ml-2 font-semibold">এখন ফান্ডে আছে: ${runningBalance.toLocaleString()} টাকা</div>`;
            }
          } else {
            // For other months, show income first, then expenses (normal order)
            if (monthData.income > 0) {
              runningBalance += monthData.income;
              html += `<div class="text-green-700 ml-2">মোট কালেকশন: ${monthData.income.toLocaleString()} টাকা</div>`;
              html += `<div class="text-blue-600 ml-2 font-semibold">ফান্ডে মোট হয়: ${runningBalance.toLocaleString()} টাকা</div>`;
            }

            if (monthData.expenses.length > 0) {
              monthData.expenses.filter(e => !e.is_calculation).forEach(expense => {
                runningBalance -= expense.amount;
                html += `<div class="text-red-600 ml-2">সাদাকাহ (${expense.description}): ${expense.amount.toLocaleString()} টাকা</div>`;
              });
              html += `<div class="text-blue-600 ml-2 font-semibold">মোট অবশিষ্ট থাকে: ${runningBalance.toLocaleString()} টাকা</div>`;
            }
          }
        });
      } else {
        // Elaborated mode - show all history
        html += `<div class="font-bold text-gray-800 mb-3">সম্পূর্ণ তথ্য:</div>`;

        months.forEach(month => {
          const monthData = monthlyData[month];
          const date = new Date(month + '-01');
          const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });

          html += `<div class="font-bold text-gray-700 mt-3 mb-1">${monthName}:</div>`;

          if (monthData.income > 0) {
            runningBalance += monthData.income;
            html += `<div class="text-green-700 ml-2">মোট কালেকশন: ${monthData.income.toLocaleString()} টাকা</div>`;
            html += `<div class="text-blue-600 ml-2 font-semibold">ফান্ডে মোট হয়: ${runningBalance.toLocaleString()} টাকা</div>`;
          }

          if (monthData.expenses.length > 0) {
            monthData.expenses.filter(e => !e.is_calculation).forEach(expense => {
              runningBalance -= expense.amount;
              html += `<div class="text-red-600 ml-2">সাদাকাহ (${expense.description}): ${expense.amount.toLocaleString()} টাকা</div>`;
            });
            html += `<div class="text-blue-600 ml-2 font-semibold">মোট অবশিষ্ট থাকে: ${runningBalance.toLocaleString()} টাকা</div>`;
          }
        });
      }

      content.innerHTML = html || '<div class="text-gray-400">কোনো তথ্য নেই</div>';
    };

    // Initial render (yearly brief by default)
    renderHistory(isYearlyBrief);
  },

  // Add swipe gesture support
  swipeHandler: {
    startX: 0,
    startY: 0,
    currentX: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    isDragging: false,
    container: null,
    content: null,
    previewClone: null,
    swipeDirection: 0,
    baseOffset: 0,
    // Tuned parameters
    SNAP_VELOCITY: 0.35,
    SNAP_DISTANCE_RATIO: 0.28,
    EDGE_RESISTANCE: 0.25,
    SETTLE_DURATION: 480,

    init() {
      const container = document.getElementById('collectionView');
      if (!container) return;

      this.container = container;

      // Wrap content in slider if not already wrapped
      if (!container.querySelector('.month-slider')) {
        const slider = document.createElement('div');
        slider.className = 'month-slider';

        const content = document.createElement('div');
        content.className = 'month-content';

        // Move all children into content
        while (container.firstChild) {
          content.appendChild(container.firstChild);
        }

        slider.appendChild(content);
        container.appendChild(slider);
      }

      this.content = container.querySelector('.month-content');
      const slider = container.querySelector('.month-slider');

      // Touch events
      slider.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
      slider.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
      slider.addEventListener('touchend', this.handleEnd.bind(this), { passive: false });
      slider.addEventListener('touchcancel', this.handleEnd.bind(this), { passive: false });

      // Mouse events (for testing on desktop)
      slider.addEventListener('mousedown', this.handleStart.bind(this));
      slider.addEventListener('mousemove', this.handleMove.bind(this));
      slider.addEventListener('mouseup', this.handleEnd.bind(this));
      slider.addEventListener('mouseleave', this.handleEnd.bind(this));
    },

    computeVelocity(nowX, nowTime) {
      const dx = nowX - this.lastX;
      const dt = nowTime - this.lastTime;
      if (dt <= 0) return this.velocity;
      const inst = dx / dt;
      this.velocity = this.velocity * 0.25 + inst * 0.75;
      this.lastX = nowX;
      this.lastTime = nowTime;
      return this.velocity;
    },

    async handleStart(e) {
      const touch = e.touches ? e.touches[0] : e;
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.currentX = 0;
      this.lastX = touch.clientX;
      this.lastTime = performance.now();
      this.velocity = 0;
      this.isDragging = true;
      this.swipeDirection = 0;
      this.baseOffset = 0;

      this.container.querySelector('.month-slider').classList.add('swiping');
      this.content.style.transition = 'none';

      // Remove any existing preview clone
      if (this.previewClone && this.previewClone.parentNode) {
        this.previewClone.parentNode.removeChild(this.previewClone);
        this.previewClone = null;
      }

      // Pre-create previews for both directions so they're ready immediately
      this.previewCloneLeft = null;
      this.previewCloneRight = null;
    },

    async createPreviewForMonth(delta) {

      // Calculate which month we're previewing
      const previewMonth = new Date(App.state.currentMonth.getFullYear(), App.state.currentMonth.getMonth() + delta, 1);
      const monthKey = `${previewMonth.getFullYear()}-${String(previewMonth.getMonth() + 1).padStart(2, '0')}`;

      // Get data for that month from cache
      const allCached = App.state.allFundData.length > 0
        ? App.state.allFundData
        : JSON.parse(localStorage.getItem('allFundData') || '[]');

      const monthData = allCached.filter(d => d.month === monthKey);

      // Create a temporary container to render preview
      const preview = document.createElement('div');
      preview.className = 'month-content-clone';
      preview.style.position = 'absolute';
      preview.style.top = '0';
      preview.style.left = '0';
      preview.style.width = '100%';
      preview.style.minHeight = '100%';
      preview.style.background = '#ffffff';
      preview.style.backgroundColor = '#ffffff';
      preview.style.transition = 'none';
      preview.style.zIndex = '1';
      preview.style.pointerEvents = 'none';

      // Clone the structure of current content but with preview data
      preview.innerHTML = this.content.innerHTML;

      // Render the preview data into the clone
      const previewIncome = preview.querySelector('#incomeList');
      const previewExpense = preview.querySelector('#expenseList');

      if (previewIncome && previewExpense) {
        const income = monthData.filter(d => d.type === 'income');
        const expense = monthData.filter(d => d.type === 'expense');
        const expenseToShow = App.state.isAdmin ? expense : expense.filter(e => !e.is_calculation);

        // Use the same render function
        window.FundModule.renderFundList(income, previewIncome, 'green');
        window.FundModule.renderFundList(expenseToShow, previewExpense, 'red');

        // Update totals
        const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);
        const totalExpense = expenseToShow.reduce((sum, item) => sum + item.amount, 0);
        const balance = totalIncome - totalExpense;

        const totalIncomeEl = preview.querySelector('#totalIncome');
        const totalExpenseEl = preview.querySelector('#totalExpense');
        const monthlyBalanceEl = preview.querySelector('#monthlyBalance');

        if (totalIncomeEl) totalIncomeEl.textContent = `৳ ${totalIncome}`;
        if (totalExpenseEl) totalExpenseEl.textContent = `৳ ${totalExpense}`;
        if (monthlyBalanceEl) {
          monthlyBalanceEl.textContent = `৳ ${balance}`;
          monthlyBalanceEl.style.color = balance >= 0 ? 'var(--brand-green-dark)' : '#dc2626';
        }
      }
      return preview;
    },

    async handleMove(e) {
      if (!this.isDragging) return;

      const touch = e.touches ? e.touches[0] : e;
      const diffX = touch.clientX - this.startX;
      const diffY = touch.clientY - this.startY;

      // If vertical scroll is more prominent, don't hijack the gesture
      if (Math.abs(diffY) > Math.abs(diffX)) {
        return;
      }

      // Prevent default scroll when horizontal swipe is detected
      e.preventDefault();

      const now = performance.now();
      const curX = touch.clientX;
      this.computeVelocity(curX, now);

      let diffXWithResistance = diffX;
      const containerWidth = this.container.offsetWidth;

      // Apply edge resistance
      const now2 = new Date();
      const currentMonth = App.state.currentMonth;
      const minDate = new Date(2017, 5, 1);
      const maxDate = new Date(now2.getFullYear(), now2.getMonth(), 1);

      // Left boundary (newer months) - resist left swipe
      if (currentMonth >= maxDate && diffX < 0) {
        diffXWithResistance = diffX * this.EDGE_RESISTANCE;
      }

      // Right boundary (older months) - resist right swipe
      if (currentMonth <= minDate && diffX > 0) {
        diffXWithResistance = diffX * this.EDGE_RESISTANCE;
      }

      this.currentX = diffXWithResistance;

      // Determine swipe direction and create preview if needed
      // diffX > 0 = swiping right = go to PREVIOUS month (delta = -1)
      // diffX < 0 = swiping left = go to NEXT month (delta = +1)
      const newDirection = diffX > 0 ? -1 : 1;

      if (newDirection !== this.swipeDirection && Math.abs(diffX) > 5) {
        this.swipeDirection = newDirection;

        // Remove old preview if direction changed
        if (this.previewClone && this.previewClone.parentNode) {
          this.previewClone.parentNode.removeChild(this.previewClone);
        }

        // Create new preview for the direction immediately
        const previewMonth = new Date(App.state.currentMonth.getFullYear(), App.state.currentMonth.getMonth() + this.swipeDirection, 1);
        const minDate = new Date(2017, 5, 1);
        const now = new Date();
        const maxDate = new Date(now.getFullYear(), now.getMonth(), 1);

        // Only create preview if within bounds
        if (previewMonth >= minDate && previewMonth <= maxDate) {
          this.previewClone = await this.createPreviewForMonth(this.swipeDirection);
          const slider = this.container.querySelector('.month-slider');
          slider.appendChild(this.previewClone);

          // Position preview immediately at correct starting position
          const containerWidth = this.container.offsetWidth;
          const previewOffset = this.swipeDirection > 0 ? -containerWidth : containerWidth;
          this.previewClone.style.transform = `translateX(${previewOffset}px)`;
          this.previewClone.style.transition = 'none';
        }
      }

      // Apply resistance at boundaries
      const resistance = 0.5;
      let finalX = diffX;

      // Left boundary (newer months)
      if (currentMonth >= maxDate && diffX < 0) {
        finalX = diffX * resistance;
      }

      // Right boundary (older months)
      if (currentMonth <= minDate && diffX > 0) {
        finalX = diffX * resistance;
      }

      // Move content directly by pixel amount (not percentage)
      this.content.style.transform = `translateX(${finalX}px)`;

      // Position preview clone ADJACENT to current content - BOTH VISIBLE
      if (this.previewClone) {
        const containerWidth = this.container.offsetWidth;

        // Preview should be exactly one screen width away from current position
        // If swiping right (diffX > 0, showing previous month), preview starts at -100% and moves right
        // If swiping left (diffX < 0, showing next month), preview starts at +100% and moves left
        let previewX;
        if (this.swipeDirection > 0) {
          // Swiping right = showing next month (which comes from right side)
          previewX = containerWidth + finalX;
        } else {
          // Swiping left = showing previous month (which comes from left side)
          previewX = -containerWidth + finalX;
        }

        this.previewClone.style.transform = `translateX(${previewX}px)`;
        this.previewClone.style.visibility = 'visible';
        this.previewClone.style.opacity = '1';
      }
    },

    handleEnd(e) {
      if (!this.isDragging) return;

      this.isDragging = false;
      this.container.querySelector('.month-slider').classList.remove('swiping');

      const containerWidth = this.container.offsetWidth;
      const absDelta = Math.abs(this.currentX);
      const vel = this.velocity;

      // Determine if swipe was significant enough
      // Either high velocity OR significant distance
      let shouldChange = false;
      let targetDirection = 0;

      if (Math.abs(vel) > this.SNAP_VELOCITY) {
        // High velocity swipe - respect the direction
        shouldChange = true;
        targetDirection = vel < 0 ? 1 : -1; // negative velocity = swiping left = next month
      } else if (absDelta > containerWidth * this.SNAP_DISTANCE_RATIO) {
        // Slow but significant drag distance
        shouldChange = true;
        targetDirection = this.currentX < 0 ? 1 : -1;
      }

      // Calculate dynamic settle duration based on velocity
      let settleDuration = this.SETTLE_DURATION;
      if (Math.abs(vel) > this.SNAP_VELOCITY) {
        settleDuration = Math.max(260, this.SETTLE_DURATION * 0.7);
      }

      if (shouldChange && this.swipeDirection !== 0) {
        const delta = this.swipeDirection;

        // Check boundaries before changing
        const newMonth = new Date(App.state.currentMonth.getFullYear(), App.state.currentMonth.getMonth() + delta, 1);
        const minDate = new Date(2017, 5, 1);
        const now = new Date();
        const maxDate = new Date(now.getFullYear(), now.getMonth(), 1);

        if (newMonth >= minDate && newMonth <= maxDate) {
          // DON'T snap back - continue the animation in the same direction
          this.content.classList.remove('animating-slow');
          this.content.classList.add('animating');
          this.content.style.transition = `transform ${settleDuration}ms cubic-bezier(0.18, 0.89, 0.32, 1.28)`;

          // Current content should slide off in the direction of the swipe
          const direction = this.currentX > 0 ? containerWidth : -containerWidth;
          this.content.style.transform = `translateX(${direction}px)`;

          // Animate preview into center from its current position
          if (this.previewClone) {
            this.previewClone.classList.remove('animating-slow');
            this.previewClone.classList.add('animating');
            this.previewClone.style.transition = `transform ${settleDuration}ms cubic-bezier(0.18, 0.89, 0.32, 1.28)`;

            // Preview should end at center (0)
            // It's currently at containerWidth + currentX (or -containerWidth + currentX)
            // So we just need to move it to 0
            this.previewClone.style.transform = 'translateX(0px)';
            this.previewClone.style.zIndex = '2';
          }

          // Change month immediately (data will load while animation plays)
          setTimeout(() => {
            window.FundModule.changeMonth(delta, true);
          }, 50);

          // Clean up after animation completes
          setTimeout(() => {

            this.content.classList.remove('animating');
            this.content.style.transition = '';
            this.content.style.transform = '';

            // Remove preview clone
            if (this.previewClone && this.previewClone.parentNode) {
              this.previewClone.parentNode.removeChild(this.previewClone);
              this.previewClone = null;
            }
          }, settleDuration + 50);

          return;
        } else {
          //noting. literally nothing
        }
      }

      // Snap back to center
      this.content.classList.remove('animating-slow');
      this.content.classList.add('animating');
      this.content.style.transition = `transform 300ms cubic-bezier(0.18, 0.89, 0.32, 1.28)`;
      this.content.style.transform = 'translateX(0)';

      // Animate preview back off screen
      if (this.previewClone) {
        this.previewClone.classList.remove('animating-slow');
        this.previewClone.classList.add('animating');
        this.previewClone.style.transition = `transform 300ms cubic-bezier(0.18, 0.89, 0.32, 1.28)`;
        const previewOffset = this.swipeDirection > 0 ? -containerWidth : containerWidth;
        this.previewClone.style.transform = `translateX(${previewOffset}px)`;
      }

      setTimeout(() => {
        this.content.classList.remove('animating-slow');
        this.content.style.transition = 'none';

        // Remove preview clone
        if (this.previewClone && this.previewClone.parentNode) {
          this.previewClone.parentNode.removeChild(this.previewClone);
          this.previewClone = null;
        }
      }, 300);
    }
  },

  async copyCompleteHistory() {
    const modeToggle = document.getElementById('historyModeToggle');
    const isBn = localStorage.getItem('lang') === 'bn';
    const isYearlyBrief = modeToggle.textContent === (isBn ? 'সংক্ষিপ্ত' : 'Yearly Brief');

    let data = [];

    try {
      const { data: freshData, error } = await db.from('fund').select('*').order('month', { ascending: true }).order('timestamp', { ascending: true });

      if (error) throw error;
      data = freshData;
    } catch (err) {
      console.log('Copying from cache:', err);
      // Use cached data
      data = App.state.allFundData.length > 0
        ? App.state.allFundData
        : JSON.parse(localStorage.getItem('allFundData') || '[]');
    }

    if (!data || data.length === 0) {
      return App.showNotification('No history data to copy', true);
    }

    // Group by month (only isCalculation=true expenses)
    const monthlyData = {};
    data.forEach(entry => {
      if (!monthlyData[entry.month]) {
        monthlyData[entry.month] = { income: 0, expenses: [] };
      }
      if (entry.type === 'income') {
        monthlyData[entry.month].income += entry.amount;
      } else if (entry.type === 'expense' && !entry.is_calculation) {
        monthlyData[entry.month].expenses.push(entry);
      }
    });

    // Build the text
    let text = '';
    let runningBalance = 0;
    const months = Object.keys(monthlyData).sort();
    const currentYear = new Date().getFullYear();

    if (isYearlyBrief) {
      // Calculate previous year's balance
      const previousYearMonths = months.filter(m => parseInt(m.split('-')[0]) < currentYear);
      previousYearMonths.forEach(month => {
        const monthData = monthlyData[month];
        runningBalance += monthData.income;
        // expenses are already filtered when building monthlyData
        monthData.expenses.forEach(expense => {
          runningBalance -= expense.amount;
        });
      });

      if (previousYearMonths.length > 0) {
        const lastYear = currentYear - 1;
        text += `${lastYear} সালের শেষে অবশিষ্ট টাকা: ৳ ${runningBalance.toLocaleString()}\n\n`;
      }

      text += `${currentYear} সাল:\n\n`;

      // Show only current year
      const currentYearMonths = months.filter(m => parseInt(m.split('-')[0]) === currentYear);
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      currentYearMonths.forEach(month => {
        const monthData = monthlyData[month];
        const date = new Date(month + '-01');
        const monthName = date.toLocaleString('default', { month: 'long' });
        const isCurrentMonth = month === currentMonthKey;

        // For current month, show day + month
        if (isCurrentMonth) {
          const today = now.getDate();
          const monthNameBn = date.toLocaleString('default', { month: 'long' });
          text += `${today} ${monthNameBn} পর্যন্ত:\n`;
        } else {
          text += `${monthName}:\n`;
        }

        // For current month, show expenses first, then income
        if (isCurrentMonth) {
          if (monthData.expenses.length > 0) {
            // Only show expenses where isCalculation is true (NULL/false in DB)
            monthData.expenses.filter(e => !e.is_calculation).forEach(expense => {
              runningBalance -= expense.amount;
              text += `সাদাকাহ (${expense.description}): ${expense.amount.toLocaleString()} টাকা\n`;
            });
            text += `মোট অবশিষ্ট থাকে: ${runningBalance.toLocaleString()} টাকা\n`;
          }

          if (monthData.income > 0) {
            runningBalance += monthData.income;
            text += `মোট কালেকশন: ${monthData.income.toLocaleString()} টাকা\n`;
            text += `এখন ফান্ডে আছে: ${runningBalance.toLocaleString()} টাকা\n`;
          }
        } else {
          // For other months, show income first, then expenses (normal order)
          if (monthData.income > 0) {
            runningBalance += monthData.income;
            text += `মোট কালেকশন: ${monthData.income.toLocaleString()} টাকা\n`;
            text += `ফান্ডে মোট হয়: ${runningBalance.toLocaleString()} টাকা\n`;
          }

          if (monthData.expenses.length > 0) {
            // Only show expenses where isCalculation is true (NULL/false in DB)
            monthData.expenses.filter(e => !e.is_calculation).forEach(expense => {
              runningBalance -= expense.amount;
              text += `সাদাকাহ (${expense.description}): ${expense.amount.toLocaleString()} টাকা\n`;
            });
            text += `মোট অবশিষ্ট থাকে: ${runningBalance.toLocaleString()} টাকা\n`;
          }
        }

        text += `\n`;
      });
    } else {
      // Elaborated mode - show all history
      text += `সম্পূর্ণ তথ্য:\n\n`;

      months.forEach(month => {
        const monthData = monthlyData[month];
        const date = new Date(month + '-01');
        const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });

        text += `${monthName}:\n`;

        if (monthData.income > 0) {
          runningBalance += monthData.income;
          text += `মোট কালেকশন: ${monthData.income.toLocaleString()} টাকা\n`;
          text += `ফান্ডে মোট হয়: ${runningBalance.toLocaleString()} টাকা\n`;
        }

        if (monthData.expenses.length > 0) {
          // Only show expenses where isCalculation is true (NULL/false in DB)
          monthData.expenses.filter(e => !e.is_calculation).forEach(expense => {
            runningBalance -= expense.amount;
            text += `সাদাকাহ (${expense.description}): ${expense.amount.toLocaleString()} টাকা\n`;
          });
          text += `মোট অবশিষ্ট থাকে: ${runningBalance.toLocaleString()} টাকা\n`;
        }

        text += `\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(text);
      App.showNotification('Complete history copied to clipboard!');
    } catch (err) {
      App.showNotification('Failed to copy to clipboard', true);
    }
  }
};

// Initialize swipe handler when fund section is shown
setTimeout(() => {
  if (window.FundModule && window.FundModule.swipeHandler) {
    window.FundModule.swipeHandler.init();
  }
}, 1000);