// ================================================================
// PLANNING - when you can afford big purchases, and roughly how much a
// bank would lend you. Everything is worked out from data the app
// already has; the only things to type in are the purchases themselves.
// ================================================================

const PLAN_MONTHS_LIMIT = 240;

// Common bank serviceability rules (rough - each lender differs)
const BORROW_RATE_BUFFER = 0.03;       // APRA: assess at your rate + 3%
const BORROW_RENT_SHARE = 0.8;         // banks count ~80% of rent
const BORROW_DTI_CAP = 6;              // total debt up to ~6x gross income
const BORROW_LIVING_FLOOR = 1800;      // minimum monthly living costs banks assume for a single person (approx.)
const BORROW_LVR = 0.8;                // borrow up to 80% of property values without mortgage insurance
const BORROW_PURCHASE_COSTS = 0.05;    // stamp duty, legals etc. on a purchase (approx.)
const BORROW_FALLBACK_RATE = 6.5;      // % used if your home loan rate isn't set

function getPlanning() {
    return appData.planning;
}

// ================================================================
// MONTHLY SAVING
// ================================================================

// What you can expect to save each month from next month on: expected
// pay landing that month (after tax) less your average monthly spending.
// Beyond this financial year, the last three projected months repeat.
// Falls back to your real average when nothing is projected.
function getMonthlySavingForecast() {
    const avg = getCompletedMonthsAverage();
    const spending = avg ? avg.monthlyExpenses : getTotalMonthlyBudget();
    const taxRate = getFYTaxRate();
    const now = new Date();
    const firstMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const byMonth = {};
    getPayEvents().filter(e => e.payDate >= firstMonth && e.payDate <= FY_END).forEach(e => {
        const key = monthKey(e.payDate);
        byMonth[key] = (byMonth[key] || 0) + e.amount;
    });
    const months = [];
    for (let d = new Date(firstMonth); d <= FY_END; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        months.push((byMonth[monthKey(d)] || 0) * (1 - taxRate) - spending);
    }
    const tail = months.slice(-3);
    const later = tail.length ? tail.reduce((s, v) => s + v, 0) / tail.length : (avg ? avg.monthlySurplus : 0);
    return {
        realAverage: avg ? avg.monthlySurplus : null,
        months,                       // next month first, to 30 June
        later,                        // each month after that
        at: i => i < months.length ? months[i] : later
    };
}

// ================================================================
// BIG PURCHASES - bought in order as savings allow
// ================================================================

// Month by month from next month: savings grow by the monthly saving
// (less ongoing costs of things already bought), and each purchase is
// made as soon as the balance covers its cost and still leaves its
// buffer in the offset. Starts from your offset.
// When each purchase happens if you save `extra` more every month
function simulatePurchases(plan, forecast, extra = 0) {
    const goals = plan.goals || [];
    const now = new Date();
    let balance = Math.max(0, appData.loan?.offset || 0);
    let ongoing = 0, next = 0;
    const results = goals.map(g => ({ goal: g, month: null, date: null }));
    const buyWhilePossible = (date, i) => {
        while (next < goals.length && balance >= (goals[next].cost || 0) + (goals[next].buffer || 0)) {
            balance -= goals[next].cost || 0;
            ongoing += goals[next].ongoingMonthly || 0;
            results[next].month = i;
            results[next].date = date;
            next++;
        }
    };
    // Anything already affordable today
    buyWhilePossible(new Date(now.getFullYear(), now.getMonth(), 1), 0);
    for (let i = 1; i <= PLAN_MONTHS_LIMIT && next < goals.length; i++) {
        balance += forecast.at(i - 1) + extra - ongoing;
        buyWhilePossible(new Date(now.getFullYear(), now.getMonth() + i, 1), i);
    }
    return results;
}

function planPurchases(plan = getPlanning(), forecast = getMonthlySavingForecast()) {
    const results = simulatePurchases(plan, forecast);
    const startBalance = Math.max(0, appData.loan?.offset || 0);
    return { results, startBalance, monthly: forecast.at(0) };
}

function addGoal() {
    const name = document.getElementById('goalName').value.trim();
    const cost = parseFloat(document.getElementById('goalCost').value) || 0;
    if (!name) return alert('What is it? e.g. "New car"');
    if (cost <= 0) return alert('Enter roughly what it costs');
    getPlanning().goals.push({
        id: genId(), name, cost,
        buffer: parseFloat(document.getElementById('goalBuffer').value) || 0,
        ongoingMonthly: parseFloat(document.getElementById('goalOngoing').value) || 0
    });
    updateUI();
}

function updateGoal(id, field, value) {
    const g = getPlanning().goals.find(x => x.id === id);
    if (!g) return;
    if (field === 'name') g.name = value.trim() || g.name;
    else if (field === 'cost') g.cost = parseFloat(value) > 0 ? parseFloat(value) : g.cost;   // a cost is needed
    else g[field] = Math.max(0, parseFloat(value) || 0);
    updateUI();
}

function moveGoal(id, step) {
    const goals = getPlanning().goals;
    const i = goals.findIndex(x => x.id === id), j = i + step;
    if (i < 0 || j < 0 || j >= goals.length) return;
    [goals[i], goals[j]] = [goals[j], goals[i]];
    updateUI();
}

function removeGoal(id) {
    const plan = getPlanning();
    plan.goals = plan.goals.filter(x => x.id !== id);
    updateUI();
}

// ================================================================
// BORROWING POWER - a rough version of how banks assess a new loan
// ================================================================

// Yearly income at today's pace: each job's expected weekly pay x 52.
// Jobs that haven't started yet aren't counted (banks want payslips).
function getCurrentYearlyIncome() {
    const today = toLocalISODate();
    let total = 0;
    const notStarted = [];
    JOBS.forEach(job => {
        const s = getJobSettings(job.id);
        if (s.startDate && s.startDate > today) { notStarted.push(job.name); return; }
        if (s.endDate && s.endDate < today) return;
        total += expectedWeeklyPay(job.id) * 52;
    });
    return { total, notStarted };
}

// Your monthly living costs without the home loan repayment (your Home
// category includes the mortgage, which is counted separately).
function getLivingCostsExLoan() {
    const avg = getCompletedMonthsAverage();
    const spend = avg ? avg.monthlyExpenses : getTotalMonthlyBudget();
    return Math.max(0, spend - calculateMonthlyRepayment(appData.loan || {}));
}

function presentValue(payment, annualRate, months) {
    if (payment <= 0) return 0;
    const r = annualRate / 12;
    return r === 0 ? payment * months : payment * (1 - Math.pow(1 + r, -months)) / r;
}

function estimateBorrowing(b = getPlanning().borrowing) {
    const loan = appData.loan || {};
    const purpose = b.purpose === 'BUSINESS' ? 'BUSINESS' : 'PROPERTY';
    const income = b.income > 0 ? b.income : getCurrentYearlyIncome().total;
    const rent = purpose === 'PROPERTY' ? (b.rentWeekly || 0) * 52 * BORROW_RENT_SHARE : 0;
    const assessedIncome = income + rent;
    const tax = calculateTax(assessedIncome).total;
    const netMonthly = (assessedIncome - tax) / 12;
    const living = Math.max(b.livingMonthly > 0 ? b.livingMonthly : getLivingCostsExLoan(), BORROW_LIVING_FLOOR);
    // Other debts on the Net Worth page (car loan etc.) count too: their
    // balance towards the debt cap and an estimated repayment (over 5
    // years at 10%) against your monthly budget
    const otherDebts = (appData.liabilities || []).filter(l => l.name !== 'Home Loan').reduce((s, l) => s + (l.value || 0), 0);
    const existingDebt = (loan.currentBalance || 0) + otherDebts;
    const homeRate = loan.rate > 0 ? loan.rate : BORROW_FALLBACK_RATE;
    const existingRepayment = repaymentAt(loan.currentBalance || 0, homeRate / 100 + BORROW_RATE_BUFFER, remainingLoanMonths(loan));
    const otherRepayments = repaymentAt(otherDebts, 0.10, 60);
    const surplus = netMonthly - living - existingRepayment - otherRepayments;
    const newRate = (b.rate > 0 ? b.rate : homeRate + (purpose === 'BUSINESS' ? 1.5 : 0.3)) / 100;
    const termYears = purpose === 'BUSINESS' ? 15 : 30;
    const serviceability = presentValue(surplus, newRate + BORROW_RATE_BUFFER, termYears * 12);
    const dtiLimit = Math.max(0, BORROW_DTI_CAP * assessedIncome - existingDebt);
    const maxLoan = Math.max(0, Math.min(serviceability, dtiLimit));
    const homeValue = getPropertyValue();
    const usableEquity = Math.max(0, BORROW_LVR * homeValue - (loan.currentBalance || 0));
    const cash = b.cash || 0;
    // Property: the new loan covers price + costs less your cash, and all
    // debt stays within 80% of both properties' values
    const priceByLoan = (maxLoan + cash) / (1 + BORROW_PURCHASE_COSTS);
    const priceByEquity = (BORROW_LVR * homeValue - (loan.currentBalance || 0) + cash) / (1 + BORROW_PURCHASE_COSTS - BORROW_LVR);
    const maxPrice = Math.max(0, Math.min(priceByLoan, priceByEquity));
    return {
        purpose, income, rent, assessedIncome, tax, netMonthly, living, existingRepayment, otherDebts, otherRepayments, surplus,
        newRate, assessmentRate: newRate + BORROW_RATE_BUFFER, termYears, serviceability, dtiLimit, maxLoan,
        limitedBy: serviceability <= dtiLimit ? 'serviceability' : 'debt-to-income',
        homeValue, usableEquity, cash, maxPrice, priceLimitedBy: priceByLoan <= priceByEquity ? 'loan' : 'equity',
        // A business loan secured on your home is limited by the equity too
        businessSecured: Math.min(maxLoan, usableEquity)
    };
}

function updateBorrowing() {
    const b = getPlanning().borrowing;
    const num = id => Math.max(0, parseFloat(document.getElementById(id)?.value) || 0);
    b.purpose = document.getElementById('borrowPurpose').value;
    b.income = num('borrowIncome') || null;
    b.livingMonthly = num('borrowLiving') || null;
    // The rent box only shows for a property, so keep the rent when it's hidden
    if (document.getElementById('borrowRent')) b.rentWeekly = num('borrowRent');
    b.rate = num('borrowRate') || null;
    b.cash = num('borrowCash');
    updateUI();
}

// ================================================================
// RENDER
// ================================================================

function renderPlanning() {
    const container = document.getElementById('planningTracker');
    if (!container) return;
    const plan = getPlanning();
    const dollars = n => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-AU');
    const monthText = d => d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    const tile = (label, value, color, sub = '') => `<div class="tax-item"><div class="label">${label}</div><div class="value" style="color:${color};">${value}</div>${sub ? `<div class="label">${sub}</div>` : ''}</div>`;

    // ---- Big purchases ----
    const forecast = getMonthlySavingForecast();
    const p = planPurchases(plan, forecast);
    const soon = forecast.months.length ? forecast.months[0] : forecast.later;
    const goalsHtml = `<div class="mbh-scroll"><table class="mbh-table" style="width:100%;">
            <thead><tr><th class="mbh-cat-header">In order</th><th>Cost</th><th>Buffer</th><th>Running cost</th><th>Affordable</th><th style="text-align:left;min-width:200px;"></th><th></th></tr></thead>
            <tbody>${!plan.goals.length ? '<tr><td colspan="7" style="color:var(--text-muted);">Add something you\'re saving for below</td></tr>' : ''}${p.results.map((r, i) => {
                const g = r.goal;
                const when = r.date === null ? '<span style="color:var(--red);">not within 20 years</span>'
                    : r.month === 0 ? '<span style="color:var(--green);">now</span>'
                    : `<span>${monthText(r.date)}</span><div style="font-size:10px;color:var(--text-muted);">${r.month} month${r.month === 1 ? '' : 's'}</div>`;
                const barMonths = Math.max(12, ...p.results.map(x => x.month ?? 0));
                const bar = r.date === null ? '' : `<div style="height:8px;border-radius:4px;background:${STOCK_LINE_COLORS[i % STOCK_LINE_COLORS.length]};width:${Math.max(2, (r.month / barMonths) * 100)}%;"></div>`;
                return `<tr>
                    <td class="mbh-cat-name"><input class="inline-edit" value="${escapeHtml(g.name)}" style="width:150px;" onchange="updateGoal('${g.id}', 'name', this.value)" /></td>
                    <td><input class="inline-edit" type="number" min="0" step="100" value="${g.cost}" style="width:90px;text-align:right;" onchange="updateGoal('${g.id}', 'cost', this.value)" /></td>
                    <td><input class="inline-edit" type="number" min="0" step="500" value="${g.buffer || ''}" placeholder="$0" style="width:80px;text-align:right;" title="Left in the offset after buying it" onchange="updateGoal('${g.id}', 'buffer', this.value)" /></td>
                    <td><input class="inline-edit" type="number" min="0" step="10" value="${g.ongoingMonthly || ''}" placeholder="$/mo" style="width:70px;text-align:right;" title="Running costs once you have it, e.g. rego, insurance, fuel" onchange="updateGoal('${g.id}', 'ongoingMonthly', this.value)" /></td>
                    <td>${when}</td>
                    <td style="text-align:left;">${bar}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="moveGoal('${g.id}', -1)" title="Buy earlier" ${i === 0 ? 'disabled' : ''}>↑</button>
                        <button class="btn btn-sm btn-outline" onclick="moveGoal('${g.id}', 1)" title="Buy later" ${i === plan.goals.length - 1 ? 'disabled' : ''}>↓</button>
                        <button class="delete-btn" onclick="removeGoal('${g.id}')" title="Delete">✕</button>
                    </td>
                </tr>`;
            }).join('')}</tbody></table></div>`;

    const purchasesHtml = `
        <div class="private" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px;">
            ${tile('Saving per month', dollars(p.monthly), p.monthly >= 0 ? 'var(--green)' : 'var(--red)', 'expected, next month')}
            ${tile('Your average so far', forecast.realAverage === null ? '—' : dollars(forecast.realAverage), 'var(--c-blue)', 'completed months')}
            ${tile('After June', dollars(forecast.later), 'var(--c-purple)', 'per month, if pay continues')}
            ${tile('Saved to start', dollars(p.startBalance), 'var(--c-cyan)', 'offset now')}
        </div>
        <div class="private">${goalsHtml}</div>
        <div class="form-row" style="margin-top:12px;">
            <input id="goalName" placeholder="e.g. New car" style="max-width:180px;" />
            <input id="goalCost" type="number" min="0" step="100" placeholder="Cost $" style="max-width:120px;" />
            <input id="goalBuffer" type="number" min="0" step="500" placeholder="Buffer $" title="Left in the offset after buying it" style="max-width:120px;" />
            <input id="goalOngoing" type="number" min="0" step="10" placeholder="Running cost $/mo" title="Optional, once you have it, e.g. rego, insurance" style="max-width:175px;" />
            <button class="btn btn-success" onclick="addGoal()">+ Add</button>
        </div>`;

    // ---- Borrowing power ----
    const b = plan.borrowing;
    const e = estimateBorrowing(b);
    const yearly = getCurrentYearlyIncome();
    const isProperty = e.purpose === 'PROPERTY';
    const field = (id, label, value, placeholder, step = 100) => `
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-muted);">${label}
            <input type="number" id="${id}" min="0" step="${step}" value="${value || ''}" placeholder="${placeholder}" onchange="updateBorrowing()" />
        </label>`;
    const row = (label, value, color = '') => `<tr><td class="mbh-cat-name">${label}</td><td style="${color ? `color:${color};` : ''}">${value}</td></tr>`;
    const borrowHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-muted);">For
                <select id="borrowPurpose" onchange="updateBorrowing()">
                    <option value="PROPERTY" ${isProperty ? 'selected' : ''}>Investment property</option>
                    <option value="BUSINESS" ${!isProperty ? 'selected' : ''}>Business</option>
                </select>
            </label>
            ${field('borrowIncome', 'Yearly income', b.income, Math.round(yearly.total).toLocaleString('en-AU'), 1000)}
            ${field('borrowLiving', 'Living costs /mo', b.livingMonthly, Math.round(getLivingCostsExLoan()).toLocaleString('en-AU'))}
            ${isProperty ? field('borrowRent', 'Expected rent /wk', b.rentWeekly, 'e.g. 550', 10) : ''}
            ${field('borrowRate', 'New loan rate %', b.rate, (e.newRate * 100).toFixed(2), 0.05)}
            ${field('borrowCash', 'Cash you\'d put in', b.cash, '0', 1000)}
        </div>
        <div class="private" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;">
            ${tile('Could borrow', dollars(e.maxLoan), 'var(--green)', `over ${e.termYears} yrs · limited by ${e.limitedBy}`)}
            ${isProperty
                ? tile('Property up to', dollars(e.maxPrice), 'var(--c-blue)', e.priceLimitedBy === 'equity' ? 'limited by your home equity' : 'incl. ~5% buying costs')
                : tile('Secured on your home', dollars(e.businessSecured), 'var(--c-blue)', 'loan using home equity')}
            ${tile('Usable home equity', dollars(e.usableEquity), 'var(--c-cyan)', `80% of ${dollars(e.homeValue)} less your loan`)}
            ${tile('Monthly surplus (assessed)', dollars(e.surplus), e.surplus > 0 ? 'var(--c-purple)' : 'var(--red)', `at ${(e.assessmentRate * 100).toFixed(2)}% test rate`)}
        </div>
        <div class="mbh-scroll private" style="margin-top:12px;"><table class="mbh-table" style="width:100%;min-width:420px;"><tbody>
            ${row('Income counted', dollars(e.assessedIncome) + '/yr' + (e.rent ? ` <span style="color:var(--text-muted);font-size:11px;">incl. 80% of rent</span>` : ''))}
            ${row('Tax', '-' + dollars(e.tax) + '/yr', 'var(--c-orange)')}
            ${row('Living costs', '-' + dollars(e.living) + '/mo' + (e.living === BORROW_LIVING_FLOOR ? ' <span style="color:var(--text-muted);font-size:11px;">(bank minimum)</span>' : ''), 'var(--c-orange)')}
            ${row('Your home loan, tested at +3%', '-' + dollars(e.existingRepayment) + '/mo', 'var(--c-orange)')}
            ${e.otherDebts ? row('Other debts (estimated repayment)', '-' + dollars(e.otherRepayments) + '/mo', 'var(--c-orange)') : ''}
            ${row('Left for a new loan', dollars(e.surplus) + '/mo', e.surplus > 0 ? 'var(--green)' : 'var(--red)')}
            ${row(`Debt cap (${BORROW_DTI_CAP}× income)`, dollars(e.dtiLimit) + ' more')}
        </tbody></table></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
            Rough guide using common bank rules.${yearly.notStarted.length ? ` ${escapeHtml(yearly.notStarted.join(', '))} isn't counted until you've started.` : ''} Casual income usually needs 6-12 months' history${isProperty ? '' : '; unsecured business loans are judged on the business\'s own figures'}.
        </div>`;

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><div class="card-title">Big Purchases</div><span class="badge">When you can afford it</span></div>
            ${purchasesHtml}
        </div>
        <div class="card">
            <div class="card-header"><div class="card-title">Borrowing Power</div><span class="badge">Estimate</span></div>
            ${borrowHtml}
        </div>`;
}
