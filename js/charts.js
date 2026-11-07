// ================================================================
// CHARTS - Expense Breakdown Pie Chart only
// ================================================================

function renderCharts() {
    renderExpenseBreakdown();
}

function renderExpenseBreakdown() {
    const breakdown = document.getElementById('expenseBreakdown');
    if (!breakdown) return;
    
    const categories = {};
    getFYExpenses().forEach(e => {
        const cat = e.category || 'Other';
        categories[cat] = (categories[cat] || 0) + (e.amount || 0);
    });
    const entries = Object.entries(categories).sort((a,b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0);
    
    if (total === 0) {
        breakdown.innerHTML = `<div class="empty-state"><div class="icon">🍕</div><div class="message">No expenses recorded</div></div>`;
        return;
    }

    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#f97316'];
    let startAngle = 0;
    let gradient = '';
    let legendHtml = '';
    
    entries.forEach(([cat, amt], idx) => {
        const pct = (amt / total) * 100;
        const endAngle = startAngle + (pct / 100) * 360;
        // Past the fixed palette, spread extra categories round the colour wheel so no two share a colour
        const color = idx < colors.length ? colors[idx] : `hsl(${Math.round((idx - colors.length) * 137.5) % 360}, 65%, 55%)`;
        gradient += `${color} ${startAngle}deg, ${color} ${endAngle}deg, `;
        startAngle = endAngle;
        legendHtml += `
            <div class="pie-legend-item">
                <span class="dot" style="background:${color};"></span>
                ${escapeHtml(cat)}
                <span class="pct">${pct.toFixed(0)}%</span>
            </div>
        `;
    });
    
    gradient = gradient.slice(0, -2);
    
    breakdown.innerHTML = `
        <div class="pie-container">
            <div class="pie" style="background:conic-gradient(${gradient});"></div>
            <div class="pie-legend">${legendHtml}</div>
        </div>
        <div style="margin-top:12px;padding:10px 14px;background:rgba(255,255,255,0.02);border-radius:8px;display:flex;justify-content:space-between;">
            <span style="color:var(--text-secondary);font-size:13px;">Total Expenses</span>
            <span style="font-weight:600;color:var(--text-white);font-size:16px;">$${total.toFixed(0)}</span>
        </div>
    `;
}
// ================================================================
// MONTHLY EXPENSES - columns per month this FY, one series at a time
// (all spending, or a single category), with the monthly budget as a
// reference line. The current month is shown faded as "so far".
// ================================================================

// View state only - not saved to the data file
let expenseChartCategory = 'All';
let expenseChartShowTable = false;

function setExpenseChartCategory(cat) {
    expenseChartCategory = cat;
    renderMonthlyExpensesChart();
}

function toggleExpenseChartTable() {
    expenseChartShowTable = !expenseChartShowTable;
    renderMonthlyExpensesChart();
}

function getMonthlyExpenseSeries(category) {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const expenses = getFYExpenses();
    const budgets = appData.budgets || {};
    const budget = category === 'All' ? getTotalMonthlyBudget() : (budgets[category] || 0);
    // From the first month with any spending to the current month (or June)
    const firstKey = expenses.map(e => monthKey(parseLocalDate(e.date))).sort()[0];
    const months = [];
    for (let d = new Date(FY_START); d <= FY_END && d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const key = monthKey(d);
        if (!firstKey || key < firstKey) continue;
        const items = expenses.filter(e => monthKey(parseLocalDate(e.date)) === key && (category === 'All' || (e.category || 'Other') === category));
        months.push({
            key, year: d.getFullYear(), month: d.getMonth(),
            total: items.reduce((s, e) => s + (e.amount || 0), 0),
            byCategory: sumExpensesByCategory(items),
            partial: d >= currentMonthStart
        });
    }
    return { months, budget };
}

function renderMonthlyExpensesChart() {
    const container = document.getElementById('monthlyExpensesChart');
    if (!container) return;
    const categories = getSpendingCategories();
    if (expenseChartCategory !== 'All' && !categories.includes(expenseChartCategory)) expenseChartCategory = 'All';
    const { months, budget } = getMonthlyExpenseSeries(expenseChartCategory);
    const money = n => '$' + Math.round(n).toLocaleString('en-AU');
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = m => MONTHS[m.month];

    const filters = `
        <div class="chart-filters">
            ${['All', ...categories].map(c => `<button class="btn btn-sm ${c === expenseChartCategory ? 'btn-primary' : 'btn-outline'}" data-cat="${escapeHtml(c)}" onclick="setExpenseChartCategory(this.dataset.cat)">${c === 'All' ? 'All spending' : escapeHtml(c)}</button>`).join('')}
            <button class="btn btn-sm btn-outline chart-table-toggle" onclick="toggleExpenseChartTable()">${expenseChartShowTable ? 'Show chart' : 'Show table'}</button>
        </div>`;

    if (months.length === 0) {
        container.innerHTML = filters + `<div class="empty-state"><div class="icon">📈</div><div class="message">No expenses this year yet</div></div>`;
        return;
    }

    if (expenseChartShowTable) {
        container.innerHTML = filters + `
            <div class="mbh-scroll">
                <table class="mbh-table" style="width:100%;">
                    <thead><tr><th class="mbh-cat-header">Month</th><th>Spent</th><th>Budget</th><th>Difference</th></tr></thead>
                    <tbody>${months.map(m => {
                        const diff = m.total - budget;
                        return `<tr>
                            <td class="mbh-cat-name">${monthName(m)} ${m.year}${m.partial ? ' (so far)' : ''}</td>
                            <td>${money(m.total)}</td>
                            <td>${budget > 0 ? money(budget) : '—'}</td>
                            <td>${budget > 0 ? (diff > 0 ? '+' : diff < 0 ? '-' : '') + money(Math.abs(diff)) : '—'}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>`;
        return;
    }

    // ---- geometry ----
    const width = Math.max(container.clientWidth || 900, 320);
    const height = 240;
    const margin = { top: 18, right: 92, bottom: 30, left: 52 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const maxValue = Math.max(budget, ...months.map(m => m.total), 1);
    // Clean y ticks: 1, 2 or 5 x a power of ten, about 4 steps
    const rough = maxValue * 1.1 / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map(f => f * mag).find(s => s >= rough);
    const yMax = Math.ceil(maxValue * 1.05 / step) * step;
    const y = v => margin.top + innerH - (v / yMax) * innerH;
    const band = innerW / months.length;
    const barW = Math.min(24, band * 0.6);
    const compact = v => v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : `$${Math.round(v)}`;

    let grid = '';
    for (let v = 0; v <= yMax + 0.001; v += step) {
        grid += `<line x1="${margin.left}" x2="${margin.left + innerW}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/>`
            + `<text x="${margin.left - 8}" y="${y(v) + 3.5}" class="chart-axis" text-anchor="end">${compact(v)}</text>`;
    }

    // Columns: 4px rounded data-end, square at the baseline
    const column = (x, top, w, h) => {
        if (h <= 0) return '';
        const r = Math.min(4, h, w / 2);
        return `M${x},${top + h} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${top + h} Z`;
    };
    // Only the latest finished month gets a value label; the rest are in the tooltip and table
    const latestComplete = [...months].reverse().find(m => !m.partial);
    let bars = '', labels = '', hits = '';
    months.forEach((m, i) => {
        const cx = margin.left + band * i + band / 2;
        const top = y(m.total);
        bars += `<path d="${column(cx - barW / 2, top, barW, y(0) - top)}" class="chart-bar${m.partial ? ' partial' : ''}"/>`;
        labels += `<text x="${cx}" y="${height - 10}" class="chart-axis" text-anchor="middle">${monthName(m)}${m.partial ? ' (so far)' : ''}</text>`;
        if (m === latestComplete) labels += `<text x="${cx}" y="${top - 6}" class="chart-value" text-anchor="middle">${money(m.total)}</text>`;
        hits += `<rect x="${margin.left + band * i}" y="${margin.top}" width="${band}" height="${innerH}" class="chart-hit" data-i="${i}"/>`;
    });
    const budgetLine = budget > 0
        ? `<line x1="${margin.left}" x2="${margin.left + innerW}" y1="${y(budget)}" y2="${y(budget)}" class="chart-budget"/>`
          + `<text x="${margin.left + innerW + 6}" y="${y(budget) + 3.5}" class="chart-axis">Budget ${compact(budget)}</text>`
        : '';

    const subject = expenseChartCategory === 'All' ? 'spending' : 'spending on ' + escapeHtml(expenseChartCategory);
    container.innerHTML = filters + `
        <div class="chart-wrap">
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly ${subject} this financial year">
                ${grid}${budgetLine}${bars}${labels}${hits}
            </svg>
            <div class="chart-tooltip" id="monthlyExpensesTooltip"></div>
        </div>`;

    // Hover tooltip per month
    const tip = document.getElementById('monthlyExpensesTooltip');
    container.querySelectorAll('.chart-hit').forEach(rect => {
        rect.addEventListener('mouseenter', () => {
            const m = months[Number(rect.dataset.i)];
            const diff = m.total - budget;
            const top3 = expenseChartCategory === 'All'
                ? Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3)
                    .map(([c, v]) => `<div class="chart-tip-row"><span>${escapeHtml(c)}</span><span>${money(v)}</span></div>`).join('')
                : '';
            tip.innerHTML = `
                <div class="chart-tip-title">${monthName(m)} ${m.year}${m.partial ? ' (so far)' : ''}</div>
                <div class="chart-tip-row"><span>Spent</span><strong>${money(m.total)}</strong></div>
                ${budget > 0 ? `<div class="chart-tip-row"><span>Budget</span><span>${money(budget)}</span></div>
                <div class="chart-tip-row"><span>${diff > 0 ? 'Over' : 'Under'}</span><span>${money(Math.abs(diff))}</span></div>` : ''}
                ${top3 ? `<div class="chart-tip-divider"></div>${top3}` : ''}`;
            const bandLeft = Number(rect.getAttribute('x'));
            const left = Math.min(bandLeft + Number(rect.getAttribute('width')) / 2 + 12, width - 190);
            tip.style.left = `${Math.max(0, left)}px`;
            tip.style.top = '8px';
            tip.style.display = 'block';
            rect.classList.add('active');
        });
        rect.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
            rect.classList.remove('active');
        });
    });
}
