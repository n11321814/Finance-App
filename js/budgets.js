// ================================================================
// BUDGETS - Budget management, tracking, cash flow
// ================================================================

// ================================================================
// BUDGET INPUT
// ================================================================

function renderBudgetInput() {
    const container = document.getElementById('budgetInput');
    const budgets = appData.budgets || {};
    const allCats = appData.categories || DEFAULT_CATEGORIES;

    if (allCats.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📊</div><div class="message">No categories found</div></div>`;
        return;
    }

    const budgetItem = cat => `
                <div class="budget-input-item" style="display:flex;align-items:center;gap:8px;background:var(--bg-input);border-radius:6px;padding:6px 10px;border:1px solid var(--border-color);">
                    <span style="font-weight:500;color:var(--text-primary);font-size:13px;min-width:60px;">${escapeHtml(cat)}</span>
                    <span style="color:var(--text-muted);font-size:11px;">$</span>
                    <input class="edit-budget" type="number" step="10" min="0" value="${budgets[cat] || 0}"
                           data-cat="${escapeHtml(cat)}" onchange="updateBudget(this.dataset.cat, this.value)"
                           style="width:60px;padding:2px 6px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);font-size:13px;text-align:right;" />
                </div>
            `;

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px;">
            ${allCats.map(budgetItem).join('')}
        </div>
    ` + `
        <div style="text-align:right;margin-top:8px;font-size:12px;font-weight:700;color:var(--text-white);">
            Total: $${getTotalMonthlyBudget().toFixed(0)} / month
        </div>
    `;
}

function updateBudget(category, value) {
    const newBudget = parseFloat(value) || 0;
    appData.budgets[category] = newBudget;
    updateUI();
}

// ================================================================
// MONTHLY BUDGET HISTORY (with total row)
// ================================================================

function renderMonthlyBudgetHistory() {
    const container = document.getElementById('monthlyBudgetHistory');
    const budgets = appData.budgets || {};
    // Your categories plus any with spending that aren't in the list, so
    // the Total row always matches what was actually spent
    const allCats = getSpendingCategories();
    const unlisted = new Set(getUnlistedCategories());

    if (Object.keys(budgets).length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><div class="message">No budgets set</div></div>`;
        return;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthOrder = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];

    const spend = {};
    getFYExpenses().forEach(e => {
        const d = parseLocalDate(e.date);
        const cat = e.category || 'Other';
        const m = d.getMonth();
        spend[cat] = spend[cat] || {};
        spend[cat][m] = (spend[cat][m] || 0) + (e.amount || 0);
    });

    const now = new Date();
    const fyStartYear = FY_START.getFullYear();
    function monthHasStarted(m) {
        const year = (m >= 6) ? fyStartYear : fyStartYear + 1;
        return new Date(year, m, 1) <= now;
    }
    // The Avg column only uses completed months (from the first month with
    // data), so a half-finished month doesn't drag it down.
    const completedMonths = new Set(getCompletedFYMonths().map(m => m.month));

    const headerCells = monthOrder.map(m => `<th>${monthNames[m]}</th>`).join('');
    const headerWithAvg = headerCells + `<th style="color:var(--emerald-light);border-left:1px solid var(--border-color);" title="Average of completed months">Avg</th>`;

    let rows = '';
    // Build category rows
    allCats.forEach(cat => {
        const budget = budgets[cat] || 0;
        let monthValues = [];
        const cells = monthOrder.map(m => {
            if (!monthHasStarted(m)) {
                monthValues.push(null);
                return `<td class="mbh-cell mbh-future" title="Hasn't happened yet">—</td>`;
            }
            const actual = (spend[cat] && spend[cat][m]) || 0;
            if (completedMonths.has(m)) monthValues.push(actual);
            const pct = budget > 0 ? (actual / budget * 100) : (actual > 0 ? 999 : 0);
            let status;
            if (budget === 0) {
                status = actual > 0 ? 'over' : 'nobudget';
            } else if (pct < 80) {
                status = 'under';
            } else if (pct <= 100) {
                status = 'near';
            } else {
                status = 'over';
            }
            const tooltip = `${cat} - ${monthNames[m]}: $${actual.toFixed(2)} of $${budget.toFixed(2)} budgeted` + (budget > 0 ? ` (${pct.toFixed(0)}%)` : ' (no budget set)');
            return `<td class="mbh-cell mbh-${status}" title="${escapeHtml(tooltip)}">$${actual.toFixed(0)}</td>`;
        }).join('');

        const validMonths = monthValues.filter(v => v !== null);
        const avg = validMonths.length > 0 ? validMonths.reduce((s, v) => s + v, 0) / validMonths.length : 0;
        const avgDisplay = avg > 0 ? `$${avg.toFixed(0)}` : '—';
        const avgColor = avg > 0 && budget > 0 ? (avg / budget * 100 < 80 ? 'var(--green)' : avg / budget * 100 <= 100 ? 'var(--amber)' : 'var(--red)') : 'var(--text-muted)';

        const nameCell = unlisted.has(cat)
            ? `<td class="mbh-cat-name" style="color:var(--amber);" title="Not in your category list - counted in totals but has no budget. Add it to your list, or move these expenses to another category.">${escapeHtml(cat)} *</td>`
            : `<td class="mbh-cat-name">${escapeHtml(cat)}</td>`;
        rows += `<tr>${nameCell}${cells}<td style="border-left:1px solid var(--border-color);font-weight:700;color:${avgColor};padding-left:12px;">${avgDisplay}</td></tr>`;
    });

    // ---- TOTAL ROW ----
    // Budget vs spend per month summed over a set of categories
    const summaryRow = (label, cats, total) => {
        let totalRowCells = '';
        let totalAvgValues = [];
        monthOrder.forEach(m => {
            if (!monthHasStarted(m)) {
                totalRowCells += `<td class="mbh-cell mbh-future">—</td>`;
                totalAvgValues.push(null);
                return;
            }
            let totalBudget = 0;
            let totalSpent = 0;
            cats.forEach(cat => {
                totalBudget += budgets[cat] || 0;
                totalSpent += (spend[cat] && spend[cat][m]) || 0;
            });
            const pct = totalBudget > 0 ? (totalSpent / totalBudget * 100) : (totalSpent > 0 ? 999 : 0);
            let status;
            if (totalBudget === 0) {
                status = totalSpent > 0 ? 'over' : 'nobudget';
            } else if (pct < 80) {
                status = 'under';
            } else if (pct <= 100) {
                status = 'near';
            } else {
                status = 'over';
            }
            const tooltip = `${label}: $${totalSpent.toFixed(2)} of $${totalBudget.toFixed(2)} budgeted` + (totalBudget > 0 ? ` (${pct.toFixed(0)}%)` : ' (no budget set)');
            totalRowCells += `<td class="mbh-cell mbh-${status}" title="${escapeHtml(tooltip)}">$${totalSpent.toFixed(0)}</td>`;
            if (completedMonths.has(m)) totalAvgValues.push(totalSpent);
        });

        const validTotals = totalAvgValues.filter(v => v !== null);
        const totalAvg = validTotals.length > 0 ? validTotals.reduce((s, v) => s + v, 0) / validTotals.length : 0;
        const totalAvgDisplay = totalAvg > 0 ? `$${totalAvg.toFixed(0)}` : '—';
        const totalBudgetSum = cats.reduce((s, cat) => s + (budgets[cat] || 0), 0);
        const totalAvgColor = totalAvg > 0 && totalBudgetSum > 0 ? (totalAvg / totalBudgetSum * 100 < 80 ? 'var(--green)' : totalAvg / totalBudgetSum * 100 <= 100 ? 'var(--amber)' : 'var(--red)') : 'var(--text-muted)';

        return `
            <tr class="${total ? 'mbh-total-row' : ''}">
                <td class="mbh-cat-name" style="color:var(--text-white);font-weight:700;">${label}</td>
                ${totalRowCells}
                <td style="border-left:1px solid var(--border-color);font-weight:700;color:${totalAvgColor};padding-left:12px;">${totalAvgDisplay}</td>
            </tr>
        `;
    };

    rows += summaryRow('📊 Total', allCats, true);

    container.innerHTML = `
        <div class="mbh-scroll">
            <table class="mbh-table">
                <thead><tr><th class="mbh-cat-header">Category</th>${headerWithAvg}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="mbh-legend">
            <span class="mbh-legend-item"><span class="mbh-dot mbh-under"></span>Under 80%</span>
            <span class="mbh-legend-item"><span class="mbh-dot mbh-near"></span>80-100%</span>
            <span class="mbh-legend-item"><span class="mbh-dot mbh-over"></span>Over budget</span>
            <span class="mbh-legend-item"><span class="mbh-dot mbh-future"></span>Hasn't happened yet</span>
            ${unlisted.size ? '<span class="mbh-legend-item" style="color:var(--amber);">* not in your category list - add it on the Expenses tab</span>' : ''}
        </div>
    `;
}

// ================================================================
// CASH FLOW PROJECTION
// ================================================================

function renderCashFlowProjection() {
    const container = document.getElementById('cashFlowProjection');

    const projectedAnnualIncome = getFYIncomeProjection().annual;
    // Income is counted in the month it's paid (see getPayDate): logged
    // pay plus expected pay for weeks not logged yet.
    const payEvents = getPayEvents();
    // One effective rate for every month, so actual and projected months
    // are taxed the same way and the totals stay comparable.
    const taxRate = getFYTaxRate();

    const filtered = getFilteredExpenses();
    const budgets = appData.budgets || {};
    const categories = appData.categories || DEFAULT_CATEGORIES;
    const totalMonthlyBudget = getTotalMonthlyBudget();
    // Expenses whose category no longer exists still count, in their own column
    const unlisted = getUnlistedCategories();
    const columns = [...categories, ...unlisted];

    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthOrder = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
    const fyStartYear = FY_START.getFullYear();

    let runningBalance = 0;
    let rows = '';
    const totals = { gross: 0, tax: 0, net: 0, expenses: 0, byCategory: {} };
    columns.forEach(c => { totals.byCategory[c] = 0; });

    const money = n => `$${Math.round(n).toLocaleString('en-AU')}`;
    const signed = n => n >= 0
        ? `<span class="cfp-positive">+${money(n)}</span>`
        : `<span class="cfp-negative">-${money(Math.abs(n))}</span>`;

    for (const m of monthOrder) {
        const year = (m >= 6) ? fyStartYear : fyStartYear + 1;
        const monthDate = new Date(year, m, 1);
        const isPast = monthDate <= now;
        const isCurrentMonth = monthDate.getMonth() === now.getMonth() && monthDate.getFullYear() === now.getFullYear();
        const isActual = isPast && !isCurrentMonth;
        const inMonth = dateStr => {
            const d = parseLocalDate(dateStr);
            return d.getMonth() === m && d.getFullYear() === year;
        };

        const grossIncome = sumPaidInMonth(payEvents, year, m);
        const tax = grossIncome * taxRate;
        const incomeAfterTax = grossIncome - tax;
        const incomeIsLogged = payEvents.some(e => e.actual && e.payDate.getFullYear() === year && e.payDate.getMonth() === m);
        const actualByCategory = sumExpensesByCategory(filtered.filter(e => inMonth(e.date)));

        // Past months: what you actually spent. Current month: the larger of
        // spend so far and budget, per category, because some bills land at
        // the end of the month. Future months: budget.
        const byCategory = {};
        columns.forEach(c => {
            const actual = actualByCategory[c] || 0;
            const budget = budgets[c] || 0;
            byCategory[c] = isActual ? actual : isCurrentMonth ? Math.max(actual, budget) : budget;
        });
        const expenses = columns.reduce((s, c) => s + byCategory[c], 0);
        const surplus = incomeAfterTax - expenses;
        runningBalance += surplus;

        totals.gross += grossIncome;
        totals.tax += tax;
        totals.net += incomeAfterTax;
        totals.expenses += expenses;
        columns.forEach(c => { totals.byCategory[c] += byCategory[c]; });

        const cls = isActual || isCurrentMonth ? 'cfp-actual' : 'cfp-project';
        const incomeCls = incomeIsLogged ? 'cfp-actual' : 'cfp-project';
        const categoryCell = c => {
            const title = isCurrentMonth
                ? `${c}: $${(actualByCategory[c] || 0).toFixed(0)} spent so far, $${(budgets[c] || 0).toFixed(0)} budgeted`
                : `${c}${isActual ? ' (actual)' : ' (budget)'}`;
            return `<td><span class="${cls}" title="${escapeHtml(title)}">${byCategory[c] ? money(byCategory[c]) : '–'}</span></td>`;
        };

        rows += `
            <tr class="${surplus >= 0 ? 'cfp-surplus-highlight' : 'cfp-deficit-highlight'}">
                <td class="cfp-month-label">${monthNames[m]} ${year}${isCurrentMonth ? ' ⬅️' : ''}</td>
                <td><span class="${incomeCls}">${money(grossIncome)}</span></td>
                <td><span class="${incomeCls}">${money(tax)}</span></td>
                <td class="cfp-col-strong"><span class="${incomeCls}">${money(incomeAfterTax)}</span></td>
                ${columns.map(categoryCell).join('')}
                <td class="cfp-col-strong"><span class="${cls}">${money(expenses)}</span></td>
                <td>${signed(surplus)}</td>
                <td>${signed(runningBalance)}</td>
            </tr>
        `;
    }

    const totalSurplus = totals.net - totals.expenses;
    rows += `
        <tr class="cfp-total">
            <td class="cfp-month-label">Total FY</td>
            <td>${money(totals.gross)}</td>
            <td>${money(totals.tax)}</td>
            <td class="cfp-col-strong">${money(totals.net)}</td>
            ${columns.map(c => `<td>${money(totals.byCategory[c])}</td>`).join('')}
            <td class="cfp-col-strong">${money(totals.expenses)}</td>
            <td>${signed(totalSurplus)}</td>
            <td></td>
        </tr>
    `;

    const savingsRate = totals.net > 0 ? (totalSurplus / totals.net * 100) : 0;

    container.innerHTML = `
        <div class="cfp-scroll">
            <table class="cfp-table">
                <thead>
                    <tr>
                        <th class="cfp-month-label">Month</th>
                        <th title="Pay landing in your account that month">Gross pay</th>
                        <th title="Estimated at your projected effective tax rate for the year (${(taxRate * 100).toFixed(1)}%)">Tax</th>
                        <th class="cfp-col-strong">Net income</th>
                        ${columns.map(c => `<th>${escapeHtml(c)}${unlisted.includes(c) ? ' *' : ''}</th>`).join('')}
                        <th class="cfp-col-strong">Expenses</th>
                        <th>Surplus</th>
                        <th>Running</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:var(--text-muted);">
            <span>🔵 <strong style="color:var(--text-white);">Yearly projection:</strong> ${totalSurplus >= 0 ? '✅ On track' : '⚠️ Deficit projected'}</span>
            <span>📊 <strong style="color:var(--text-white);">Surplus:</strong> ${totalSurplus >= 0 ? '+' : '-'}${money(Math.abs(totalSurplus))}</span>
            <span>📈 <strong style="color:var(--text-white);">Savings rate:</strong> ${savingsRate.toFixed(0)}%</span>
            <span>📅 <strong style="color:var(--text-white);">Monthly budget:</strong> ${money(totalMonthlyBudget)}</span>
            <span>🧾 <strong style="color:var(--text-white);">Tax rate used:</strong> ${(taxRate * 100).toFixed(1)}% of gross, every month</span>
            ${unlisted.length ? '<span>* category no longer in your list</span>' : ''}
            ${totalSurplus < 0 ? `<span style="color:var(--red);">⚠️ Reduce expenses by ${money(Math.abs(totalSurplus / 12))}/month</span>` : ''}
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-muted);">
            Italic = projected. Past months show actual spending; the current month shows the larger of spending so far and budget for each category; future months show budget.
        </div>
    `;
}
