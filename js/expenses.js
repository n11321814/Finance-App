// ================================================================
// EXPENSES - Adding, editing, categories
// ================================================================

let excludeExcludedExpenses = true;
// Category shown in the expense list ('' = all). Only filters the list.
let expenseFilterCategory = '';

function setExpenseFilter(category) {
    expenseFilterCategory = category || '';
    renderExpenses();
}

// The filter dropdown: All, then your categories plus any old ones in use
function renderExpenseFilter() {
    const select = document.getElementById('expenseFilterCategory');
    if (!select) return;
    const cats = [...(appData.categories || DEFAULT_CATEGORIES)];
    (appData.expenses || []).forEach(e => { const c = e.category || 'Other'; if (!cats.includes(c)) cats.push(c); });
    if (expenseFilterCategory && !cats.includes(expenseFilterCategory)) expenseFilterCategory = '';
    select.innerHTML = `<option value="">All categories</option>` +
        cats.map(c => `<option value="${escapeHtml(c)}" ${c === expenseFilterCategory ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

function getFilteredExpenses() {
    return (appData.expenses || []).filter(e => {
        if (e.excludeFromTotals) return false;
        return true;
    });
}

// ================================================================
// CATEGORIES
// ================================================================

function populateCategorySelect() {
    const select = document.getElementById('expenseCategory');
    const categories = appData.categories || DEFAULT_CATEGORIES;
    select.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function renderCategoryList() {
    const container = document.getElementById('categoryList');
    const categories = appData.categories || DEFAULT_CATEGORIES;
    
    const usedCategories = new Set((appData.expenses || []).map(e => e.category));
    
    container.innerHTML = categories.map(c => {
        const inUse = usedCategories.has(c);
        return `
            <span class="category-tag">
                ${escapeHtml(c)}
                ${!inUse ? `<span class="remove-cat" data-cat="${escapeHtml(c)}" onclick="removeCategory(this.dataset.cat)" title="Remove category">×</span>` : ''}
                ${inUse ? `<span class="in-use">(in use)</span>` : ''}
            </span>
        `;
    }).join('') + getUnlistedCategories().map(c => `
            <span class="category-tag" style="border-color:var(--amber);color:var(--amber);" title="Not in your category list - counted in totals but has no budget. Add it to your list, or move these expenses to another category.">
                ⚠ ${escapeHtml(c)}
                <span class="remove-cat" style="color:var(--amber);" data-cat="${escapeHtml(c)}" onclick="addCategoryNamed(this.dataset.cat)" title="Add to your category list">＋ add to list</span>
            </span>
        `).join('');
}

function addCategoryNamed(name) {
    if (!name || (appData.categories || []).includes(name)) return;
    appData.categories.push(name);
    updateUI();
}

function addCategory() {
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim();
    if (!name) return alert('Enter a category name');
    if ((appData.categories || []).includes(name)) {
        return alert('Category already exists');
    }
    appData.categories.push(name);
    input.value = '';
    updateUI();
}

function removeCategory(name) {
    const inUse = (appData.expenses || []).some(e => e.category === name);
    if (inUse) {
        return alert('Cannot remove category that has expenses.');
    }
    appData.categories = (appData.categories || []).filter(c => c !== name);
    delete appData.budgets[name];
    updateUI();
}

// ================================================================
// EXPENSES LIST
// ================================================================

function renderExpenses() {
    const list = document.getElementById('expenseList');
    const allExpenses = appData.expenses || [];
    renderExpenseFilter();
    const totalEl = document.getElementById('expenseFilterTotal');
    if (totalEl) totalEl.textContent = '';
    if (allExpenses.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">💳</div><div class="message">No expenses recorded</div></div>`;
        return;
    }

    const shown = allExpenses
        .map((e, idx) => ({ e, idx }))
        .filter(({ e }) => !expenseFilterCategory || (e.category || 'Other') === expenseFilterCategory);
    if (totalEl && expenseFilterCategory) {
        // This FY, not counting excluded ones
        const fyTotal = shown.filter(({ e }) => !e.excludeFromTotals && isInFY(e.date)).reduce((t, { e }) => t + (e.amount || 0), 0);
        totalEl.textContent = `${shown.length} item${shown.length === 1 ? '' : 's'} · $${fyTotal.toLocaleString('en-AU', { maximumFractionDigits: 0 })} this FY`;
    }
    if (shown.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">💳</div><div class="message">No ${escapeHtml(expenseFilterCategory)} expenses</div></div>`;
        return;
    }

    // Most recent first (by date, then by entry order)
    const ordered = shown
        .sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '') || b.idx - a.idx);

    list.innerHTML = ordered.map(({ e, idx }) => {
        const cats = appData.categories || DEFAULT_CATEGORIES;
        // If this expense's category isn't in the list, show it as-is
        // (otherwise the dropdown would silently display the first category)
        const ownCategory = e.category || 'Other';
        const extraOption = cats.includes(ownCategory) ? '' : `<option value="${escapeHtml(ownCategory)}" selected>${escapeHtml(ownCategory)} (not in list)</option>`;
        const catOptions = extraOption + cats.map(c => `<option value="${escapeHtml(c)}" ${ownCategory === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
        const isExcluded = e.excludeFromTotals || false;
        return `
        <div class="list-item" style="${isExcluded ? 'opacity:0.5;border-left:3px solid var(--red);' : ''}">
            <div class="left">
                <span class="meta">${escapeHtml(e.date || '')}</span>
                <select class="inline-edit expense-cat-select tag" onchange="updateExpense(${idx}, 'category', this.value)">${catOptions}</select>
                <input type="text" class="inline-edit expense-desc-input" value="${escapeHtml(e.description || '')}" 
                       placeholder="Description" onchange="updateExpense(${idx}, 'description', this.value)">
                ${e.deductible ? '<span class="tag deductible">💰 Deductible</span>' : ''}
                ${isExcluded ? '<span class="tag" style="background:rgba(239,68,68,0.15);color:var(--red);">⛔ Excluded</span>' : ''}
            </div>
            <div class="right">
                <span class="currency-input-wrap">
                    <span class="currency-prefix">$</span>
                    <input class="inline-edit amount-input red" type="number" step="0.01" value="${(e.amount || 0)}" 
                           onchange="updateExpense(${idx}, 'amount', this.value)" style="width:90px;">
                </span>
                <button class="btn btn-outline btn-sm" onclick="toggleExcludeExpense(${idx})" title="Toggle exclude from totals" style="font-size:12px;padding:2px 6px;border-color:${isExcluded ? 'var(--red)' : 'var(--border-light)'};">
                    ${isExcluded ? '⛔' : '⭕'}
                </button>
                <button class="delete-btn" onclick="deleteExpense(${idx})">✕</button>
            </div>
        </div>
    `;
    }).join('');
}

function toggleExcludeExpense(idx) {
    appData.expenses[idx].excludeFromTotals = !appData.expenses[idx].excludeFromTotals;
    updateUI();
}

function updateExpense(idx, field, value) {
    if (field === 'amount') {
        appData.expenses[idx][field] = parseFloat(value) || 0;
    } else {
        appData.expenses[idx][field] = value;
    }
    updateUI();
}

function addExpense() {
    const date = document.getElementById('expenseDate').value;
    const category = document.getElementById('expenseCategory').value;
    const description = document.getElementById('expenseDesc').value.trim() || category;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const deductible = document.getElementById('expenseDeductible').checked;
    if (!amount) return alert('Enter amount');
    appData.expenses.push({ date, category, description, amount, deductible, excludeFromTotals: false });
    document.getElementById('expenseDesc').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDeductible').checked = false;
    updateUI();
}

function deleteExpense(idx) { appData.expenses.splice(idx, 1); updateUI(); }

// ================================================================
// EXPENSE SUMMARY
// ================================================================

function renderExpenseSummary() {
    const container = document.getElementById('expenseSummary');
    const total = getFYExpenses().reduce((s, e) => s + (e.amount || 0), 0);
    if (total === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📊</div><div class="message">No expense data yet</div></div>`;
        return;
    }

    // Averages use completed months only (end-of-month bills included),
    // the same months as the dashboard and loan figures.
    const avg = getCompletedMonthsAverage();
    const monthlyAvg = avg ? avg.monthlyExpenses : null;
    const projected = monthlyAvg !== null ? monthlyAvg * 12 : null;
    const projectedNetIncome = getFYIncomeProjection().annual * (1 - getFYTaxRate());
    const expenseRatio = projected !== null && projectedNetIncome > 0 ? (projected / projectedNetIncome * 100) : null;
    const ratioColor = expenseRatio === null ? 'var(--text-muted)' : expenseRatio < 70 ? 'var(--green)' : expenseRatio < 85 ? 'var(--amber)' : 'var(--red)';
    const card = (label, value, color, sub) => `
            <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">${label}</div>
                <div style="font-size:20px;font-weight:600;color:${color};">${value}</div>
                ${sub ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${sub}</div>` : ''}
            </div>`;

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
            ${card('Total Spent', `$${total.toFixed(0)}`, 'var(--text-white)', 'this financial year')}
            ${card('Monthly Average', monthlyAvg !== null ? `$${monthlyAvg.toFixed(0)}` : '—', 'var(--amber)', avg ? `over ${avg.count} completed month${avg.count === 1 ? '' : 's'}` : 'needs a completed month')}
            ${card('Projected Annual', projected !== null ? `$${projected.toFixed(0)}` : '—', ratioColor, 'monthly average × 12')}
            ${card('% of Income', expenseRatio !== null ? `${expenseRatio.toFixed(1)}%` : '—', ratioColor, 'of projected after-tax pay')}
        </div>
    `;
}

// ================================================================
// COMPLETED-MONTH AVERAGE (weekly)
// ================================================================

function renderActualSnapshot() {
    const container = document.getElementById('actualSnapshot');
    const avg = getCompletedMonthsAverage();
    if (!avg) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📒</div><div class="message">Needs at least one completed month</div></div>`;
        return;
    }

    // Same pay (by payday), tax rate and months as the dashboard, shown
    // as an average week across all completed months rather than the
    // latest month alone.
    const perWeek = monthly => monthly * avg.count / avg.weeks;
    const weeklyIncome = perWeek(avg.monthlyGross);
    const weeklyTax = perWeek(avg.monthlyGross - avg.monthlyNet);
    const weeklyExpenses = perWeek(avg.monthlyExpenses);
    const weeklyDisposable = perWeek(avg.monthlySurplus);
    const card = (label, value, color) => `
            <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">${label}</div>
                <div style="font-size:20px;font-weight:600;color:${color};">${value}</div>
            </div>`;

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
            ${card('Average Weekly Pay', `$${weeklyIncome.toFixed(0)}`, 'var(--green)')}
            ${card('Average Weekly Expenses', `$${weeklyExpenses.toFixed(0)}`, 'var(--red)')}
            ${card('Average Weekly Tax', `$${weeklyTax.toFixed(0)}`, 'var(--amber)')}
            ${card('Average Weekly Left Over', `$${weeklyDisposable.toFixed(0)}`, weeklyDisposable >= 0 ? 'var(--green)' : 'var(--red)')}
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text-muted);">
            Average over ${avg.count} completed month${avg.count === 1 ? '' : 's'} (${escapeHtml(avg.label)}): pay counted when it landed, tax at ${(getFYTaxRate() * 100).toFixed(1)}%.
            The dashboard's "Real" figure uses these same months.
        </div>
        ${avg.monthsWithoutPay.length ? `<div style="margin-top:6px;font-size:12px;color:var(--amber);">⚠ No pay logged for ${avg.monthsWithoutPay.join(', ')} - these averages will be too low until those weeks are entered on the Income tab.</div>` : ''}
    `;
}

// ================================================================
// CATEGORY MONTHLY AVERAGE
// ================================================================

function renderCategoryMonthlyAverage() {
    const container = document.getElementById('categoryMonthlyAverage');
    const cats = getSpendingCategories();
    const unlisted = new Set(getUnlistedCategories());
    const budgets = appData.budgets || {};

    const completed = getCompletedFYMonths();
    if (completed.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><div class="message">Needs at least one completed month</div></div>`;
        return;
    }
    const keys = new Set(completed.map(m => m.key));
    const totals = sumExpensesByCategory(getFYExpenses().filter(e => keys.has(monthKey(parseLocalDate(e.date)))));

    const rows = cats.map(cat => {
        const avg = (totals[cat] || 0) / completed.length;
        const budget = budgets[cat] || 0;
        const diff = avg - budget;
        const diffLabel = budget > 0
            ? `${diff > 0 ? '+' : diff < 0 ? '-' : ''}$${Math.abs(diff).toFixed(0)}`
            : '—';
        const diffColor = budget === 0 ? 'var(--text-muted)' : diff > 0 ? 'var(--red)' : 'var(--green)';
        return `
            <tr>
                <td style="text-align:left;font-weight:600;color:${unlisted.has(cat) ? 'var(--amber)' : 'var(--text-primary)'};" ${unlisted.has(cat) ? 'title="Not in your category list - counted in totals but has no budget. Add it to your list, or move these expenses to another category."' : ''}>${escapeHtml(cat)}${unlisted.has(cat) ? ' *' : ''}</td>
                <td>$${avg.toFixed(0)}</td>
                <td>${budget > 0 ? '$' + budget.toFixed(0) : '-'}</td>
                <td style="color:${diffColor};font-weight:600;">${diffLabel}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="mbh-scroll">
            <table class="mbh-table" style="width:100%;">
                <thead>
                    <tr>
                        <th class="mbh-cat-header">Category</th>
                        <th>Avg / Month</th>
                        <th>Budget</th>
                        <th>Difference</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">Over ${completed.length} completed month${completed.length === 1 ? '' : 's'}.</div>
    `;
}
