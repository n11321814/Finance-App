// ================================================================
// STATS - Dashboard stats calculations (supports PH rates)
// ================================================================

// The "Living in Home Cost" box adds up exactly these categories
const LIVING_IN_HOME_CATEGORIES = ['Food', 'Living'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function updateStats() {
    try {
        // Average hours and pay over finished weeks only, so this week and
        // the upcoming week (added each Monday, still empty) don't drag
        // them down - the same weeks the per-job averages use
        const thisWeek = toLocalISODate(getThursdayThisWeek());
        const finished = (appData.income || []).filter(w => w.date < thisWeek);
        const incomeWeeks = finished.length ? finished : (appData.income || []);
        const numIncomeWeeks = Math.max(1, incomeWeeks.length);
        let totalIncome = 0;
        incomeWeeks.forEach(week => {
            (week.shifts || []).forEach(s => { totalIncome += shiftPay(s); });
        });

        const avgWeeklyIncome = totalIncome / numIncomeWeeks;
        // Logged so far + expected for the rest of the FY (jobs with start
        // and end dates, like Theiss, only count while they're active).
        const projectedIncome = getFYIncomeProjection().annual;
        const taxRate = getFYTaxRate();
        const totalMonthlyBudget = getTotalMonthlyBudget();

        // REAL: the average of every *completed* month this FY so far (the
        // current month joins on the 1st of the next month, once its
        // end-of-month bills have landed). BUDGET: the same months' pay with
        // your budget as the spending, so the only difference between the
        // two is spending vs budget.
        let realWeeklyDisposable = 0, realExpensePercent = 0;
        let projectedWeeklyDisposable = 0, projectedExpensePercent = 0;
        let realLabel = 'no full month yet';
        let realWarning = '';

        const avg = getCompletedMonthsAverage();
        if (avg) {
            const totalNet = avg.monthlyNet * avg.count;
            const totalExpenses = avg.monthlyExpenses * avg.count;
            const totalBudget = totalMonthlyBudget * avg.count;

            realWeeklyDisposable = (totalNet - totalExpenses) / avg.weeks;
            realExpensePercent = totalNet > 0 ? (totalExpenses / totalNet * 100) : 0;
            projectedWeeklyDisposable = (totalNet - totalBudget) / avg.weeks;
            projectedExpensePercent = totalNet > 0 ? (totalBudget / totalNet * 100) : 0;

            const first = avg.months[0], last = avg.months[avg.count - 1];
            realLabel = avg.count === 1 ? `${SHORT_MONTHS[last.month]} avg` : `${SHORT_MONTHS[first.month]}–${SHORT_MONTHS[last.month]} avg`;
            if (avg.monthsWithoutPay.length) realWarning = ` <span style="color:var(--amber);" title="No pay logged for ${escapeHtml(avg.monthsWithoutPay.join(', '))}">⚠</span>`;
        }

        // Living in Home Cost: average monthly spend on Food + Living only,
        // over the same completed months as Real.
        let livingInHomeHtml = '<span class="currency">$</span>—';
        if (avg) {
            const keys = new Set(avg.months.map(m => m.key));
            const byCat = sumExpensesByCategory(getFYExpenses().filter(e => keys.has(monthKey(parseLocalDate(e.date)))));
            const parts = LIVING_IN_HOME_CATEGORIES.map(name => {
                // Match the category name regardless of capitals or stray spaces
                const total = Object.entries(byCat)
                    .filter(([cat]) => cat.trim().toLowerCase() === name.toLowerCase())
                    .reduce((s, [, v]) => s + v, 0);
                return { name, monthly: total / avg.count };
            });
            const monthly = parts.reduce((s, p) => s + p.monthly, 0);
            livingInHomeHtml = `<span class="currency">$</span>${Math.round(monthly).toLocaleString('en-AU')}<span style="font-size:11px;color:var(--text-muted);font-weight:500;">/mo</span>
                <div class="stat-sub">${parts.map(p => `${p.name} $${Math.round(p.monthly).toLocaleString('en-AU')}`).join(' + ')}</div>`;
        }

        // Net worth & hours
        const totalAssets = getTotalAssets();
        const totalLiabilities = (appData.liabilities || []).reduce((s, l) => s + (l.value || 0), 0);
        const netWorth = totalAssets - totalLiabilities;

        const totalHours = incomeWeeks.reduce((sum, w) => sum + (w.shifts || []).reduce((s, sh) => s + sh.hours, 0), 0);
        const avgHours = totalHours / numIncomeWeeks;

        // Update UI
        document.getElementById('avgHours').textContent = avgHours.toFixed(1);
        document.getElementById('avgWeeklyIncome').innerHTML = '<span class="currency">$</span>' + Math.round(avgWeeklyIncome).toLocaleString('en-AU');

        document.getElementById('weeklyDisposable').innerHTML = `
            <div class="stat-pair">
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);font-weight:600;">Real</div>
                    <div style="font-size:20px;font-weight:700;color:${realWeeklyDisposable >= 0 ? 'var(--green)' : 'var(--red)'};">${realWeeklyDisposable < 0 ? '-' : ''}$${Math.abs(realWeeklyDisposable).toFixed(0)}</div>
                    <div style="font-size:9px;color:var(--text-muted);">${realLabel}${realWarning}</div>
                </div>
                <div style="color:var(--text-muted);font-size:16px;font-weight:300;">/</div>
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);font-weight:600;">Budget</div>
                    <div style="font-size:20px;font-weight:700;color:${projectedWeeklyDisposable >= 0 ? 'var(--green)' : 'var(--red)'};">${projectedWeeklyDisposable < 0 ? '-' : ''}$${Math.abs(projectedWeeklyDisposable).toFixed(0)}</div>
                    <div style="font-size:9px;color:var(--text-muted);">on budget</div>
                </div>
            </div>
        `;

        document.getElementById('projectedIncome').innerHTML = '<span class="currency">$</span>' + Math.round(projectedIncome).toLocaleString('en-AU');
        document.getElementById('netWorth').innerHTML = (netWorth < 0 ? '-' : '') + '<span class="currency">$</span>' + Math.round(Math.abs(netWorth)).toLocaleString('en-AU');
        document.getElementById('livingInHomeCost').innerHTML = livingInHomeHtml;

        const statusEl = document.getElementById('budgetStatus');
        statusEl.innerHTML = `
            <div class="stat-pair">
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);font-weight:600;">Real</div>
                    <div style="font-size:20px;font-weight:700;color:${realExpensePercent < 60 ? 'var(--green)' : realExpensePercent < 80 ? 'var(--amber)' : 'var(--red)'};">${realExpensePercent.toFixed(0)}%</div>
                    <div style="font-size:9px;color:var(--text-muted);">${realLabel}${realWarning}</div>
                </div>
                <div style="color:var(--text-muted);font-size:16px;font-weight:300;">/</div>
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);font-weight:600;">Budget</div>
                    <div style="font-size:20px;font-weight:700;color:${projectedExpensePercent < 60 ? 'var(--green)' : projectedExpensePercent < 80 ? 'var(--amber)' : 'var(--red)'};">${projectedExpensePercent.toFixed(0)}%</div>
                    <div style="font-size:9px;color:var(--text-muted);">on budget</div>
                </div>
            </div>
        `;
    } catch(e) { console.warn('Stats update error:', e); }
}