// ================================================================
// FINANCE TRACKER - regression tests
//
// Run from the project folder:   node tests/run-tests.js
//
// Loads the real app code (js/*.js) with a fake page and made-up data,
// then checks the calculations every screen depends on. No personal
// data, no network (fetch is replaced). Exit code 1 if anything fails.
// ================================================================

process.env.TZ = 'Australia/Brisbane';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const MODULES = ['data.js', 'file.js', 'stats.js', 'charts.js', 'expenses.js', 'income.js', 'budgets.js', 'loan.js',
    'renovation.js', 'tax.js', 'networth.js', 'calendar.js', 'lists.js', 'shopping-data.js', 'shopping.js', 'meals-excel.js', 'backup-excel.js', 'weather-news.js', 'rate-tracker.js', 'investments.js', 'planning.js', 'summary.js', 'ui.js'];

// Data as the app would store it (normalised), for seeding the fake database
function normalizeForTest(app, raw) {
    app.ctx.__raw = raw;
    return JSON.parse(app.run('JSON.stringify(normalizeAppData(__raw))'));
}

// ---------- fake page ----------
function makeApp(nowIso, fetchImpl) {
    const RealDate = Date;
    class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(nowIso); else super(...a); }
        static now() { return new RealDate(nowIso).getTime(); }
    }
    const els = {};
    const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, querySelectorAll: () => [], addEventListener() {}, setAttribute() {} });
    const dialogs = [];
    const ctx = {
        console: { log() {}, warn: (...a) => ctx.__warnings.push(a.join(' ')), error() {} },
        __warnings: [],
        Math, Date: FakeDate, JSON, Object, Array, Set, Map, String, Number, Promise, URL, Response,
        parseFloat, parseInt, isNaN, isFinite, Infinity, encodeURIComponent, setTimeout, clearTimeout, AbortController,
        fetch: fetchImpl || (() => Promise.reject(new Error('no network in tests'))),
        confirm: m => { dialogs.push(m); return ctx.__confirmAnswer !== false; }, alert: m => { dialogs.push(m); },
        document: { getElementById: el, readyState: 'loading', addEventListener() {}, querySelectorAll: () => [] },
        localStorage: { clear() {}, getItem() { return null; }, setItem() {} }, window: {}
    };
    vm.createContext(ctx);
    for (const f of MODULES) vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), ctx, { filename: f });
    const run = code => vm.runInContext(code, ctx);
    const load = raw => { ctx.__raw = raw; ctx.__warnings.length = 0; run('appData = normalizeAppData(__raw); updateUI();'); };
    return { ctx, els, el, run, load, dialogs };
}

const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function thursdays(from, to) { const out = []; for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 7)) out.push(iso(d)); return out; }

// Made-up but realistic year: Avanale 8h @ $30 fortnightly, Cinema 10h @ $25 weekly,
// Theiss 38h @ $35 from 30 Nov, $1,500 home + $400 food every month.
function sampleData() {
    return {
        financialYear: 2026,
        income: thursdays(new Date(2026, 5, 18), new Date(2026, 9, 22)).map(w => ({
            week: 0, date: w, shifts: [{ job: 1, hours: 8, id: 'a' + w }, { job: 2, hours: 10, id: 'b' + w }]
        })),
        expenses: ['07', '08', '09', '10'].flatMap(mm => [
            { date: `2026-${mm}-01`, category: 'Home', amount: 1500, description: 'Mortgage' },
            { date: `2026-${mm}-10`, category: 'Food', amount: 400 }
        ]),
        categories: ['Home', 'Food'],
        budgets: { Home: 1500, Food: 420 },
        rates: { job1: 30, job2: 25, job3: 35 },
        phRates: { job1: 60, job2: 50, job3: 70 },
        jobSettings: {
            job1: { payFrequency: 'fortnightly', payAnchor: '2026-10-12', payLagDays: 5 },
            job2: { payFrequency: 'weekly', payLagDays: 5 },
            job3: { startDate: '2026-11-30', expectedWeeklyHours: 38, payFrequency: 'weekly', payLagDays: 5 }
        },
        loan: { initial: 560000, currentBalance: 500000, rate: 6.5, term: 30, offset: 20000, startDate: '2023-03-01' },
        assets: [{ name: 'House', value: 700000 }],
        liabilities: []
    };
}

// ---------- tiny test runner ----------
const results = [];
function test(name, fn) {
    try { fn(); results.push([true, name]); }
    catch (e) { results.push([false, name, e.message]); }
}
function eq(actual, expected, msg) { if (actual !== expected) throw new Error(`${msg || ''} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function near(actual, expected, tol, msg) { if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg || ''} expected ~${expected}, got ${actual}`); }
function ok(cond, msg) { if (!cond) throw new Error(msg || 'condition false'); }

// ================================================================
// DATES AND PAYDAYS
// ================================================================
{
    const app = makeApp('2026-10-29T08:00:00+10:00');
    app.load(sampleData());
    test('Week start is the Thursday on or before any date', () => {
        for (let dd = 22; dd <= 31; dd++) {
            const got = app.run(`toLocalISODate(getWeekStartDate(new Date(2026, 9, ${dd}, 8)))`);
            eq(got, dd < 29 ? '2026-10-22' : '2026-10-29', `Oct ${dd}:`);
        }
    });
    test('Today is the local date, not UTC (8am Brisbane)', () => eq(app.run('toLocalISODate()'), '2026-10-29'));
    test('30 June is inside the financial year', () => ok(app.run("isInFY('2027-06-30')") && !app.run("isInFY('2027-07-01')")));
    test('Avanale and Cinema are paid on the Wednesday that ends each week', () => {
        eq(app.run("toLocalISODate(getPayDate(1, '2026-10-15'))"), '2026-10-21');
        eq(app.run("toLocalISODate(getPayDate(2, '2026-10-15'))"), '2026-10-21');
        eq(app.run("toLocalISODate(getPayDate(1, '2026-10-29'))"), '2026-11-04');
    });
    test('Old pay-cycle settings in a file cannot override the Wednesday rule', () => {
        // sampleData() still has the old fortnightly/Monday settings for Avanale
        eq(app.run("appData.jobSettings.job1.payFrequency"), undefined);
        eq(app.run("toLocalISODate(getPayDate(1, '2026-10-08'))"), '2026-10-14');
    });
    test('Theiss pay cycle is still adjustable', () => {
        app.run("appData.jobSettings.job3 = { ...appData.jobSettings.job3, payFrequency: 'fortnightly', payAnchor: '2026-12-09', payLagDays: 0 }");
        eq(app.run("toLocalISODate(getPayDate(3, '2026-11-26'))"), '2026-12-09');
        eq(app.run("toLocalISODate(getPayDate(3, '2026-12-03'))"), '2026-12-09');
        eq(app.run("toLocalISODate(getPayDate(3, '2026-12-10'))"), '2026-12-23');
    });
}

// ================================================================
// TAX
// ================================================================
{
    const app = makeApp('2026-10-29T08:00:00+10:00');
    app.load(sampleData());
    const tax = n => app.run(`calculateTax(${n})`);
    test('Tax on $25,000: LITO applied, no Medicare', () => { near(tax(25000).total, 320, 0.5); eq(tax(25000).medicare, 0); });
    test('Tax on $40,000: partial LITO, full Medicare', () => near(tax(40000).total, 3495, 0.5));
    test('Tax on $60,000', () => near(tax(60000).total, 9620, 0.5));
    test('Tax on $90,000', () => near(tax(90000).total, 19320, 0.5));
    test('Medicare phases in above the threshold', () => near(tax(29000).medicare, (29000 - 27222) * 0.1, 0.01));
    test('Deductions from other years are ignored', () => {
        const raw = sampleData(); raw.expenses.push({ date: '2025-11-01', category: 'Food', amount: 1000, deductible: true });
        raw.expenses.push({ date: '2026-08-01', category: 'Food', amount: 300, deductible: true });
        app.load(raw);
        eq(app.run('getFYDeductibleTotal()'), 300);
    });
}

// ================================================================
// INCOME PROJECTION
// ================================================================
{
    const app = makeApp('2026-12-04T09:00:00+10:00');
    app.load(sampleData());
    test('Every logged dollar appears exactly once as a pay event', () =>
        near(app.run('getPayEvents().filter(e => e.actual).reduce((s, e) => s + e.amount, 0)'), app.run('getTotalIncome()'), 0.001));
    test('Theiss counts 3 of 5 days in its first week (starts Mon 30 Nov)', () => eq(app.run("jobWeekFraction(3, '2026-11-26')"), 0.6));
    test('Theiss is not active before its start week', () => ok(!app.run("isJobActiveInWeek(3, '2026-11-19')")));
    const before = app.run('getFYIncomeProjection().annual');
    test('Logging one shift only changes the projection by that job\'s difference', () => {
        const raw = sampleData(); raw.income.push({ week: 0, date: '2026-12-03', shifts: [{ job: 2, hours: 5, id: 'x' }] });
        app.load(raw);
        // Cinema's expected $250 for the week is replaced by the $125 actually logged
        near(app.run('getFYIncomeProjection().annual') - before, -125, 0.01);
    });
    test('Late-June work paid in July counts in the new year, not this one', () => {
        const ev = app.run("getPayEvents().filter(e => e.weekStart === '2026-06-25')");
        ok(ev.length > 0 && ev.every(e => e.payDate >= new Date(2026, 6, 1)));
    });
}

// ================================================================
// DASHBOARD
// ================================================================
{
    const app = makeApp('2026-11-02T09:00:00+10:00');
    app.load(sampleData());
    // Dollar amounts only (skips the year in labels like "Oct 2026")
    const nums = id => (strip(app.els[id].innerHTML).match(/-?\$-?[\d,.]+/g) || []).map(t => parseFloat(t.replace(/[$,]/g, '')));
    test('Real and Budget both average every completed month this FY', () => {
        const txt = strip(app.els.weeklyDisposable.innerHTML);
        ok(/Real \S+ Jul–Oct avg/.test(txt) && /Budget \S+ on budget/.test(txt), txt);
    });
    test('Spending under budget shows Real above Budget by exactly the difference', () => {
        const [real, budget] = nums('weeklyDisposable');
        // Jul-Oct: spent $1,900/month vs budget $1,920 -> $20 x 4 months over (31+31+30+31)/7 weeks
        near(real - budget, 80 / ((31 + 31 + 30 + 31) / 7), 0.6, 'Real - Budget');
    });
    test('Dashboard Real matches the Expenses page average week', () => {
        const [real] = nums('weeklyDisposable');
        const leftOver = Number(strip(app.els.actualSnapshot.innerHTML).match(/Average Weekly Left Over \$(-?[\d,]+)/)[1].replace(/,/g, ''));
        near(real, leftOver, 0.6);
    });
    test('A month joins the average on the 1st of the next month', () => {
        const before = makeApp('2026-10-31T23:00:00+10:00'); before.load(sampleData());
        const after = makeApp('2026-11-01T08:00:00+10:00'); after.load(sampleData());
        ok(/Jul–Sep avg/.test(strip(before.els.weeklyDisposable.innerHTML)), 'before');
        ok(/Jul–Oct avg/.test(strip(after.els.weeklyDisposable.innerHTML)), 'after');
    });
    test('Projected Theiss pay does not leak into the Budget figure', () => {
        const raw = sampleData(); raw.jobSettings.job3 = {};
        app.load(raw);
        const without = nums('weeklyDisposable');
        app.load(sampleData());
        const withTheiss = nums('weeklyDisposable');
        near(withTheiss[0] - withTheiss[1], without[0] - without[1], 1);
    });
    test('Living in Home Cost averages Food + Living only, over completed months', () => {
        const raw = sampleData();
        raw.categories.push('Living'); raw.budgets.Living = 400;
        raw.expenses.push({ date: '2026-08-14', category: 'Living', amount: 300 }, { date: '2026-09-14', category: 'living ', amount: 120 },
            { date: '2026-11-01', category: 'Living', amount: 999 });   // current month - not counted yet
        app.load(raw);
        // Food $400 x 4 months + Living $420 over Jul-Oct = $2,020 / 4 = $505/month
        const txt = strip(app.els.livingInHomeCost.innerHTML);
        ok(/\$ 505 \/mo Food \$400 \+ Living \$105$/.test(txt), txt);
    });
    test('Net worth in the top bar includes the loan straight after opening a file', () => {
        const raw = sampleData();
        raw.liabilities = [{ name: 'Home Loan', value: 520000 }];   // stale balance in the file
        app.load(raw);
        eq(strip(app.els.netWorth.innerHTML), '$ 220,000');          // House 700k + offset 20k - loan 500k
        app.load(sampleData());                                       // no Home Loan entry yet
        eq(strip(app.els.netWorth.innerHTML), '$ 220,000');
    });
    test('Monthly expenses chart: one column per month, budget line, current month marked', () => {
        app.load(sampleData());
        const html = app.els.monthlyExpensesChart.innerHTML;
        eq((html.match(/class="chart-bar/g) || []).length, 5, 'Jul-Nov columns');
        ok(/class="chart-bar partial"/.test(html) && /Nov \(so far\)/.test(html), 'current month faded and labelled');
        ok(/Budget \$1\.9K/.test(html), 'budget line labelled');
        app.run("setExpenseChartCategory('Food')");
        ok(/Budget \$420/.test(app.els.monthlyExpensesChart.innerHTML), 'category budget');
        app.run("toggleExpenseChartTable()");
        ok(/<td>\$400<\/td>/.test(app.els.monthlyExpensesChart.innerHTML), 'table view');
        app.run("toggleExpenseChartTable(); setExpenseChartCategory('All')");
    });
    test('A finished month with no pay logged is flagged', () => {
        const raw = sampleData(); raw.income = raw.income.filter(w => w.date < '2026-09-15');
        app.load(raw);
        ok(/No pay logged for/.test(app.els.weeklyDisposable.innerHTML), app.els.weeklyDisposable.innerHTML);
    });
}

// ================================================================
// EXPENSES PAGE AND BUDGET HISTORY
// ================================================================
{
    const app = makeApp('2026-11-02T09:00:00+10:00');
    const raw = sampleData(); raw.expenses.push({ date: '2026-11-01', category: 'Food', amount: 20 });
    app.load(raw);
    test('Monthly history average ignores the unfinished month', () => {
        const food = [...app.els.monthlyBudgetHistory.innerHTML.matchAll(/<tr>([^]*?)<\/tr>/g)].map(r => strip(r[1])).find(r => r.startsWith('Food'));
        ok(/\$400$/.test(food), food);
    });
    test('Category average uses completed months only', () => ok(/Food \$400 \$420 -\$20/.test(strip(app.els.categoryMonthlyAverage.innerHTML))));
    test('Expenses page monthly average matches completed months', () => ok(/Monthly Average \$1900/.test(strip(app.els.expenseSummary.innerHTML))));
    test('Average week and dashboard use the same tax rate', () => {
        const rate = app.run('getFYTaxRate()');
        ok(strip(app.els.actualSnapshot.innerHTML).includes(`tax at ${(rate * 100).toFixed(1)}%`));
    });
    test('Archived years average over their own 12 months', () => {
        const old = makeApp('2028-03-01T09:00:00+10:00');
        old.load(sampleData());
        eq(old.run('getCompletedFYMonths().length'), 12);
    });
}

// ================================================================
// CASH FLOW
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    const rows = [...app.els.cashFlowProjection.innerHTML.matchAll(/<tr[^>]*>([^]*?)<\/tr>/g)].slice(1)
        .map(r => strip(r[1]).replace(/⬅️/g, '').split(' ').filter(t => /^[+-]?\$|^–$/.test(t)).map(t => t === '–' ? 0 : Number(t.replace(/[$,+]/g, ''))));
    test('Every cash flow row adds up', () => {
        let running = 0;
        rows.slice(0, 12).forEach((v, i) => {
            const [gross, tax, net, home, food, expenses, surplus, run] = v;
            near(gross - tax, net, 2, `row ${i} gross-tax`);
            near(home + food, expenses, 2, `row ${i} categories`);
            near(net - expenses, surplus, 2, `row ${i} surplus`);
            running += surplus;
            near(running, run, 12, `row ${i} running`);
        });
    });
    test('FY total income equals the FY projection after tax', () => {
        const total = rows[12];
        near(total[0], app.run('getFYIncomeProjection().annual'), 2);
    });
}

// ================================================================
// HOME LOAN
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    test('Home and Rates tabs give the same repayment', () =>
        near(app.run('calculateMonthlyRepayment(appData.loan)'), app.run('refinanceComparison(0.065).currentRepayment'), 0.005));
    test('Repayment uses full balance over remaining term', () => {
        const months = app.run('remainingLoanMonths(appData.loan)'), r = 0.065 / 12;
        near(app.run('calculateMonthlyRepayment(appData.loan)'), 500000 * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1), 0.01);
    });
    test('Offset shortens the loan at the minimum repayment', () =>
        ok(app.run('simulateLoanPayoff(appData.loan, calculateMonthlyRepayment(appData.loan)).months') < app.run('remainingLoanMonths(appData.loan)')));
    test('A payment below the interest is never paid off', () => ok(!app.run('simulateLoanPayoff(appData.loan, 100).paidOff')));
    test('Extra repayment comes from completed months', () =>
        near(app.run('getMonthlyLoanSurplus()'), app.run('getCompletedMonthsAverage().monthlySurplus'), 0.001));
}

// ================================================================
// NET WORTH
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    test('Home loan appears once and tracks the loan balance', () => {
        const loans = app.run("appData.liabilities.filter(l => l.name === 'Home Loan')");
        eq(loans.length, 1); eq(loans[0].value, 500000);
    });
    test('Cannot add a second "Home Loan"', () => {
        app.el('liabilityName').value = 'home loan'; app.el('liabilityValue').value = '25000';
        app.run('addLiability()');
        eq(app.run("appData.liabilities.filter(l => /home loan/i.test(l.name)).length"), 1);
    });
    test('An existing duplicate is flagged, and editing it leaves the loan alone', () => {
        const raw = sampleData(); raw.liabilities = [{ name: 'Home Loan', value: 500000 }, { name: 'Home Loan', value: 25000 }];
        app.load(raw);
        ok(/second "Home Loan" entry/.test(app.els.liabilityList.innerHTML));
        app.run("updateLiability(1, 'value', '20000')");
        eq(app.run('appData.loan.currentBalance'), 500000);
    });
}

// ================================================================
// INCOME TAB SAFEGUARDS
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData(); raw.income.push({ week: 0, date: '2026-10-22', shifts: [{ job: 2, hours: 1, id: 'dup' }] });
    app.load(raw);
    test('Duplicate weeks are flagged', () => ok(/duplicate week/.test(app.els.incomeList.innerHTML)));
    test('Add Week does not create a second entry for this week', () => {
        app.load(sampleData());
        app.run('addEmptyWeek(); addEmptyWeek();');
        eq(app.run("appData.income.filter(w => w.date === '2026-11-12').length"), 1);
    });
}

// ================================================================
// SAFE DISPLAY OF YOUR TEXT
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const evil = 'Kid\'s <img src=x onerror=alert(1)> "stuff"';
    const raw = sampleData();
    raw.categories.push(evil); raw.budgets[evil] = 50;
    raw.expenses.push({ date: '2026-10-05', category: evil, description: evil, amount: 20 });
    raw.assets.push({ name: evil, value: 1 });
    raw.lists = [{ id: 'l1', name: evil, items: [{ id: 'i1', text: evil }] }];
    raw.events = [{ id: 'e1', title: evil, date: '2026-11-16', startTime: '09:00', endTime: '10:00', details: evil }];
    app.load(raw);
    app.run('renderCalendar(); renderEventList(); renderLists();');
    test('No user text is inserted as HTML anywhere', () => ok(!/<img src=x/.test(Object.values(app.els).map(e => e.innerHTML).join(''))));
    test('Buttons still work with an apostrophe in a name', () => {
        app.run(`updateBudget(${JSON.stringify(evil)}, '75')`);
        eq(app.run(`appData.budgets[${JSON.stringify(evil)}]`), 75);
    });
}

// ================================================================
// NEW FINANCIAL YEAR
// ================================================================
{
    const app = makeApp('2027-07-02T09:00:00+10:00');
    const raw = sampleData();
    raw.income = thursdays(new Date(2027, 4, 6), new Date(2027, 5, 24)).map(w => ({ week: 0, date: w, shifts: [{ job: 1, hours: 8, id: 'a' + w }, { job: 2, hours: 10, id: 'b' + w }] }));
    app.load(raw);
    const next = app.run('buildNewYearData(appData, 2027)');
    test('New year starts with no expenses', () => eq(next.expenses.length, 0));
    test('Only shifts paid on or after 1 July carry over', () => {
        const carried = next.income.flatMap(w => w.shifts.map(s => `${w.date} job${s.job}`));
        const expected = raw.income.flatMap(w => w.shifts.filter(s => app.run(`getPayDate(${s.job}, '${w.date}') >= new Date(2027, 6, 1)`)).map(s => `${w.date} job${s.job}`));
        eq(JSON.stringify(carried), JSON.stringify(expected));
    });
    test('Settings carry over', () => ok(next.budgets.Home === 1500 && next.rates.job1 === 30 && next.jobSettings.job3.startDate === '2026-11-30' && next.loan.currentBalance === 500000));
    test('Old files without a year are dated from their entries', () => {
        const r = sampleData(); delete r.financialYear;
        app.load(r);
        eq(app.run('appData.financialYear'), 2026);
    });
}

// ================================================================
// INVESTMENTS (prices and exchange rates simulated - no network)
// ================================================================
{
    // Simulated sources: today's rate 1.5; historical rates by date; Finnhub quotes
    const quotes = { AAPL: { c: 250, pc: 245, dp: 2.04, t: 1 }, MSFT: { c: 400, pc: 404, dp: -0.99, t: 1 }, SPY: { c: 600, pc: 600, dp: 0, t: 1 }, QQQ: { c: 500, pc: 500, dp: 0, t: 1 } };
    const pastRates = { '2025-04-11': 1.6, '2026-03-02': 1.4, '2026-11-13': 1.5 };
    const fxRequests = [];
    const fakeFetch = async url => {
        if (url.includes('frankfurter') && url.includes('/latest')) return new Response(JSON.stringify({ date: '2026-11-13', rates: { AUD: 1.5 } }));
        if (url.includes('frankfurter')) {
            const date = url.match(/v1\/(\d{4}-\d{2}-\d{2})/)[1];
            fxRequests.push(date);
            return new Response(JSON.stringify({ date, rates: { AUD: pastRates[date] || 1.5 } }));
        }
        if (url.includes('finnhub')) { const s = new URL(url).searchParams.get('symbol'); return new Response(JSON.stringify(quotes[s] || { c: 0 })); }
        return new Response('', { status: 404 });
    };
    const app = makeApp('2026-11-15T09:00:00+10:00', fakeFetch);
    const raw = sampleData();
    raw.investments = { apiKey: 'test', holdings: [
        { id: 'a1', symbol: 'AAPL', name: 'Apple', shares: 10, costPerShareUsd: 200, purchaseDate: '2025-04-11', purchaseFx: null, sold: null },
        { id: 'a2', symbol: 'AAPL', name: 'Apple', shares: 2, costPerShareUsd: 300, purchaseDate: '2026-03-02', purchaseFx: null, sold: null },
        { id: 'm1', symbol: 'MSFT', name: 'Microsoft', shares: 2.5, costPerShareUsd: null, purchaseDate: '', purchaseFx: null, sold: null }
    ] };
    app.load(raw);
    const done = app.run('refreshInvestmentPrices()');
    module.exports.pending = done.then(() => {
        const lot = id => app.run(`findLot('${id}')`);
        test('Each purchase is its own row with its own date', () => eq(app.run('getOpenLots().length'), 3));
        test('Purchase-date exchange rates are looked up (and only once per date)', () =>
            ok(lot('a1').purchaseFx === 1.6 && lot('a2').purchaseFx === 1.4 && fxRequests.filter(d => d === '2025-04-11').length === 1, JSON.stringify(fxRequests)));
        test('US$ gain is exact: (price - paid) x shares', () => near(app.run("getLotValue(findLot('a1')).gainUsd"), 10 * (250 - 200), 1e-9));
        test('A$ gain = value at today\'s rate - cost at the purchase-date rate', () =>
            near(app.run("getLotValue(findLot('a1')).gainAud"), 10 * 250 * 1.5 - 10 * 200 * 1.6, 1e-9));
        test('Portfolio value = shares x price x today\'s rate, all open purchases', () =>
            near(app.run('getInvestmentsValueAud()'), (12 * 250 + 2.5 * 400) * 1.5, 0.01));
        test('Gains only count purchases with a price entered', () =>
            near(app.run('getPortfolioSummary().gainUsd'), 10 * 50 + 2 * (-50), 1e-9));
        test('Net worth includes the portfolio', () => near(app.run('getTotalAssets()'), 700000 + 20000 + 6000, 0.01));
        test('Exchange rate comes from Frankfurter\'s current address (the old one is blocked by browsers)', () => {
            const urls = app.run('FX_SOURCES.map(s => s.url)');
            ok(urls[0].startsWith('https://api.frankfurter.dev/') && !urls.some(u => u.includes('frankfurter.app')), urls.join(', '));
        });
        test('Rows show A$ with US$ underneath, and the paid total in both', () => {
            const html = strip(app.els.investmentsTracker.innerHTML);
            ok(/A\$3,750\.00 US\$2,500\.00/.test(html) && /total US\$2,000\.00 · A\$3,200\.00 at 1\.6000/.test(html), html.slice(0, 600));
        });
        test('Snapshots record what is invested and the S&P 500 / Nasdaq-100 prices', () => {
            const h = app.run('appData.investments.history[appData.investments.history.length - 1]');
            ok(h.costUsd === 2600 && h.bench.SPY === 600 && h.bench.QQQ === 500, JSON.stringify(h));
        });

        // Selling
        app.run("toggleSold('a2', true)");
        test('Ticking Sold moves the purchase out of holdings, priced at today\'s price', () =>
            ok(app.run('getOpenLots().length') === 2 && lot('a2').sold.pricePerShareUsd === 250 && lot('a2').sold.date === '2026-11-15'));
        test('Sold purchases no longer count towards net worth', () => near(app.run('getInvestmentsValueAud()'), (10 * 250 + 2.5 * 400) * 1.5, 0.01));
        app.run("findLot('a2').sold.fx = 1.5; updateSold('a2', 'pricePerShareUsd', '320')");
        app.run("findLot('a2').sold.fx = 1.5");
        test('Realised gain uses the sale price and both dates\' rates', () => {
            const r = app.run("getSoldResult(findLot('a2'))");
            ok(Math.abs(r.gainUsd - 2 * (320 - 300)) < 1e-9 && Math.abs(r.gainAud - (2 * 320 * 1.5 - 2 * 300 * 1.4)) < 1e-9, JSON.stringify(r));
        });
        test('Sold section lists the sale', () => ok(/Sold/.test(app.els.investmentsTracker.innerHTML) && /Realised gain/.test(app.els.investmentsTracker.innerHTML)));
        // Fees from the broker confirmation (A$)
        app.run("toggleSold('a2', true); findLot('a2').sold.fx = 1.5; updateSold('a2', 'pricePerShareUsd', '320')");
        app.run("updateSold('a2', 'feesAud', '12')");
        test('Sale fees come off the proceeds (sale-date market rate)', () => {
            const r = app.run("getSoldResult(findLot('a2'))");
            near(r.proceedsAud, 2 * 320 * 1.5 - 12, 1e-9, 'proceeds');
            near(r.gainAud, 2 * 320 * 1.5 - 12 - 2 * 300 * 1.4, 1e-9, 'gain');
        });
        app.run("toggleSold('a2', false)");
        test('Unticking moves it back to holdings', () => ok(app.run('getOpenLots().length') === 3 && lot('a2').sold === null));

        app.run("updateLot('a1', 'feesAud', '10')");
        test('A$ fees add to the cost (at the purchase-date market rate)', () => {
            const c = app.run("getLotCost(findLot('a1'))");
            near(c.aud, 10 * 200 * 1.6 + 10, 1e-9, 'A$ cost');
            near(c.usd, 10 * 200 + 10 / 1.6, 1e-9, 'US$ cost');
        });
        test('Row shows the fees', () => {
            const html = strip(app.els.investmentsTracker.innerHTML);
            ok(/A\$3,210\.00 at 1\.6000 incl\. A\$10\.00 fees/.test(html) && !/Your rate/i.test(html), html.slice(0, 900));
        });
        app.run("updateLot('a1', 'feesAud', '')");
        test('Clearing fees goes back to no fees', () =>
            near(app.run("getLotCost(findLot('a1')).aud"), 10 * 200 * 1.6, 1e-9));
        test('A rate saved by the old rate box is ignored', () => {
            const r3 = sampleData();
            r3.investments = { holdings: [{ id: 'z', symbol: 'AAPL', shares: 1, costPerShareUsd: 100, purchaseDate: '2026-03-02', purchaseFx: 1.4, paidFx: 1.4124, sold: { date: '2026-11-13', pricePerShareUsd: 120, fx: 1.5, paidFx: 0.708 } }] };
            const z = makeApp('2026-11-15T09:00:00+10:00'); z.load(r3);
            const h = z.run('appData.investments.holdings[0]');
            ok(!('paidFx' in h) && !('paidFx' in h.sold), JSON.stringify(h));
            near(z.run('getSoldResult(appData.investments.holdings[0]).gainAud'), 120 * 1.5 - 100 * 1.4, 1e-9);
        });

        // Adding
        app.el('invSymbol').value = 'aapl'; app.el('invShares').value = '1'; app.el('invCost').value = '310'; app.el('invDate').value = '2026-11-13';
        app.run('addHolding()');
        test('Adding a purchase creates a new row with its US$ price and date', () => {
            const added = app.run("appData.investments.holdings[appData.investments.holdings.length - 1]");
            ok(added.symbol === 'AAPL' && added.costPerShareUsd === 310 && added.purchaseDate === '2026-11-13' && added.name === 'Apple', JSON.stringify(added));
            ok(added.feesAud === null, 'fees optional');
        });
        app.el('invFees').value = '9.90';
        app.run('addHolding()');
        test('Adding a purchase can include fees', () => {
            const added = app.run("appData.investments.holdings[appData.investments.holdings.length - 1]");
            ok(added.feesAud === 9.9 && !('paidFx' in added), JSON.stringify(added));
        });
        app.el('invDate').value = '2027-01-01';
        const before = app.run('appData.investments.holdings.length');
        app.run('addHolding()');
        test('A purchase date in the future is refused', () => eq(app.run('appData.investments.holdings.length'), before));

        // Old files
        const other = makeApp('2026-11-15T09:00:00+10:00');
        const r2 = sampleData(); r2.investments = { holdings: [{ symbol: 'AAPL', shares: 2, costAud: 400.1 }, { symbol: 'NVDA', shares: 1, costPerShareAud: 250 }] };
        other.load(r2);
        test('Old A$ entries become purchases with the US$ price to fill in (A$ kept as a reminder)', () => {
            const [a, n] = other.run('appData.investments.holdings');
            ok(a.id && a.costPerShareUsd === null && Math.abs(a.legacyCostPerShareAud - 200.05) < 1e-9 && n.legacyCostPerShareAud === 250 && a.sold === null, JSON.stringify([a, n]));
            ok(/was A\$200\.05\/share/.test(other.els.investmentsTracker.innerHTML));
        });

        // Performance comparison
        const cmp = makeApp('2026-11-15T09:00:00+10:00');
        test('Index comparison: same money into the ETF, adding when you add and selling when you sell', () => {
            const pts = cmp.run(`addBenchmarkValues([
                { costUsd: 1000, usdAud: 1.5, bench: { SPY: 100, QQQ: 50 } },
                { costUsd: 1000, usdAud: 1.5, bench: { SPY: 110, QQQ: 50 } },
                { costUsd: 2000, usdAud: 1.5, bench: { SPY: 100, QQQ: 50 } },
                { costUsd: 1000, usdAud: 1.5, bench: { SPY: 100, QQQ: 50 } }
            ])`);
            // 10 units; +10% -> A$1,650; +1000 at $100 -> 20 units at $100 = A$3,000; half sold -> 10 units = A$1,500
            near(pts[1].bench_SPY, 10 * 110 * 1.5, 1e-9);
            near(pts[2].bench_SPY, 20 * 100 * 1.5, 1e-9);
            near(pts[3].bench_SPY, 10 * 100 * 1.5, 1e-9);
        });
    });
}

// ================================================================
// RATES TAB: loan features, fees and limits (bank replies simulated)
// ================================================================
{
    // One variable product (offset only on variable, v6 fee format), one fixed
    // product with a $10k/yr extra repayment cap (old fee format), and a
    // special-eligibility loan that should be left out.
    const products = {
        p1: { productId: 'p1', name: 'Offset Home Loan',
            lendingRates: [{ lendingRateType: 'VARIABLE', rate: '0.0589', loanPurpose: 'OWNER_OCCUPIED', repaymentType: 'PRINCIPAL_AND_INTEREST' },
                { lendingRateType: 'FIXED', rate: '0.0549', additionalValue: 'P2Y', loanPurpose: 'OWNER_OCCUPIED', repaymentType: 'PRINCIPAL_AND_INTEREST' }],
            features: [{ featureType: 'OFFSET', additionalInfo: 'Offset accounts can only be linked to variable rate loans.' },
                { featureType: 'REDRAW', additionalInfo: 'Redraw extra repayments.' },
                { featureType: 'EXTRA_REPAYMENTS', additionalInfo: 'Free extra repayments.' }],
            fees: [{ name: 'Annual Package Fee', feeType: 'PERIODIC', additionalValue: 'P1Y', fixedAmount: { amount: '248.00' } },
                { name: 'Monthly Fee', feeType: 'PERIODIC', additionalValue: 'P1M', fixedAmount: { amount: '10.00' } },
                { name: 'Settlement Fee', feeType: 'UPFRONT', fixedAmount: { amount: '350.00' } },
                { name: 'Discharge Fee', feeType: 'EXIT', fixedAmount: { amount: '300.00' } },
                { name: 'Break Cost', feeType: 'OTHER', variable: {} }],
            constraints: [{ constraintType: 'MIN_LIMIT', additionalValue: '150000.00' }, { constraintType: 'MAX_LIMIT', additionalValue: '3000000.00' }],
            additionalInformation: { overviewUri: 'https://bank.example/offset' } },
        p2: { productId: 'p2', name: 'Fixed Rate Loan',
            lendingRates: [{ lendingRateType: 'FIXED', rate: '0.0559', additionalValue: 'P3Y', loanPurpose: 'OWNER_OCCUPIED', repaymentType: 'PRINCIPAL_AND_INTEREST' }],
            features: [{ featureType: 'EXTRA_REPAYMENTS', additionalInfo: "It's free to make additional repayments (less than $10,000 per settlement anniversary)." }],
            fees: [{ name: 'Annual fee', feeType: 'PERIODIC', additionalValue: 'P1Y', amount: '0.00' }, { name: 'Settlement fee', feeType: 'UPFRONT', amount: '350.00' }] },
        p3: { productId: 'p3', name: 'Defence Force Home Loan',
            lendingRates: [{ lendingRateType: 'VARIABLE', rate: '0.0499', loanPurpose: 'OWNER_OCCUPIED', repaymentType: 'PRINCIPAL_AND_INTEREST' }] }
    };
    const versionsAsked = [];
    const fakeFetch = async (url, opts) => {
        const v = opts?.headers?.['x-v'];
        versionsAsked.push(v);
        if (v === '7' || v === '6') return new Response('', { status: 406 });   // older bank
        const id = (url.match(/products\/([^?]+)$/) || [])[1];
        if (id) return new Response(JSON.stringify({ data: products[id] }));
        return new Response(JSON.stringify({ data: { products: Object.values(products).map(p => ({ productId: p.productId, name: p.name })) }, links: {} }));
    };
    const app = makeApp('2026-11-15T09:00:00+10:00', fakeFetch);
    const raw = sampleData();
    raw.rateTracker = { lenders: [{ name: 'Test Bank', baseUri: 'https://bank.example', enabled: true }], propertyValue: 800000, costs: { currentAnnualFee: 395 } };
    app.load(raw);
    const ratesDone = app.run('refreshRates()').then(() => {
        const latest = app.run('getRateTracker().latest');
        const d = latest.details['Test Bank|Offset Home Loan'];
        test('Banks that refuse the newest standard version are asked for an older one', () =>
            ok(versionsAsked[0] === '7' && versionsAsked.includes('5') && latest.rates.length === 3, JSON.stringify(versionsAsked.slice(0, 4))));
        test('Special-eligibility loans are left out', () =>
            ok(!latest.rates.some(r => /Defence/.test(r.product)) && app.run("findRestriction({ name: 'Sustainable Upgrades Home Loan' })") && !app.run("findRestriction({ name: 'Flexi First: Our lowest online variable home loan rate' })")));
        test('Loan details: offset, redraw, extra repayments, loan size, link', () =>
            ok(d.offset && d.redraw && d.extraRepayments && d.minLoan === 150000 && d.maxLoan === 3000000 && d.url === 'https://bank.example/offset', JSON.stringify(d)));
        test('Fees: annual = yearly + monthly x 12, upfront and exit totals, both fee formats', () => {
            eq(d.annualFee, 248 + 120, 'annual');
            eq(d.upfrontFees, 350, 'upfront');
            eq(d.exitFees, 300, 'exit');
            ok(d.fees.find(f => f.name === 'Break Cost').amount === null, 'variable fee kept without an amount');
            eq(latest.details['Test Bank|Fixed Rate Loan'].upfrontFees, 350, 'old format');
        });
        test('Offset that only works on variable rates isn\'t shown for the fixed rate', () =>
            ok(app.run("hasOffset(getRateTracker().latest.details['Test Bank|Offset Home Loan'], 'VARIABLE')")
                && !app.run("hasOffset(getRateTracker().latest.details['Test Bank|Offset Home Loan'], 'FIXED')")));
        test('Fixed-rate extra repayment cap is picked out of the lender\'s note', () =>
            eq(app.run("extraRepaymentLabel(getRateTracker().latest.details['Test Bank|Fixed Rate Loan'], 'FIXED')"), 'up to $10,000/yr'));
        test('A fixed-rate cap in the note is not shown on variable loans', () =>
            eq(app.run("extraRepaymentLabel({ extraRepayments: true, extraNote: 'Extra repayments allowed. Note: on your fixed home loan up to $10,000 each year without penalty.' }, 'VARIABLE')"), 'yes'));
        test('Comparing a loan fills in its upfront fees', () => {
            const sel = app.run('getRateTracker().selectedRate');
            ok(sel.product === 'Offset Home Loan' && app.run('getRateTracker().costs.newLoanFees') === 350, JSON.stringify(sel));
        });
        test('Annual fee difference = this loan\'s fees - your current annual fee', () =>
            near(app.run("refinanceComparison(0.0589, getSelectedDetails(), 'VARIABLE').annualFeeDiff"), 368 - 395, 1e-9));
        test('A loan with no offset or redraw loses your offset\'s interest saving', () => {
            const none = { offset: false, redraw: false, annualFee: 395, offsetNote: '' };   // same fee as yours
            app.ctx.__none = none;
            const withOffset = app.run('refinanceComparison(0.0589, null).monthlySaving');
            const without = app.run('refinanceComparison(0.0589, __none).monthlySaving');
            const loan = app.run('appData.loan');
            near(withOffset - without, loan.offset * 0.0589 / 12, 1e-6);
        });
        test('Table shows offset, extra repayments and fees, with a details row', () => {
            app.run("setRateFilter('FIXED'); toggleRateDetails('Test Bank|Fixed Rate Loan')");
            const html = strip(app.els.rateTracker.innerHTML);
            ok(/up to \$10,000\/yr/.test(html) && /\$0\/yr \$350 upfront/.test(html) && /Fees: Annual fee - \$0/.test(html) && !/special-eligibility/i.test(html), html.slice(0, 1500));
            app.run("toggleRateDetails('Test Bank|Fixed Rate Loan'); setRateFilter('VARIABLE')");
        });
        test('Side by side: pick two loans; a third replaces the older one', () => {
            app.run('toggleSideBySide(0); toggleSideBySide(1)');
            eq(app.run('getRateTracker().sideBySide.length'), 2, 'two');
            app.run('toggleSideBySide(2)');
            const now = app.run('getRateTracker().sideBySide'), rates = app.run('getRateTracker().latest.rates');
            ok(now.length === 2 && now[0].rate === rates[1].rate && now[1].rate === rates[2].rate, JSON.stringify(now));
            ok(/Side by Side/.test(app.els.rateTracker.innerHTML) && /\/yr cheaper|about the same/.test(strip(app.els.rateTracker.innerHTML)), 'card shows a verdict');
            app.run('clearSideBySide()');
        });
        test('Side by side maths: yearly cost and when the cheaper loan catches up on upfront fees', () => {
            const v = app.run('compareTwoLoans({ yearly: 30000, upfront: 0 }, { yearly: 29400, upfront: 900 })');
            ok(v.cheaper === 'B' && v.perYear === 600 && v.catchUpMonths === 18, JSON.stringify(v));
            const loan = app.run('appData.loan');
            near(app.run("loanCostForYou({ rate: 0.06, type: 'VARIABLE' }, { offset: false, redraw: false, annualFee: 0, upfrontFees: 0, offsetNote: '' }).interest"), loan.currentBalance * 0.06, 1e-6, 'no offset = full balance');
            near(app.run("loanCostForYou({ rate: 0.06, type: 'VARIABLE' }, { offset: true, redraw: true, annualFee: 300, upfrontFees: 0, offsetNote: '' }).yearly"), (loan.currentBalance - loan.offset) * 0.06 + 300, 1e-6, 'offset + fee');
        });
    });
    module.exports.pending = Promise.all([module.exports.pending, ratesDone]);
}

// Hide figures: every element the blur rule names exists on the page
// (a typo would silently leave that figure visible)
{
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const rule = /body\.privacy :is\(([\s\S]*?)\)\s*\{/.exec(css);
    test('Hide figures: every blurred element exists in the page', () => {
        ok(rule, 'rule found');
        const ids = rule[1].match(/#[\w-]+/g);
        const missing = ids.filter(id => !html.includes('id="' + id.slice(1) + '"'));
        ok(ids.length > 20 && missing.length === 0, 'missing: ' + missing.join(', '));
        ok(html.includes('id="privacyBtn"'), 'button');
    });
}

// ================================================================
// PLANNING: big purchases, borrowing power, end-of-year summary
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.loan.offset = 20000;
    raw.planning = { buffer: 4000, goals: [             // older file: one buffer for the plan
        { id: 'g1', name: 'Car', cost: 20000, ongoingMonthly: 200, wantedBy: '' },
        { id: 'g2', name: 'Holiday', cost: 5000, ongoingMonthly: 0, wantedBy: '2027-07-15' }
    ] };
    app.load(raw);
    // A steady $1,000 a month saved, to keep the maths simple
    const steady = '{ months: [], later: 1000, realAverage: 1000, at: () => 1000 }';
    test('Big purchases: bought in order once savings cover them, ongoing costs slow the next one', () => {
        const p = app.run('planPurchases(getPlanning(), ' + steady + ')');
        eq(p.startBalance, 20000, 'offset');
        eq(p.results[0].month, 4, 'car: 20k + 4 x 1k covers 20k and its 4k buffer');
        eq(p.results[1].month, 11, 'holiday: 5k + 4k buffer at 800/mo after the car = 7 more months (4k left after the car)');
    });
    test('Big purchases: an older file\'s plan buffer moves onto each purchase', () => {
        ok(app.run("getPlanning().goals.every(g => g.buffer === 4000) && getPlanning().buffer === undefined"), JSON.stringify(app.run('getPlanning()')));
    });
    test('Big purchases: each purchase has its own buffer', () => {
        app.run("getPlanning().goals[0].buffer = 0; getPlanning().goals[1].buffer = 10000;");
        const p = app.run('planPurchases(getPlanning(), ' + steady + ')');
        eq(p.results[0].month, 0, 'car: 20k offset covers it now with no buffer');
        eq(p.results[1].month, 19, 'holiday: from 0, 800/mo until 15k (5k + 10k buffer)');
        app.run("getPlanning().goals.forEach(g => g.buffer = 4000)");
    });
    test('Expected saving includes pay that has not started yet (Theiss from 30 Nov)', () => {
        const f = app.run('getMonthlySavingForecast()');
        ok(f.months[1] > f.realAverage + 1000, JSON.stringify([f.months.slice(0, 3), f.realAverage]));
    });
    test('Planning tab lists the purchases with when they are affordable', () => {
        const html = strip(app.els.planningTracker.innerHTML);
        ok(/Big Purchases/.test(html) && /Borrowing Power/.test(html) && /Running cost/.test(html) && !/Wanted by/.test(html), html.slice(0, 600));
        ok(/Buffer/.test(html) && /updateGoal\('g1', 'buffer'/.test(app.els.planningTracker.innerHTML) && !/planBuffer/.test(app.els.planningTracker.innerHTML), 'buffer is part of each purchase');
        ok(!/Plan with/.test(html) && !/planMonthly/.test(app.els.planningTracker.innerHTML), 'no monthly override');
    });

    // Borrowing power
    test('Borrowing: jobs not started yet are left out of income', () => {
        const y = app.run('getCurrentYearlyIncome()');
        ok(y.notStarted.includes('Theiss') && y.total > 0, JSON.stringify(y));
    });
    test('Borrowing: test rate +3%, 80% of rent, bank minimum living costs, smaller of the two limits', () => {
        app.run("Object.assign(getPlanning().borrowing, { purpose: 'PROPERTY', income: 90000, livingMonthly: 1000, rentWeekly: 500, rate: 6.5, cash: 0 })");
        const e = app.run('estimateBorrowing()');
        near(e.rent, 500 * 52 * 0.8, 1e-9, 'rent');
        eq(e.living, 1800, 'bank minimum');
        near(e.assessmentRate, 0.095, 1e-12, 'rate + 3%');
        near(e.surplus, (90000 + e.rent - app.run('calculateTax(' + (90000 + e.rent) + ').total')) / 12 - 1800 - e.existingRepayment, 1e-6, 'surplus');
        near(e.maxLoan, Math.min(e.serviceability, e.dtiLimit), 1e-9, 'limit');
        ok(e.maxPrice > 0 && e.maxPrice * 1.05 <= e.maxLoan + 1e-6, 'price within the loan');
    });
    test('Borrowing: no surplus means nothing to borrow', () => {
        app.run("Object.assign(getPlanning().borrowing, { income: 30000, livingMonthly: 3000, rentWeekly: 0 })");
        eq(app.run('estimateBorrowing().maxLoan'), 0);
    });

    // Capital gains and the summary
    const app2 = makeApp('2026-11-15T09:00:00+10:00');
    const r2 = sampleData();
    r2.investments = { fx: { usdAud: 1.5 }, holdings: [
        { id: 'l', symbol: 'AAA', shares: 10, costPerShareUsd: 100, purchaseDate: '2025-07-01', purchaseFx: 1.5, sold: { date: '2026-09-01', pricePerShareUsd: 100 + 1000 / 15, fx: 1.5 } },
        { id: 's1', symbol: 'BBB', shares: 4, costPerShareUsd: 100, purchaseDate: '2026-08-01', purchaseFx: 1.5, sold: { date: '2026-09-01', pricePerShareUsd: 50, fx: 1.5 } },   // A$600 -> A$300
        { id: 's2', symbol: 'CCC', shares: 1, costPerShareUsd: 100, purchaseDate: '2026-08-01', purchaseFx: 1.5, sold: { date: '2026-09-01', pricePerShareUsd: 100 + 200 / 1.5, fx: 1.5 } },
        { id: 'old', symbol: 'DDD', shares: 1, costPerShareUsd: 100, purchaseDate: '2025-01-01', purchaseFx: 1.5, sold: { date: '2026-03-01', pricePerShareUsd: 900, fx: 1.5 } }
    ] };
    r2.expenses.push({ date: '2026-08-05', category: 'Work', amount: 250, deductible: true });
    app2.load(r2);
    test('Capital gains: losses come off short-term gains first, then 50% discount on the rest', () => {
        const c = app2.run('getFYCapitalGains()');
        // long +1,000 (held > 12 months), short loss -300, short gain +200; last year's sale ignored
        near(c.longGains, 1000, 1e-6, 'long'); near(c.losses, 300, 1e-6, 'loss'); near(c.shortGains, 200, 1e-6, 'short');
        near(c.netCapitalGain, (1000 - 100) / 2, 1e-6, 'net');
        eq(c.sales.length, 3, 'this FY only');
    });
    test('End-of-year summary: income, deductions, capital gain in taxable income, print button', () => {
        const s = app2.run('getYearSummary()');
        near(s.taxable, s.expectedTotal - 250 + 450, 1e-6, 'taxable');
        const html = strip(app2.els.eoySummary.innerHTML);
        ok(/Financial year 2026–27/.test(html) && /Net capital gain: \$450/.test(html) && /Work \$250/.test(html) && /Print/.test(html), html.slice(0, 800));
    });
    test('New financial year keeps your planned purchases', () => {
        const next = app.run('buildNewYearData(appData, 2027)');
        ok(next.planning.goals.length === 2 && next.planning.goals[0].buffer === 4000, JSON.stringify(next.planning));
    });
}

// Weeks: added automatically (this week, plus next week from Monday),
// any week by date, and a future week by button
{
    const app = makeApp('2026-11-03T09:00:00+10:00');   // Tuesday; this week started Thu 29 Oct
    app.load(sampleData());                              // weeks logged 18 Jun - 22 Oct
    const dates = () => app.run('appData.income.map(w => w.date)');
    test('Monday-Wednesday: this week and the week starting Thursday are added automatically', () =>
        ok(dates().includes('2026-10-29') && dates().includes('2026-11-05') && !dates().includes('2026-11-12'), dates().slice(-4).join(', ')));
    test('Top-bar averages ignore the empty weeks still to come', () => eq(app.els.avgHours.textContent, '18.0'));
    test('Add Week suggests the next week not in the list', () => eq(app.els.addWeekDate.value, '2026-11-12'));

    app.run("appData.income = appData.income.filter(w => w.date !== '2026-11-05'); updateUI()");
    test('A week the app added and you deleted is not added back', () => ok(!dates().includes('2026-11-05')));

    app.el('addWeekDate').value = '2026-08-17';          // a Monday in the week of Thu 13 Aug
    app.run("appData.income = appData.income.filter(w => w.date !== '2026-08-13')");
    app.run('addEmptyWeek()');
    test('Any day picked adds its Thursday-Wednesday week', () => ok(dates().includes('2026-08-13')));
    const count = dates().length;
    app.el('addWeekDate').value = '2026-08-15';
    app.run('addEmptyWeek()');
    test('The same week can\'t be added twice', () => ok(dates().length === count && /already there/.test(app.dialogs[app.dialogs.length - 1])));

    app.run('addFutureWeek()');
    test('+ Add Future Week adds the week after the latest one', () => eq(dates()[dates().length - 1], '2026-11-05'));
    app.run('addFutureWeek()');
    test('...and again for the one after that', () => eq(dates()[dates().length - 1], '2026-11-12'));

    const fri = makeApp('2026-11-06T09:00:00+10:00');   // Friday
    fri.load(sampleData());
    test('Thursday-Sunday: only the current week is added', () => {
        const d = fri.run('appData.income.map(w => w.date)');
        ok(d.includes('2026-11-05') && !d.includes('2026-11-12'), d.slice(-3).join(', '));
    });

    const old = makeApp('2026-11-03T09:00:00+10:00');
    const lastYear = sampleData(); lastYear.financialYear = 2025; lastYear.income = [];
    old.load(lastYear);
    test('An old year\'s file gets no weeks added', () => eq(old.run('appData.income.length'), 0));
}

// Home tab and Net Worth always show the same loan balance, and savings
// on Net Worth is the Home tab offset
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.loan.offset = 15000;
    raw.assets.push({ name: 'Offset account', value: 18000 }, { name: 'Savings', value: 9000 });   // older file
    app.load(raw);
    test('Savings: old offset/savings assets are dropped, Home tab figure kept', () => {
        eq(app.run('appData.loan.offset'), 15000, 'offset');
        ok(!app.run("appData.assets.some(a => /offset|saving/i.test(a.name))"), 'no duplicate assets');
    });
    test('Savings: Net Worth shows the Home tab offset, read-only', () => {
        const html = app.els.assetList.innerHTML;
        ok(/Savings \(offset\)/.test(html) && /managed in Home tab/.test(html) && /\$15000/.test(html), html.slice(0, 400));
    });
    test('Savings: counted once in total assets', () => {
        const manual = app.run('appData.assets.reduce((s, a) => s + a.value, 0)');
        near(app.run('getTotalAssets()'), manual + 15000 + app.run('getInvestmentsValueAud()'), 1e-9);
    });
    app.el('loanInitial').value = '560000'; app.el('loanCurrentBalance').value = '480000'; app.el('loanRate').value = '6.5';
    app.el('loanTerm').value = '30'; app.el('offsetBalance').value = '25000'; app.el('loanStartDate').value = '2023-03-01';
    app.run('updateLoan()');
    test('Offset and loan: changing them on the Home tab changes Net Worth', () => {
        ok(/\$25000/.test(app.els.assetList.innerHTML), 'savings');
        eq(app.run("appData.liabilities.find(l => l.name === 'Home Loan').value"), 480000, 'loan');
    });
    test('Savings: an old file with no Home tab offset takes the Net Worth figure', () => {
        const old = makeApp('2026-11-15T09:00:00+10:00');
        const r = sampleData(); r.loan.offset = 0; r.assets.push({ name: 'Savings account', value: 7000 });
        old.load(r);
        eq(old.run('appData.loan.offset'), 7000);
    });
    app.run("updateLiability(appData.liabilities.findIndex(l => l.name === 'Home Loan'), 'value', '470000')");
    test('Home loan: changing it on Net Worth changes the Home tab', () => eq(app.run('appData.loan.currentBalance'), 470000));
    test('Net Worth lets you edit the home loan there', () => ok(/same as the Home tab/.test(app.els.liabilityList.innerHTML) && /updateLiability\(0/.test(app.els.liabilityList.innerHTML)));
}

// Performance chart: what was invested is worked out again for saved days
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.investments = { fx: { usdAud: 1.5 }, holdings: [
        { id: 'a', symbol: 'AAPL', shares: 10, costPerShareUsd: 200, purchaseDate: '2026-08-01', purchaseFx: 1.5, sold: null },
        { id: 'n', symbol: 'NVDA', shares: 5, costPerShareUsd: 150, purchaseDate: '2026-09-01', purchaseFx: 1.5, sold: null }
    ], history: [
        // Saved before NVDA's price was filled in: only AAPL counted
        { date: '2026-10-31', valueAud: 4800, costAud: 3000, costUsd: 2000, usdAud: 1.5, bench: {} },
        { date: '2026-11-01', valueAud: 4900, costAud: 4125, costUsd: 2750, usdAud: 1.5, bench: {} }
    ] };
    app.load(raw);
    test('Saved days show what was invested going by today\'s purchase details (no dip)', () => {
        const h = app.run('getPerformanceHistory()');
        ok(h.every(p => Math.abs(p.costAud - (2000 + 750) * 1.5) < 1e-9), JSON.stringify(h.map(p => p.costAud)));
    });
    test('...and a purchase only counts from its purchase date', () => near(app.run("investedOn('2026-08-15').costAud"), 2000 * 1.5, 1e-9));
}

// Planning fixes
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.planning = { goals: [{ id: 'g', name: 'Car', cost: 20000 }] };
    app.load(raw);
    app.run("updateGoal('g', 'cost', '0')");
    test('A purchase can\'t be set to cost $0', () => eq(app.run('getPlanning().goals[0].cost'), 20000));
    app.run("Object.assign(getPlanning().borrowing, { purpose: 'PROPERTY', income: 120000, livingMonthly: 2500, rentWeekly: 0, rate: 6.5 })");
    const before = app.run('estimateBorrowing()');
    app.run("appData.liabilities.push({ name: 'Car loan', value: 30000 })");
    const after = app.run('estimateBorrowing()');
    test('Other debts reduce what is left each month, not just the debt cap', () => {
        near(before.surplus - after.surplus, app.run('repaymentAt(30000, 0.10, 60)'), 1e-6, 'repayment');
        near(before.dtiLimit - after.dtiLimit, 30000, 1e-6, 'cap');
    });
    app.run('appData.loan.rate = 0');
    test('No home loan rate set: a sensible rate is used, not ~0%', () => ok(app.run('estimateBorrowing().assessmentRate') > 0.09));
}

// Lists
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.lists = [{ id: 'L', name: 'Shop', items: [
        { id: 'a', text: 'Milk', done: false }, { id: 'b', text: 'Eggs', done: true }, { id: 'c', text: 'Bread', done: false }] }];
    app.load(raw);
    app.run("reorderListItem('L', 'c', 'a', false)");
    test('Lists: dragging an item above another moves it there', () => eq(app.run("appData.lists[0].items.map(i => i.id).join('')"), 'cab'));
    test('Lists: a done item can\'t be dragged into the open items', () => ok(!app.run("canDropListItem('L', 'b', 'a')")));
    test('Lists: open items are draggable, with no arrow buttons', () => {
        const html = app.els.listsContainer.innerHTML;
        ok(/data-item="a" draggable="true"/.test(html) && !/moveListItem|↑|↓|←|→/.test(html), html.slice(0, 300));
    });
    test('Lists: done items are tucked under a Done count', () => ok(/Done \(1\)/.test(app.els.listsContainer.innerHTML) && /2 left/.test(app.els.listsContainer.innerHTML)));
    app.run("clearDoneItems('L')");
    test('Lists: Clear done removes the done items only', () => eq(app.run("appData.lists[0].items.map(i => i.text).join()"), 'Bread,Milk'));
}

// ================================================================
// SHOPPING
// ================================================================
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    const run = code => app.run(code);
    const totals = () => JSON.parse(run("JSON.stringify(mealPlanTotals())"));
    const item = name => totals().items.find(i => i.name === name);
    test('Shopping: a new file starts with the default items', () => ok(run("getShopping().items.length") > 150 && run("getShopping().items.some(i => i.name === 'Garam masala' && i.kind === 'stockpile' && i.regular)")));
    test('Shopping: household items are labelled Amazon, fresh ones Woolworths', () => ok(run("shopItem('Toilet paper').store") === 'Amazon' && run("shopItem('Chicken breast').store") === 'Woolworths'));
    test('Meal book: built-in list has prep meals, dinners and bases', () => {
        ok(run("getMealBook().meals.filter(m => m.type === 'Prep').length") >= 25, 'prep');
        ok(run("getMealBook().meals.filter(m => m.type === 'Dinner').some(m => m.name === 'Nachos' && m.usually === 2)"), 'nachos is a 2-serve dinner');
        ok(run("getMealBook().meals.find(m => m.name === 'Spanakopita').type") === 'Dinner', 'spanakopita is fresh');
        eq(run("getMealBook().bases.length"), 4);
    });
    test('Meal book: every ingredient is a known item', () => ok(run("(b => [...b.meals, ...b.bases].every(m => m.ings.every(i => DEFAULT_SHOP_ITEMS.some(d => d.name === i[0]))))(getMealBook())")));

    test('Quantities: units add up and read naturally', () => {
        eq(run("formatQty({ g: 1550 })"), '1.55 kg');
        eq(run("formatQty({ '': 1.5 })"), '1½');
        eq(run("formatQty({ tsp: 2, tbsp: 1 })"), '1½ tbsp');
        eq(run("formatQty({ tsp: 1.25 })"), '1¼ tsp');
        eq(run("formatQty({ can: 2 })"), '2 cans');
        eq(run("formatQty({}, true)"), 'some');
        eq(run("formatQty({ '': 3, g: 2000 })"), '2 kg + 3 whole');
    });

    run("changeMealServes('chicken-madras', 1); changeMealServes('chicken-madras', 1); changeMealServes('keema-curry', 1)");
    test('Prep meals: + adds a whole batch (the recipe\'s serves)', () => eq(run("getShopping().plan.meals['chicken-madras']"), 10));
    test('Meal plan: adds up ingredients across meals and batches', () => {
        eq(item('Chicken breast').qty, '1.5 kg', 'Madras 750 g x2');
        eq(item('Beef mince').qty, '625 g', 'Keema');
        eq(item('Limes').qty, '2', 'a lime per Madras');
    });
    test('Meal plan: says how much of each base is needed, from the freezer by default', () => {
        const b = totals().bases.find(b => b.id === 'indian-curry-base-gravy');
        ok(b.needed === 1500 && b.batches === 0, JSON.stringify(b));
        ok(!item('Mild curry powder').meals.includes('Indian curry base gravy'), 'no gravy ingredients when using frozen');
    });
    run("changeBaseBatches('indian-curry-base-gravy', 1)");
    test('Meal plan: making a base starts with enough for the week', () => eq(run("getShopping().plan.bases['indian-curry-base-gravy']"), 1));
    test('Meal plan: making a base adds its ingredients', () => eq(item('Onions').qty, '2 kg + 1 whole'));

    run("changeMealServes('nachos', 1)");
    test('Dinners: start at the usual serves and scale the recipe down', () => {
        eq(run("getShopping().plan.meals['nachos']"), 2);
        eq(item('Corn chips').qty, '200 g', '500 g for 5 -> 200 g for 2');
        const mince = totals().bases.find(b => b.id === 'mexican-spiced-beef-mince');
        ok(Math.abs(mince.needed - 0.5) < 1e-9, '1¼ batches for 5 -> ½ for 2');
    });
    run("changeMealServes('nachos', 1)");
    test('Dinners: + adds one serve', () => eq(run("getShopping().plan.meals['nachos']"), 3));
    test('Meal plan: shows prep and dinners separately on the Shopping tab', () => {
        const html = app.els.shoppingContainer.innerHTML;
        ok(/Chicken Madras <b>×2<\/b>/.test(html) && /Nachos <b>3 serves<\/b>/.test(html) && /Fresh dinners/.test(html), html.slice(0, 200));
    });

    run("addMealIngredients('fresh')");
    test('Meal plan: Add all puts the fresh ingredients on the list with quantities', () => {
        const e = JSON.parse(run("JSON.stringify(getShopping().list.find(e => e.name === 'Chicken breast'))"));
        ok(e && e.qty === '1.5 kg' && e.store === 'Woolworths' && e.section === 'Meat', JSON.stringify(e));
        ok(!run("getShopping().list.some(e => e.name === 'Garam masala')"), 'stockpile not added');
    });
    run("toggleShoppingItem('Toilet paper')");
    test('Stockpile: ticking adds to the Amazon list', () => ok(run("getShopping().list.find(e => e.name === 'Toilet paper').store") === 'Amazon'));
    run("toggleShoppingItem('Toilet paper')");
    test('...and unticking takes it off', () => ok(!run("getShopping().list.some(e => e.name === 'Toilet paper')")));
    run("toggleShoppingItem('Chicken breast')");
    test('Ticking something already on the list takes it off', () => ok(!run("getShopping().list.some(e => e.name === 'Chicken breast' && !e.done)")));
    run("addToShoppingList('Chicken breast', '600 g'); addToShoppingList('Chicken breast', '300 g')");
    test('Adding the same item twice combines the quantities', () => eq(run("getShopping().list.find(e => e.name === 'Chicken breast').qty"), '600 g + 300 g'));

    run("setAisle('Meat', '12'); setAisle('Fruit & Veg', '1'); renderShopping()");
    test('Shopping list: sorted by your aisle numbers, labelled with them', () => {
        const html = app.els.shoppingContainer.innerHTML;
        ok(html.indexOf('Aisle 1 · Fruit &amp; Veg') > -1 && html.indexOf('Aisle 1 · Fruit &amp; Veg') < html.indexOf('Aisle 12 · Meat'), html.slice(0, 300));
    });
    const id = run("getShopping().list.find(e => e.name === 'Chicken breast').id");
    run(`tickShoppingEntry('${id}')`);
    test('Ticking an item on the list moves it to the trolley', () => ok(run("getShopping().list.find(e => e.name === 'Chicken breast').done") && /In the trolley/.test(app.els.shoppingContainer.innerHTML)));
    run("clearBoughtItems()");
    test('Clear ticked removes bought items', () => ok(!run("getShopping().list.some(e => e.name === 'Chicken breast')")));

    const gid = run("getShopping().items.find(i => i.name === 'Garam masala').id");
    run(`updateShopItem('${gid}', 'store', 'Amazon'); toggleShoppingItem('Garam masala')`);
    test('Changing where to buy an item is used for the list', () => eq(run("getShopping().list.find(e => e.name === 'Garam masala').store"), 'Amazon'));
    run(`updateShopItem('${gid}', 'store', 'Woolworths')`);
    test('...and moves it if it\'s already on the list', () => eq(run("getShopping().list.find(e => e.name === 'Garam masala').store"), 'Woolworths'));
    run(`removeShopItem('${gid}')`);
    test('Removing a meal ingredient from Stockpile keeps it known for the planner', () => ok(run("getShopping().items.find(i => i.name === 'Garam masala').regular === false")));

    test('Shopping data carries into a new financial year', () => ok(run("JSON.stringify(buildNewYearData(appData, 2027).shopping) === JSON.stringify(appData.shopping)")));
    run("clearMealPlan()");
    test('New week clears the meal plan', () => ok(run("Object.keys(getShopping().plan.meals).length === 0 && Object.keys(getShopping().plan.bases).length === 0")));

    // Older data from before the recipe book update
    const old = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.shopping = { items: [{ name: 'Shredded cheese', kind: 'fresh', section: 'Dairy & Eggs', store: 'Woolworths', regular: true }], list: [{ name: 'Shredded cheese', qty: '150 g' }], plan: { meals: { madras: 2 }, bases: {} } };
    old.load(raw);
    test('Older data: renamed items follow, and the old-style plan is cleared', () => {
        ok(old.run("getShopping().items[0].name === 'Grated cheese' && getShopping().list[0].name === 'Grated cheese'"), 'renamed');
        ok(old.run("Object.keys(getShopping().plan.meals).length === 0"), 'plan cleared');
    });
}

// Meals Excel: download -> edit -> upload round trip (real Excel library, no browser)
const excelChecks = (async () => {
    const Excel = require(path.join(__dirname, '..', 'js', 'vendor', 'exceljs.min.js'));
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    app.ctx.__Excel = Excel;
    const buf = await app.run("buildMealsWorkbook(__Excel, getMealBook(), getShopping().items).xlsx.writeBuffer()");
    // Edit like a person would: change nachos to 3 serves, a quantity, add a new meal with a new ingredient
    const wb = new Excel.Workbook();
    await wb.xlsx.load(buf);
    const meals = wb.getWorksheet('Meals'), ings = wb.getWorksheet('Ingredients');
    meals.eachRow((row, r) => { if (row.getCell(1).value === 'Nachos') row.getCell(5).value = 3; });
    ings.eachRow(row => { if (row.getCell(1).value === 'Keema Curry' && row.getCell(2).value === 'Beef mince') { row.getCell(3).value = '1 1/2'; row.getCell(4).value = 'kg'; } });
    meals.addRow(['Steak night', 'dinner', 'Comfort', 2, '', '', '', '', '']);
    ings.addRow(['Steak night', 'Scotch fillet steaks', 2, '']);
    ings.addRow(['Steak night', 'Butter', '½', 'TBSP']);
    ings.addRow(['Nowhere meal', 'Salt', 1, 'tsp']);
    const edited = await wb.xlsx.writeBuffer();
    app.ctx.__buf = edited;
    const result = await app.run("readMealsWorkbook(__Excel, __buf)");
    app.ctx.__result = result;
    test('Meals Excel: reads back every meal and base', () => {
        ok(result.book.meals.length === app.run("getMealBook().meals.length") + 1 && result.book.bases.length === 4, `${result.book.meals.length} meals`);
    });
    test('Meals Excel: edits come through (serves, fractions, kg, new meal)', () => {
        eq(result.book.meals.find(m => m.name === 'Nachos').usually, 3);
        const beef = result.book.meals.find(m => m.name === 'Keema Curry').ings.find(i => i[0] === 'Beef mince');
        ok(beef[1] === 1500 && beef[2] === 'g', JSON.stringify(beef));
        const steak = result.book.meals.find(m => m.name === 'Steak night');
        ok(steak.type === 'Dinner' && steak.usually === 2 && steak.ings.some(i => i[0] === 'Butter' && i[1] === 0.5 && i[2] === 'tbsp'), JSON.stringify(steak));
        ok(result.book.meals.find(m => m.name === 'Burrito Bowls').bases[0][0] === 'Mexican spiced beef mince', 'bases kept');
    });
    test('Meals Excel: points out problems without failing', () => {
        ok(result.problems.some(p => /Nowhere meal/.test(p)) && result.problems.some(p => /Scotch fillet steaks/.test(p)), result.problems.join(' | '));
    });
    app.run("applyMealsUpload(__result, false)");
    test('Meals Excel: upload replaces the meal list and adds new items', () => {
        ok(app.run("getMealBook().meals.some(m => m.name === 'Steak night') && !!getShopping().mealBook.updated"), 'saved');
        ok(app.run("getShopping().items.some(i => i.name === 'Scotch fillet steaks' && i.kind === 'fresh')"), 'new item');
        ok(/Your list, uploaded/.test(app.els.shoppingContainer.innerHTML), 'shown as your list');
    });
})();
module.exports.pending = Promise.all([module.exports.pending, excelChecks]);

// Excel backup of the financial data (real Excel library)
const financeExcel = (async () => {
    const Excel = require(path.join(__dirname, '..', 'js', 'vendor', 'exceljs.min.js'));
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    app.ctx.__Excel = Excel;
    const buf = await app.run("buildFinanceWorkbook(__Excel, appData).xlsx.writeBuffer()");
    const wb = new Excel.Workbook();
    await wb.xlsx.load(buf);
    const names = wb.worksheets.map(w => w.name);
    test('Excel backup: has the main sheets', () => ok(['Summary', 'Income', 'Expenses', 'Budgets', 'Home Loan', 'Net Worth'].every(n => names.includes(n)), names.join(', ')));
    test('Excel backup: expenses and pay match the app', () => {
        const exp = wb.getWorksheet('Expenses');
        eq(exp.rowCount - 1, app.run('appData.expenses.length'), 'one row per expense');
        let pay = 0; wb.getWorksheet('Income').eachRow((row, r) => { if (r > 1) pay += row.getCell(6).value; });
        near(pay, app.run('getTotalIncome()'), 0.01);
    });
    test('Excel backup: dates are the same calendar day as in the app', () => {
        const first = app.run("appData.expenses.slice().sort((a, b) => a.date.localeCompare(b.date))[0].date");
        const cell = wb.getWorksheet('Expenses').getRow(2).getCell(1).value;
        eq(cell.toISOString().slice(0, 10), first);
    });
})();
module.exports.pending = Promise.all([module.exports.pending, financeExcel]);

// Excel backup -> Import round trip
const backupRoundTrip = (async () => {
    const Excel = require(path.join(__dirname, '..', 'js', 'vendor', 'exceljs.min.js'));
    const app = makeApp('2026-11-15T09:00:00+10:00');
    app.load(sampleData());
    app.ctx.__Excel = Excel;
    const before = app.run('serializeAppData()');
    const buf = await app.run("buildFinanceWorkbook(__Excel, appData).xlsx.writeBuffer()");
    app.ctx.__buf = buf;
    const result = await app.run("readBackupWorkbook(__Excel, __buf)");
    test('Excel backup: holds all the data exactly', () => {
        app.ctx.__text = result.text;
        eq(app.run("JSON.stringify(normalizeAppData(JSON.parse(__text)), null, 2)"), before);
        eq(result.warnings.length, 0, 'no edits');
    });
    // Import it into a fresh account
    const fresh = makeApp('2026-11-15T09:00:00+10:00');
    const cloud = fakeCloud();
    fresh.ctx.__cloud = cloud;
    await fresh.run('cloudStore = __cloud; openStartYear()');
    fresh.ctx.__files = [{ name: 'finance_data_2026-2027.xlsx', text: result.text }];
    await fresh.run('importDataTexts(__files)');
    test('Import: restores an Excel backup into its year', () => ok(cloud.years[2026] && fresh.run('appData.expenses.length') === app.run('appData.expenses.length') && fresh.run('appData.loan.offset') === app.run('appData.loan.offset')));
    // Someone edits the Expenses sheet in Excel
    const wb = new Excel.Workbook();
    await wb.xlsx.load(buf);
    wb.getWorksheet('Expenses').getRow(2).getCell(4).value = 99999;
    app.ctx.__edited = await wb.xlsx.writeBuffer();
    const edited = await app.run("readBackupWorkbook(__Excel, __edited)");
    test('Import: notices edits made in Excel (which it doesn\'t use)', () => ok(edited.warnings.includes('the Expenses sheet'), JSON.stringify(edited.warnings)));
    app.ctx.__meals = await app.run("buildMealsWorkbook(__Excel, getMealBook(), getShopping().items).xlsx.writeBuffer()");
    let refused = '';
    try { await app.run("readBackupWorkbook(__Excel, __meals)"); } catch (e) { refused = e.message; }
    test('Import: a spreadsheet that isn\'t a backup is refused with a clear message', () => ok(/isn't a backup made by this app/.test(refused), refused));
})();
module.exports.pending = Promise.all([module.exports.pending, backupRoundTrip]);

// Lists: dragging whole lists
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.lists = [{ id: 'A', name: 'One', items: [] }, { id: 'B', name: 'Two', items: [] }, { id: 'C', name: 'Three', items: [] }];
    app.load(raw);
    app.run("reorderList('C', 'A', false)");
    test('Lists: dragging a list before another moves it there', () => eq(app.run("appData.lists.map(l => l.id).join('')"), 'CAB'));
    app.run("reorderList('C', 'B', true)");
    test('Lists: dragging a list after the last one moves it to the end', () => eq(app.run("appData.lists.map(l => l.id).join('')"), 'ABC'));
    test('Lists: list headers are the drag handle', () => ok(/list-card-header" data-list="A" draggable="true"/.test(app.els.listsContainer.innerHTML)));
}

// Lists: starring
{
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const raw = sampleData();
    raw.lists = [{ id: 'L', name: 'Jobs', items: [
        { id: 'a', text: 'A', done: false }, { id: 'b', text: 'B', done: false }, { id: 'c', text: 'C', done: false }, { id: 'd', text: 'D', done: false }] }];
    app.load(raw);
    test('Lists: old items load as not starred', () => eq(app.run("appData.lists[0].items[0].starred"), false));
    app.run("toggleStarItem('L', 'c')");
    test('Lists: starring moves an item to the top', () => eq(app.run("appData.lists[0].items.map(i => i.id).join('')"), 'cabd'));
    app.run("toggleStarItem('L', 'd')");
    test('Lists: the latest starred item goes above earlier ones', () => eq(app.run("appData.lists[0].items.map(i => i.id).join('')"), 'dcab'));
    test('Lists: starred items show first with a star', () => {
        const html = app.els.listsContainer.innerHTML;
        ok(html.indexOf('>D<') < html.indexOf('>A<') && /starred/.test(html) && /★/.test(html));
    });
    app.run("reorderListItem('L', 'a', 'd', false)");
    test('Lists: an unstarred item can be dragged above starred ones', () => eq(app.run("appData.lists[0].items.map(i => i.id).join('')"), 'adcb'));
    app.run("reorderListItem('L', 'd', 'b', true)");
    test('Lists: a starred item can be dragged below unstarred ones', () => eq(app.run("appData.lists[0].items.map(i => i.id).join('')"), 'acbd'));
    app.run("toggleStarItem('L', 'c')");
    test('Lists: unstarring leaves an item where it is', () => eq(app.run("appData.lists[0].items.map(i => i.id + (i.starred ? '*' : '')).join('')"), 'acbd*'));
    test('Lists: items show in their saved order, starred or not', () => {
        app.run("appData.lists[0].items = [{id:'x',text:'X',done:false,starred:false},{id:'y',text:'Y',done:false,starred:true}]; renderLists();");
        const html = app.els.listsContainer.innerHTML;
        ok(html.indexOf('>X<') < html.indexOf('>Y<'));
    });
}

// Price history from purchase dates (Twelve Data + daily exchange rates simulated)
{
    const rates = { '2026-11-10': 1.5, '2026-11-11': 1.5, '2026-11-12': 1.6, '2026-11-13': 1.6 };
    const closes = {
        AAPL: { '2026-11-10': 200, '2026-11-11': 210, '2026-11-12': 220, '2026-11-13': 230 },
        MSFT: { '2026-11-10': 395, '2026-11-11': 400, '2026-11-12': 410, '2026-11-13': 420 },
        SPY: { '2026-11-10': 100, '2026-11-11': 101, '2026-11-12': 102, '2026-11-13': 103 },
        QQQ: { '2026-11-10': 50, '2026-11-11': 50, '2026-11-12': 51, '2026-11-13': 52 }
    };
    const historyCalls = [];
    const fakeFetch = async url => {
        if (url.includes('frankfurter') && url.includes('/latest')) return new Response(JSON.stringify({ date: '2026-11-13', rates: { AUD: 1.6 } }));
        const range = url.match(/v1\/(\d{4}-\d{2}-\d{2})\.\./);
        if (range) return new Response(JSON.stringify({ rates: Object.fromEntries(Object.entries(rates).filter(([d]) => d >= range[1]).map(([d, r]) => [d, { AUD: r }])) }));
        if (url.includes('frankfurter')) { const d = url.match(/v1\/(\d{4}-\d{2}-\d{2})/)[1]; return new Response(JSON.stringify({ date: d, rates: { AUD: rates[d] || 1.6 } })); }
        if (url.includes('twelvedata')) {
            const u = new URL(url), sym = u.searchParams.get('symbol'), from = u.searchParams.get('start_date');
            historyCalls.push(`${sym} ${from}`);
            return new Response(JSON.stringify({ status: 'ok', values: Object.entries(closes[sym]).filter(([d]) => d >= from).map(([datetime, c]) => ({ datetime, close: String(c) })) }));
        }
        if (url.includes('finnhub')) { const sym = new URL(url).searchParams.get('symbol'); const c = { AAPL: 230, SPY: 103, QQQ: 52 }[sym] || 0; return new Response(JSON.stringify({ c, pc: c, dp: 0, t: 1 })); }
        return new Response('', { status: 404 });
    };
    const app = makeApp('2026-11-15T09:00:00+10:00', fakeFetch);
    const raw = sampleData();
    raw.investments = { apiKey: 'test', historyApiKey: 'test', holdings: [
        { id: 'h1', symbol: 'AAPL', name: 'Apple', shares: 10, costPerShareUsd: 200, purchaseDate: '2026-11-10', sold: null },
        { id: 'h2', symbol: 'MSFT', name: 'Microsoft', shares: 2, costPerShareUsd: 400, purchaseDate: '2026-11-11', sold: { date: '2026-11-13', pricePerShareUsd: 420, fx: null } }
    ] };
    app.load(raw);
    const histDone = app.run('refreshInvestmentPrices()').then(async () => {
        const pts = app.run('getPerformanceHistory()');
        const day = d => pts.find(p => p.date === d);
        test('History starts on the first purchase date, at that day\'s close and rate', () =>
            ok(pts[0].date === '2026-11-10' && Math.abs(pts[0].valueAud - 10 * 200 * 1.5) < 1e-9, JSON.stringify(pts[0])));
        test('Each purchase counts from its purchase date', () => near(day('2026-11-11').valueAud, (10 * 210 + 2 * 400) * 1.5, 1e-9));
        test('A sold purchase drops out on its sale date', () => {
            near(day('2026-11-13').valueAud, 10 * 230 * 1.6, 1e-9, 'value');
            eq(day('2026-11-13').costUsd, 2000, 'invested');
        });
        test('S&P 500 comparison is there straight away, back to the first purchase', () => {
            const b = app.run('addBenchmarkValues(getPerformanceHistory())');
            const units = 2000 / 100 + 800 / 101;
            near(b.find(p => p.date === '2026-11-12').bench_SPY, units * 102 * 1.6, 1e-9);
            ok(/S&amp;P 500 \(SPY\)/.test(app.els.investmentsTracker.innerHTML), 'legend');
        });
        test('Since-you-bought chart: % against the price you paid, S&P for reference', () => {
            const html = strip(app.els.investmentsTracker.innerHTML);
            ok(/Since you bought/.test(html) && /AAPL \+15\.0%/.test(html) && !/MSFT \+/.test(html), html.slice(0, 1500));
        });
        test('Total profit / loss = unrealised + realised, as A$ and %', () => {
            const s = app.run('getPortfolioSummary()');
            near(s.totalAud, (10 * 230 * 1.6 - 10 * 200 * 1.5) + (2 * 420 * 1.6 - 2 * 400 * 1.5), 1e-9, 'A$');
            near(s.totalPct, s.totalAud / (10 * 200 * 1.5 + 2 * 400 * 1.5), 1e-9, '%');
            ok(/Total profit \/ loss \+A\$824 \+19\.62%/.test(strip(app.els.investmentsTracker.innerHTML)), 'shown');
        });
        const before = historyCalls.length;
        await app.run('refreshInvestmentPrices()');
        test('Updating again the same day doesn\'t re-fetch history', () => eq(historyCalls.length, before));
        test('Price history is kept in the data file', () => eq(app.run("Object.keys(appData.investments.priceHistory.AAPL.closes).length"), 4));
    });
    module.exports.pending = Promise.all([module.exports.pending, histDone]);
}

// Exchange-rate fallback, and prices still shown when no rate is available
{
    const quotes = { AAPL: { c: 250, pc: 245, dp: 2.04, t: 1 } };
    const fxFallback = (async () => {
        const backupOnly = async url => {
            if (url.includes('frankfurter')) throw new TypeError('Failed to fetch');
            if (url.includes('er-api')) return new Response(JSON.stringify({ result: 'success', time_last_update_unix: 1793318400, rates: { AUD: 1.42 } }));
            if (url.includes('finnhub')) return new Response(JSON.stringify(quotes.AAPL));
            return new Response('', { status: 404 });
        };
        const r = sampleData();
        r.investments = { apiKey: 'test', holdings: [{ id: 'x', symbol: 'AAPL', shares: 2, costPerShareUsd: 200, purchaseDate: '', sold: null }] };
        const a = makeApp('2026-11-15T09:00:00+10:00', backupOnly);
        a.load(r);
        await a.run('refreshInvestmentPrices()');
        test('Backup exchange-rate source is used if Frankfurter is unreachable', () =>
            ok(a.run('appData.investments.fx.usdAud') === 1.42 && a.run('appData.investments.fx.source') === 'ExchangeRate-API'));

        const noFx = async url => {
            if (url.includes('finnhub')) return new Response(JSON.stringify(quotes.AAPL));
            throw new TypeError('Failed to fetch');
        };
        const b = makeApp('2026-11-15T09:00:00+10:00', noFx);
        b.load(r);
        await b.run('refreshInvestmentPrices()');
        const html = strip(b.els.investmentsTracker.innerHTML);
        test('Without a rate, US$ price, value and gain still show; A$ says what is missing', () =>
            ok(/US\$250\.00/.test(html) && /Portfolio value — US\$500 · A\$ needs USD\/AUD rate/.test(html) && /\+US\$100\.00/.test(html), html.slice(0, 400)));
    })();
    module.exports.pending = Promise.all([module.exports.pending, fxFallback]);
}

// ================================================================
// NO HIDDEN SPENDING (categories missing from the list)
// ================================================================
{
    const app = makeApp('2026-10-27T09:00:00+10:00');
    const raw = sampleData();
    raw.expenses.push({ date: '2026-09-20', category: 'Phone', amount: 150 });   // not in the category list
    raw.expenses.push({ date: '2026-09-21', amount: 30 });                       // no category at all
    app.load(raw);
    const histRows = () => [...app.els.monthlyBudgetHistory.innerHTML.matchAll(/<tr[^>]*>([^]*?)<\/tr>/g)].map(r => strip(r[1]));
    const septSpend = app.run("getFYExpenses().filter(e => e.date.startsWith('2026-09')).reduce((s, e) => s + e.amount, 0)");
    test('Budget history shows spending in categories not in your list', () => {
        const rows = histRows();
        ok(rows.some(r => r.startsWith('Phone *')) && rows.some(r => r.startsWith('Other *')), rows.join(' | '));
    });
    test('Budget history total for the month matches what the dashboard counts', () => {
        const total = histRows().find(r => r.includes('Total')).split(' ').filter(t => t.startsWith('$'));
        eq(Number(total[2].replace(/[$,]/g, '')), septSpend, 'September total');   // Jul, Aug, Sep
    });
    test('Category averages include unlisted categories', () => ok(/Phone \*/.test(strip(app.els.categoryMonthlyAverage.innerHTML))));
    test('Dashboard Real counts spending in unlisted categories', () =>
        // Jul-Sep average: (3 x $1,900 + $180 in Sept) / 3 = $1,960/month
        near(app.run('getCompletedMonthsAverage().monthlyExpenses'), 1960, 0.01));
    test('An expense in an unlisted category shows its real category, not the first one', () =>
        ok(/<option value="Phone" selected>Phone \(not in list\)<\/option>/.test(app.els.expenseList.innerHTML)));
    test('Expense filter: lists your categories plus unlisted ones in use', () => {
        const html = app.els.expenseFilterCategory.innerHTML;
        ok(/All categories/.test(html) && /value="Food"/.test(html) && /value="Phone"/.test(html), html);
    });
    test('Expense filter: shows only that category, with its count and FY total', () => {
        app.run("setExpenseFilter('Phone')");
        const list = app.els.expenseList.innerHTML;
        ok(!/value="Food" selected/.test(list) && /Phone \(not in list\)/.test(list), 'only Phone rows');
        eq(app.els.expenseFilterTotal.textContent, '1 item · $150 this FY');
        app.run("setExpenseFilter('')");
        ok(/value="Food" selected/.test(app.els.expenseList.innerHTML) && app.els.expenseFilterTotal.textContent === '', 'back to all');
    });
    test('Expense filter: doesn\'t change any totals', () => near(app.run('getCompletedMonthsAverage().monthlyExpenses'), 1960, 0.01));
    test('Unlisted categories can be added to the list in one click', () => {
        ok(/add to list/.test(app.els.categoryList.innerHTML));
        app.run("addCategoryNamed('Phone')");
        ok(app.run("appData.categories.includes('Phone')") && !app.run("getUnlistedCategories().includes('Phone')"));
    });
    test('Amounts and hours saved as text are added up as numbers', () => {
        const r = sampleData();
        r.expenses = [{ date: '2026-09-01', category: 'Food', amount: '50' }, { date: '2026-09-02', category: 'Food', amount: '30' }];
        r.income = [{ week: 0, date: '2026-09-03', shifts: [{ job: '2', hours: '10', id: 's' }] }];
        app.load(r);
        eq(app.run('getFYExpenses().reduce((s, e) => s + e.amount, 0)'), 80);
        eq(app.run('getTotalIncome()'), 250);
    });
}

// ================================================================
// STORAGE: SAVING, AUTOSAVE, YEARS, IMPORT (fake database, no network)
// ================================================================
// Same methods as the Firestore store in file.js, kept in memory
function fakeCloud() {
    const store = {
        user: null, years: {}, writes: 0, offline: false,
        async getUser() { return store.user; },
        async setCurrentYear(y) { store.user = { ...(store.user || {}), currentYear: y }; },
        async listYears() { return Object.keys(store.years).map(k => ({ year: Number(k), closedOn: store.years[k].closedOn })); },
        async getYear(y) { const d = store.years[y]; return d ? { json: d.json, rev: d.rev } : null; },
        async getYearRev(y) { return store.years[y]?.rev || 0; },
        async putYear(y, json, expectRev, force, meta = {}) {
            if (store.offline) throw new Error('offline');
            const rev = store.years[y]?.rev || 0;
            if (!force && rev !== expectRev) return { conflict: true, rev };
            store.years[y] = { json, rev: rev + 1, closedOn: meta.closedOn || null };
            store.writes++;
            return { ok: true, rev: rev + 1 };
        },
        // Another device saving this year
        otherDeviceSaves(y, change) {
            const data = JSON.parse(store.years[y].json); change(data);
            store.years[y] = { ...store.years[y], json: JSON.stringify(data), rev: store.years[y].rev + 1 };
        }
    };
    return store;
}
const autosaveChecks = (async () => {
    const app = makeApp('2026-11-15T09:00:00+10:00');
    const cloud = fakeCloud();
    cloud.user = { currentYear: 2026 };
    cloud.years[2026] = { json: JSON.stringify(normalizeForTest(app, sampleData())), rev: 3, closedOn: null };
    app.ctx.__cloud = cloud;
    await app.run('cloudStore = __cloud; openStartYear()');
    const dirty = () => app.run('hasUnsavedChanges()');
    const badgeShown = () => app.els.unsavedBadge && app.els.unsavedBadge.style.display !== 'none';
    const saved = () => JSON.parse(cloud.years[2026].json);

    test('Signing in opens the year you were working in', () => ok(app.run('currentYear') === 2026 && app.run('lastKnownRev') === 3 && app.run('appData.income.length') > 0));
    test('Nothing is unsaved straight after loading', () => ok(!dirty() && !badgeShown()));
    test('The year picker lists saved years', () => ok(/value="2026" selected/.test(app.els.yearPicker.innerHTML)));
    app.run("updateBudget('Food', '450')");
    test('An edit shows as unsaved', () => ok(dirty() && badgeShown()));

    await app.run('autosave()');
    test('Autosave saves to the database and clears the badge', () => ok(cloud.writes === 1 && !dirty() && !badgeShown() && saved().budgets.Food === 450 && cloud.years[2026].rev === 4));
    test('Autosave reports when it ran', () => ok(/Autosaved/.test(app.els.fileStatus.textContent)));

    cloud.otherDeviceSaves(2026, d => { d.budgets.Food = 999; });
    app.run("updateBudget('Food', '500')");
    await app.run('autosave()');
    test('Autosave never overwrites a save from another device', () => ok(cloud.writes === 1 && dirty() && saved().budgets.Food === 999 && /changed on another device/.test(app.els.fileStatus.textContent)));
    await app.run('checkForRemoteChanges()');
    test('With unsaved edits, another device\'s save doesn\'t replace them', () => ok(app.run('appData.budgets.Food') === 500));

    app.ctx.__confirmAnswer = false;
    const savedNo = await app.run('saveData()');
    test('Manual save asks first when another device saved, and respects No', () => ok(savedNo === false && saved().budgets.Food === 999 && /changed on another device/.test(app.dialogs[app.dialogs.length - 1])));
    app.ctx.__confirmAnswer = true;
    await app.run('saveData()');
    test('...and saves when you say Yes', () => ok(saved().budgets.Food === 500 && !dirty()));

    cloud.otherDeviceSaves(2026, d => { d.budgets.Food = 650; });
    await app.run('checkForRemoteChanges()');
    test('Coming back to the tab picks up another device\'s save', () => ok(app.run('appData.budgets.Food') === 650 && !dirty() && /another device/.test(app.els.fileStatus.textContent)));

    cloud.offline = true;
    app.run("updateBudget('Food', '510')");
    await app.run('autosave()');
    test('If saving fails (e.g. offline), edits stay and show as unsaved', () => ok(dirty() && app.run('appData.budgets.Food') === 510 && /failed/.test(app.els.fileStatus.textContent)));
    cloud.offline = false;

    app.ctx.__confirmAnswer = false;
    await app.run('forceReloadData()');
    test('Reload asks before discarding unsaved changes', () => ok(dirty() && app.run('appData.budgets.Food') === 510));
    app.ctx.__confirmAnswer = true;
    await app.run('forceReloadData()');
    test('...and reloads when confirmed', () => ok(!dirty() && app.run('appData.budgets.Food') === 650));

    const evt = { prevented: false, preventDefault() { this.prevented = true; } };
    app.ctx.__evt = evt;
    app.run('warnBeforeLeaving(__evt)');
    test('No close-tab warning when everything is saved', () => ok(!evt.prevented));
    app.run("updateBudget('Food', '520'); warnBeforeLeaving(__evt)");
    test('Close-tab warning when there are unsaved changes', () => ok(evt.prevented));

    // Real timer: the background check runs every 2s while the edit sits
    // unsaved; autosave must still fire once, about 4s after the edit.
    const writesBefore = cloud.writes;
    const ticker = setInterval(() => app.run('refreshUnsavedState()'), 500);
    await new Promise(r => setTimeout(r, 4800));
    clearInterval(ticker);
    test('Autosave fires once after you stop editing, despite background checks', () => ok(cloud.writes === writesBefore + 1 && !dirty(), `writes ${cloud.writes - writesBefore}`));

    // New financial year: archives this one, starts the next
    app.ctx.__confirmAnswer = true;
    await app.run('startNewFinancialYear()');
    test('New FY archives the old year and starts the next one', () => {
        ok(JSON.parse(cloud.years[2026].json).yearClosedOn && cloud.years[2026].closedOn, 'archived');
        ok(cloud.years[2027] && JSON.parse(cloud.years[2027].json).financialYear === 2027 && cloud.user.currentYear === 2027, 'new year saved');
        ok(app.run('currentYear') === 2027 && JSON.parse(cloud.years[2027].json).expenses.length === 0);
    });
    test('...and the year picker shows both, the old one archived', () => ok(/2026–27 \(archived\)/.test(app.els.yearPicker.innerHTML) && /value="2027" selected/.test(app.els.yearPicker.innerHTML)));
    await app.run('switchYear("2026")');
    test('Picking a year opens it', () => ok(app.run('currentYear') === 2026 && app.run('appData.financialYear') === 2026 && app.run('appData.budgets.Food') === 520));
    await app.run('switchYear("2027")');

    // Import: each file goes into its own year
    const fresh = makeApp('2026-11-15T09:00:00+10:00');
    const cloud2 = fakeCloud();
    fresh.ctx.__cloud = cloud2;
    await fresh.run('cloudStore = __cloud; openStartYear()');
    test('A new account starts empty and says how to import', () => ok(!cloud2.years[2026] && /Import/.test(fresh.els.fileStatus.textContent)));
    const y25 = sampleData(); y25.financialYear = 2025; y25.yearClosedOn = '2026-07-02';
    const y26 = sampleData(); y26.financialYear = 2026;
    fresh.ctx.__files = [{ name: 'finance_data_2025-2026.json', text: JSON.stringify(y25) }, { name: 'finance_data_2026-2027.json', text: JSON.stringify(y26) }];
    await fresh.run('importDataTexts(__files)');
    test('Import puts each file in its own year and opens the latest', () => {
        ok(cloud2.years[2025] && cloud2.years[2025].closedOn === '2026-07-02' && cloud2.years[2026], 'both years stored');
        ok(cloud2.user.currentYear === 2026 && fresh.run('currentYear') === 2026 && fresh.run('appData.income.length') > 0, 'latest opened');
    });
    fresh.ctx.__confirmAnswer = false;
    fresh.ctx.__files = [{ name: 'x.json', text: JSON.stringify({ ...y26, budgets: { Food: 1 } }) }];
    await fresh.run('importDataTexts(__files)');
    test('Import asks before replacing a year that\'s already saved', () => ok(JSON.parse(cloud2.years[2026].json).budgets.Food !== 1 && /Replace what's saved/.test(fresh.dialogs[fresh.dialogs.length - 1])));
    fresh.ctx.__files = [{ name: 'bad.json', text: '{not json' }];
    const writes = cloud2.writes;
    await fresh.run('importDataTexts(__files)');
    test('A broken file imports nothing', () => ok(cloud2.writes === writes && /isn't a valid data file/.test(fresh.dialogs[fresh.dialogs.length - 1])));
})();
module.exports.pending = Promise.all([module.exports.pending, autosaveChecks]);

// ---------- report ----------
(module.exports.pending || Promise.resolve()).then(() => {
    const failed = results.filter(r => !r[0]);
    results.forEach(([pass, name, err]) => console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${err ? `\n         ${err}` : ''}`));
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exitCode = failed.length ? 1 : 0;
});
