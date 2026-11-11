// ================================================================
// DATA MODEL
// ================================================================

// Australian financial year runs 1 July - 30 June, named by the year it
// starts in (2026 = 2026-27).
function getFinancialYearRange(startYear) {
    return {
        start: new Date(startYear, 6, 1),
        // End of day, so anything dated 30 June still falls inside the FY
        end: new Date(startYear + 1, 5, 30, 23, 59, 59, 999)
    };
}

function getCurrentFinancialYear(referenceDate = new Date()) {
    const year = referenceDate.getMonth() >= 6 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
    return getFinancialYearRange(year);
}

function fyStartYearOf(date) {
    return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
}

// ================================================================
// LOCAL DATE HELPERS
// toISOString() converts to UTC first, which in Brisbane (UTC+10)
// gives yesterday's date before 10am, and new Date('YYYY-MM-DD')
// parses as UTC midnight. Use these wherever a calendar date is meant.
// ================================================================

function toLocalISODate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(str) {
    const [y, m, d] = String(str || '').slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

// e.g. "Oct 2026"
function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

// Zero-padded so keys sort correctly as strings ('2026-10' after '2026-09')
function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// The FY being viewed comes from the loaded file (appData.financialYear),
// so an archived year's file still shows that year. syncFinancialYear()
// updates these whenever data is loaded.
let { start: FY_START, end: FY_END } = getCurrentFinancialYear();

function syncFinancialYear() {
    ({ start: FY_START, end: FY_END } = getFinancialYearRange(appData.financialYear));
    const isPast = appData.financialYear < getCurrentFinancialYear().start.getFullYear();
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('fyYear', `${FY_START.getFullYear()}–${FY_END.getFullYear()}${appData.yearClosedOn ? ' (archived)' : isPast ? ' (past year)' : ''}`);
    set('fyStartYear', FY_START.getFullYear());
    set('fyEndYear', FY_END.getFullYear());
}

// Files saved before the year was stored: use the FY most of their
// income and expense dates fall in, or the current FY if they're empty.
function inferFinancialYear(data) {
    const counts = {};
    [...(data.income || []), ...(data.expenses || [])].forEach(item => {
        if (!item.date) return;
        const y = fyStartYearOf(parseLocalDate(item.date));
        if (!isNaN(y)) counts[y] = (counts[y] || 0) + 1;
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? Number(best[0]) : getCurrentFinancialYear().start.getFullYear();
}

// e.g. "finance_data_2026-2027.json" - derived from today's date so the
// suggested filename is always correct without ever needing a code change.
function getDefaultFileName() {
    return `finance_data_${FY_START.getFullYear()}-${FY_END.getFullYear()}.json`;
}

const DEFAULT_CATEGORIES = ['Food', 'Petrol', 'Home', 'Car', 'Subscriptions', 'Medical', 'Insurance', 'Utilities', 'Other'];

// Default Australian tax brackets (resident individual rates). These are
// app configuration, not personal data - they're editable per-file via the
// Tax tab and travel with whatever JSON file is loaded, same as everything
// else below.
const DEFAULT_TAX_BRACKETS = [
    { min: 0, max: 18200, rate: 0, description: 'Tax-free' },
    { min: 18201, max: 45000, rate: 0.15, description: '15% bracket' },
    { min: 45001, max: 135000, rate: 0.30, description: '30% bracket' },
    { min: 135001, max: 190000, rate: 0.37, description: '37% bracket' },
    { min: 190001, max: Infinity, rate: 0.45, description: '45% bracket' }
];

// ================================================================
// DEFAULT_DATA - fallback template ONLY, used the very first time the
// app is opened before any JSON file has been loaded (see normalizeAppData()/
// normalizeAppData() below). This must never contain real personal data -
// everything you actually enter lives exclusively in the JSON file you
// save/load (File > Save / Open), so the app itself stays a blank,
// reusable template from year to year.
// ================================================================
const DEFAULT_DATA = {
    financialYear: null,
    income: [],
    // Weeks the app has added for you (so a deleted one isn't added back)
    incomeAutoAdded: [],
    expenses: [],
    categories: DEFAULT_CATEGORIES,
    budgets: {
        'Food': 400,
        'Home': 5800,
        'Car': 250,
        'Other': 200,
        'Phone': 20,
        'Medical': 90
    },
    rates: { job1: 0, job2: 0, job3: 0 },
    phRates: { job1: 0, job2: 0, job3: 0 },
    // Per-job projection settings. Blank dates = no limit; expected hours
    // of 0 = project from that job's logged average instead. Pay cycle
    // (Theiss only - Avanale and Cinema are fixed, see JOBS): paid
    // payLagDays after the Thu-Wed week ends (0 = the Wednesday itself);
    // fortnightly cycles are lined up from payAnchor (any past payday).
    jobSettings: {
        job1: { startDate: '', endDate: '', expectedWeeklyHours: 0 },
        job2: { startDate: '', endDate: '', expectedWeeklyHours: 0 },
        job3: { startDate: '', endDate: '', expectedWeeklyHours: 0, payFrequency: 'weekly', payLagDays: 0, payAnchor: '' }
    },
    // Investments tab: holdings (symbol, shares, total paid in AUD), last
    // fetched prices and exchange rate, and daily portfolio value history
    investments: {
        apiKey: '',
        holdings: [],
        prices: {},
        fx: null,
        fxHistory: {},
        lastRefresh: null,
        history: [],
        // Daily closes for the charts (Twelve Data), per symbol
        historyApiKey: '',
        priceHistory: {},
        fxRange: null
    },
    // Planning tab: things you're saving for (bought in this order) and
    // the borrowing estimate's settings (blank = worked out for you)
    planning: {
        goals: [],
        borrowing: { purpose: 'PROPERTY', income: null, livingMonthly: null, rentWeekly: 0, rate: null, cash: 0 }
    },
    // Rates tab: settings, latest check, and history of checks
    rateTracker: {
        propertyValue: 0,
        loanPurpose: 'OWNER_OCCUPIED',
        filter: 'VARIABLE',
        lenders: [],
        costs: { discharge: 350, govtFees: 0, newLoanFees: 0, cashback: 0, currentAnnualFee: 0 },
        latest: null,
        selectedRate: null,
        sideBySide: [],
        history: []
    },
    loan: { 
        initial: 0, 
        currentBalance: 0, 
        rate: 6.0, 
        term: 30, 
        offset: 0,
        startDate: toLocalISODate()
    },
    taxBrackets: DEFAULT_TAX_BRACKETS,
    renovation: [],
    assets: [],
    liabilities: [],
    events: [],
    lists: [],
    pendingShifts: { job1: [], job2: [] },
    homeOfficeLog: []
};

// ================================================================
// SHARED HELPERS
// ================================================================

function getWeeksLogged() {
    return Math.max(1, (appData.income || []).length);
}

// Gross pay across all logged weeks (or a given subset), PH rates included.
// Every screen should use this rather than hours x base rate.
function getTotalIncome(weeks = appData.income || []) {
    return weeks.reduce((sum, w) => sum + (w.shifts || []).reduce((s, sh) => s + shiftPay(sh), 0), 0);
}

// Sum of budgets for categories that currently exist - ignores budget
// entries left behind by removed or renamed categories.
// Everything you own: assets entered on the Net Worth tab, your savings
// (the Home tab offset) and the share portfolio's latest value.
// Net Worth assets that are really the offset / savings account
function isSavingsAssetName(name) {
    return /offset|saving/i.test(name || '');
}

function getTotalAssets() {
    const manual = (appData.assets || []).reduce((s, a) => s + (a.value || 0), 0);
    return manual + (appData.loan?.offset || 0)
        + (typeof getInvestmentsValueAud === 'function' ? getInvestmentsValueAud() : 0);
}

function getTotalMonthlyBudget() {
    const budgets = appData.budgets || {};
    return (appData.categories || DEFAULT_CATEGORIES).reduce((s, cat) => s + (budgets[cat] || 0), 0);
}

// Totals per category for a list of expenses, e.g. { Food: 380, Home: 2100 }.
function sumExpensesByCategory(expenses) {
    const totals = {};
    expenses.forEach(e => {
        const cat = e.category || 'Other';
        totals[cat] = (totals[cat] || 0) + (e.amount || 0);
    });
    return totals;
}

// ================================================================
// SHARED DEFINITIONS
// Every screen uses these so the same question always gets the same
// answer: one tax rate, one meaning of "this FY", and averages taken
// over the same completed months.
// ================================================================

function isInFY(dateStr) {
    const d = parseLocalDate(dateStr);
    return d >= FY_START && d <= FY_END;
}

// Expenses counted in totals (not excluded) and dated in this FY
function getFYExpenses() {
    return getFilteredExpenses().filter(e => isInFY(e.date));
}

// Categories that have spending this FY but aren't in your category list
// (blank, old, renamed or differently spelt). They're always shown and
// counted, so no spending is ever hidden from the budget tables.
function getUnlistedCategories() {
    const listed = new Set(appData.categories || DEFAULT_CATEGORIES);
    return [...new Set(getFYExpenses().map(e => e.category || 'Other'))].filter(c => !listed.has(c)).sort();
}

// Your categories followed by any unlisted ones with spending
function getSpendingCategories() {
    return [...(appData.categories || DEFAULT_CATEGORIES), ...getUnlistedCategories()];
}

// Deductible expenses dated in this FY (excluded-from-totals ones still
// count - excluding only affects budgets, not tax)
function getFYDeductibleTotal() {
    return (appData.expenses || []).filter(e => e.deductible && isInFY(e.date)).reduce((s, e) => s + (e.amount || 0), 0);
}

// The one tax rate used everywhere: projected tax for the year (after
// this year's deductions) as a share of projected gross pay.
function getFYTaxRate() {
    const gross = getFYIncomeProjection().annual;
    if (gross <= 0) return 0;
    return calculateTax(Math.max(0, gross - getFYDeductibleTotal())).total / gross;
}

// Logged pay that has landed in each month of this FY, keyed 'YYYY-MM'
function getPaidIncomeByMonth() {
    const byMonth = {};
    getPayEvents().filter(e => e.actual && e.payDate >= FY_START && e.payDate <= FY_END).forEach(e => {
        const key = monthKey(e.payDate);
        byMonth[key] = (byMonth[key] || 0) + e.amount;
    });
    return byMonth;
}

// Finished months of this FY that have any data (logged pay or expenses),
// starting from the first such month - so months before you started
// tracking don't count as $0 and drag averages down. Never includes the
// current month, and stops at 30 June for past years.
function getCompletedFYMonths() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const withData = new Set([...Object.keys(getPaidIncomeByMonth()), ...getFYExpenses().map(e => monthKey(parseLocalDate(e.date)))]);
    const months = [];
    let started = false;
    for (let d = new Date(FY_START); d <= FY_END && d < currentMonthStart; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const key = monthKey(d);
        if (!started && !withData.has(key)) continue;
        started = true;
        months.push({ key, year: d.getFullYear(), month: d.getMonth(), weeks: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() / 7 });
    }
    return months;
}

// Average month over the completed months: pay received, tax, expenses
// and what was left. Null until a month has finished.
function getCompletedMonthsAverage() {
    const months = getCompletedFYMonths();
    if (months.length === 0) return null;
    const keys = new Set(months.map(m => m.key));
    const paid = getPaidIncomeByMonth();
    const gross = months.reduce((s, m) => s + (paid[m.key] || 0), 0);
    const expenses = getFYExpenses().filter(e => keys.has(monthKey(parseLocalDate(e.date)))).reduce((s, e) => s + (e.amount || 0), 0);
    const net = gross * (1 - getFYTaxRate());
    const n = months.length;
    const weeks = months.reduce((s, m) => s + m.weeks, 0);
    // Finished months with no pay logged usually mean shifts weren't entered
    const monthsWithoutPay = months.filter(m => !paid[m.key]).map(m => monthLabel(m.year, m.month));
    return {
        months, count: n, weeks, monthsWithoutPay,
        monthlyGross: gross / n, monthlyNet: net / n, monthlyExpenses: expenses / n,
        monthlySurplus: (net - expenses) / n,
        label: n === 1 ? months[0].key : `${months[0].key} to ${months[n - 1].key}`
    };
}

// ================================================================
// HOME LOAN MATHS - shared by the Home and Rates tabs
// ================================================================

function remainingLoanMonths(loan) {
    const start = loan.startDate ? parseLocalDate(loan.startDate) : new Date();
    const now = new Date();
    const elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    return Math.max(12, (loan.term || 30) * 12 - Math.max(0, elapsed));
}

// Banks calculate repayments on the full balance (the offset only
// reduces interest), over the term you have left.
function repaymentAt(balance, annualRate, months) {
    const r = annualRate / 12;
    if (balance <= 0) return 0;
    if (r === 0) return balance / months;
    return balance * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
}

// Minimum monthly repayment the way banks work it out: full balance
// over the term you have left. The offset doesn't lower the required
// repayment - it lowers the interest, so more of each payment goes to
// principal and the loan finishes early.
function calculateMonthlyRepayment(loan) {
    return repaymentAt(loan.currentBalance || 0, (loan.rate || 0) / 100, remainingLoanMonths(loan));
}

// Month-by-month payoff at a fixed monthly payment. Interest is charged
// on the balance minus the offset (offset assumed to stay the same).
// Returns the balance after each month and the total interest paid.
function simulateLoanPayoff(loan, monthlyPayment, maxMonths = 600) {
    const r = (loan.rate || 0) / 100 / 12;
    const offset = loan.offset || 0;
    let balance = loan.currentBalance || 0;
    let totalInterest = 0;
    const balances = [];
    while (balance > 0.005 && balances.length < maxMonths) {
        const interest = Math.max(0, balance - offset) * r;
        // Payment doesn't cover the interest: it never gets paid off
        if (monthlyPayment <= interest) return { balances, totalInterest, months: maxMonths, paidOff: false };
        totalInterest += interest;
        balance = Math.max(0, balance - (monthlyPayment - interest));
        balances.push(balance);
    }
    return { balances, totalInterest, months: balances.length, paidOff: balance <= 0.005 };
}

// Spare cash per month that could go to the loan on top of the required
// repayment: the average completed month's after-tax pay less expenses
// (which already include your mortgage repayments). 0 until a month of
// this FY has finished.
function getMonthlyLoanSurplus() {
    const avg = getCompletedMonthsAverage();
    return avg ? avg.monthlySurplus : 0;
}

// Dot-free unique ID (Math.random().toString(36) alone can contain a
// literal '.', which is harmless for getElementById but breaks anything
// that later treats the ID as a CSS selector).
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Escape text before putting it into innerHTML
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getTaxBrackets() {
    return appData.taxBrackets || DEFAULT_TAX_BRACKETS;
}

// Medicare levy low-income threshold (singles). No levy below it, then
// it phases in at 10c per dollar over the threshold until it reaches the
// full 2%. This is the 2024-25 figure - check ato.gov.au each year.
const MEDICARE_LOW_INCOME_THRESHOLD = 27222;

// Low Income Tax Offset: $700, reduced by 5c/$ from $37,500 to $45,000,
// then by 1.5c/$ until it runs out at $66,667.
function lowIncomeTaxOffset(income) {
    if (income <= 37500) return 700;
    if (income <= 45000) return 700 - (income - 37500) * 0.05;
    if (income <= 66667) return 325 - (income - 45000) * 0.015;
    return 0;
}

// Brackets are inclusive whole-dollar ranges (0-18200, 18201-45000...),
// so each bracket taxes the dollars above the previous bracket's max.
function calculateTax(income) {
    income = Math.max(0, income || 0);
    const breakdown = [];
    let grossTax = 0;
    for (const bracket of getTaxBrackets()) {
        const lower = bracket.min > 0 ? bracket.min - 1 : 0;
        const taxable = Math.max(0, Math.min(income, bracket.max) - lower);
        if (taxable <= 0) continue;
        const amount = taxable * bracket.rate;
        breakdown.push({ bracket, taxable, amount });
        grossTax += amount;
    }
    const lito = Math.min(grossTax, lowIncomeTaxOffset(income));
    const tax = grossTax - lito;
    const medicare = Math.max(0, Math.min(income * 0.02, (income - MEDICARE_LOW_INCOME_THRESHOLD) * 0.10));
    return { tax, grossTax, lito, medicare, total: tax + medicare, breakdown };
}


// ================================================================
// NEW FINANCIAL YEAR
// Settings and running records carry over; the year's transactions
// don't. Income work done in late June but paid in July belongs to the
// new year (pay counts when it lands), so those shifts come across too.
// ================================================================

function buildNewYearData(old, newYear) {
    const copy = value => JSON.parse(JSON.stringify(value ?? null));
    const newStart = getFinancialYearRange(newYear).start;
    const carriedIncome = (old.income || [])
        .map(w => ({ ...copy(w), shifts: (w.shifts || []).filter(sh => getPayDate(sh.job, w.date) >= newStart).map(copy) }))
        .filter(w => w.shifts.length > 0);

    return {
        financialYear: newYear,
        income: carriedIncome,
        expenses: [],
        homeOfficeLog: [],
        categories: copy(old.categories),
        budgets: copy(old.budgets),
        rates: copy(old.rates),
        phRates: copy(old.phRates),
        jobSettings: copy(old.jobSettings),
        loan: copy(old.loan),
        taxBrackets: copy(old.taxBrackets),
        rateTracker: copy(old.rateTracker),
        investments: copy(old.investments),
        planning: copy(old.planning),
        assets: copy(old.assets),
        liabilities: copy(old.liabilities),
        renovation: copy(old.renovation),
        events: copy(old.events),
        lists: copy(old.lists)
    };
}

// ================================================================
// DATA NORMALIZATION
// ================================================================

function deepMergeDefaults(defaults, data) {
    if (Array.isArray(defaults)) {
        return (data !== undefined && data !== null && Array.isArray(data))
            ? data
            : JSON.parse(JSON.stringify(defaults));
    }
    if (defaults !== null && typeof defaults === 'object') {
        const result = {};
        const dataIsObject = data !== null && typeof data === 'object' && !Array.isArray(data);
        const keys = new Set([
            ...Object.keys(defaults),
            ...(dataIsObject ? Object.keys(data) : [])
        ]);
        keys.forEach(key => {
            result[key] = deepMergeDefaults(defaults[key], dataIsObject ? data[key] : undefined);
        });
        return result;
    }
    return (data !== undefined && data !== null) ? data : defaults;
}

function normalizeAppData(rawData) {
    const normalized = deepMergeDefaults(DEFAULT_DATA, (rawData && typeof rawData === 'object') ? rawData : {});

    normalized.financialYear = Number.isInteger(rawData?.financialYear)
        ? rawData.financialYear
        : inferFinancialYear(normalized);

    // Budgets are user data, not structure: if the file has its own
    // budgets, use exactly those rather than merging the template's
    // example budgets back in for any category the file doesn't have.
    if (rawData && rawData !== DEFAULT_DATA && rawData.budgets && typeof rawData.budgets === 'object') {
        normalized.budgets = { ...rawData.budgets };
    }

    ['job1', 'job2'].forEach(key => {
        const s = normalized.jobSettings?.[key];
        if (s) { delete s.payFrequency; delete s.payLagDays; delete s.payAnchor; }
    });

    // Holdings are purchases ("lots") with a US$ price paid per share and a
    // purchase date. Older files stored an A$ figure instead (a total as
    // costAud, or per share as costPerShareAud) and no date; there's no way
    // to know the US$ price from that, so it's kept only as a reminder.
    if (normalized.investments && Array.isArray(normalized.investments.holdings)) {
        normalized.investments.holdings = normalized.investments.holdings.map(h => {
            if (h.id && 'costPerShareUsd' in h) {
                // Own exchange rates (a removed feature) are dropped; the market rate is used
                const { paidFx, ...lot } = h;
                const sold = h.sold ? (({ paidFx: _, ...rest }) => rest)(h.sold) : null;
                return { ...lot, sold };
            }
            const legacy = h.costPerShareAud !== undefined ? parseFloat(h.costPerShareAud) || 0
                : h.costAud !== undefined && h.shares > 0 ? (parseFloat(h.costAud) || 0) / h.shares : 0;
            const { costAud, costPerShareAud, ...rest } = h;
            return {
                ...rest, id: h.id || genId(), costPerShareUsd: h.costPerShareUsd ?? null,
                purchaseDate: h.purchaseDate || '', purchaseFx: h.purchaseFx || null, sold: h.sold || null,
                ...(legacy > 0 ? { legacyCostPerShareAud: legacy } : {})
            };
        });
    }

    // Amounts stored as text (older files, hand edits) would be joined like
    // text instead of added ("50" + "30" = "5030"), so make them numbers.
    const toNumber = v => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : 0; };

    // Expenses: ensure each has excludeFromTotals (default false)
    normalized.expenses = (normalized.expenses || []).map(e => ({
        ...e,
        amount: toNumber(e.amount),
        deductible: e.deductible || false,
        excludeFromTotals: e.excludeFromTotals || false
    }));

    normalized.assets = (normalized.assets || []).map(a => ({
        ...a,
        value: toNumber(a.value),
        lastUpdated: a.lastUpdated || null
    }));
    // Savings are the Home tab offset. Older files kept them as a Net Worth
    // asset too: drop those, keeping their figure if the Home tab has none.
    const savingsAssets = normalized.assets.filter(a => isSavingsAssetName(a.name));
    if (savingsAssets.length) {
        normalized.loan = normalized.loan || {};
        if (!toNumber(normalized.loan.offset)) normalized.loan.offset = savingsAssets[0].value;
        normalized.assets = normalized.assets.filter(a => !isSavingsAssetName(a.name));
    }
    // Each purchase has its own buffer (what must still be left in the
    // offset after buying it). Older files had one buffer for the plan.
    if (normalized.planning) {
        const oldBuffer = toNumber(normalized.planning.buffer);
        normalized.planning.goals = (normalized.planning.goals || []).map(g => ({
            ...g, buffer: g.buffer !== undefined ? toNumber(g.buffer) : oldBuffer
        }));
        delete normalized.planning.buffer;
        delete normalized.planning.monthlySaving;
    }

    normalized.liabilities = (normalized.liabilities || []).map(l => ({ ...l, value: toNumber(l.value) }));

    Object.keys(normalized.budgets || {}).forEach(cat => { normalized.budgets[cat] = toNumber(normalized.budgets[cat]); });

    normalized.events = (normalized.events || []).map(e => ({
        id: e.id || genId(),
        title: e.title || 'Untitled',
        date: e.date || toLocalISODate(),
        startTime: e.startTime || '09:00',
        endTime: e.endTime || '10:00',
        details: e.details || '',
        recurrence: e.recurrence || 'none',
        recurrenceEnd: e.recurrenceEnd || null
    }));

    normalized.lists = (normalized.lists || []).map(l => ({
        id: l.id || genId(),
        name: l.name || 'Untitled list',
        items: (l.items || []).map(it => ({
            id: it.id || genId(),
            text: it.text || '',
            done: it.done || false,
            starred: it.starred || false
        }))
    }));

    // Shopping now lives in its own shared document; older files carried it here
    if (normalized.shopping) normalized.shopping = normalizeShopping(normalized.shopping);
    else delete normalized.shopping;

    // Income: convert old format (hours1/hours2) to shifts if needed
    normalized.income = (normalized.income || []).map(week => {
        if (week.shifts && week.shifts.length > 0) {
            return { ...week, shifts: week.shifts.map(sh => ({ ...sh, job: toNumber(sh.job), hours: toNumber(sh.hours) })) };
        }
        // Old format: convert hours1/hours2 to shifts
        const shifts = [];
        if (week.hours1 > 0) {
            shifts.push({ job: 1, hours: week.hours1, id: genId() });
        }
        if (week.hours2 > 0) {
            shifts.push({ job: 2, hours: week.hours2, id: genId() });
        }
        return {
            ...week,
            shifts: shifts,
            hours1: undefined,
            hours2: undefined
        };
    });

    normalized.pendingShifts = {
        job1: Array.isArray(normalized.pendingShifts?.job1) ? normalized.pendingShifts.job1.filter(h => typeof h === 'number' && h > 0) : [],
        job2: Array.isArray(normalized.pendingShifts?.job2) ? normalized.pendingShifts.job2.filter(h => typeof h === 'number' && h > 0) : []
    };

    normalized.homeOfficeLog = (normalized.homeOfficeLog || []).map(e => ({
        id: e.id || genId(),
        date: e.date || toLocalISODate(),
        hours: typeof e.hours === 'number' ? e.hours : (parseFloat(e.hours) || 0),
        notes: e.notes || ''
    }));

    // JSON has no Infinity, so the top tax bracket's `max` is saved as
    // null and restored to Infinity here.
    normalized.taxBrackets = (normalized.taxBrackets || []).map((b, i, arr) => {
        if (b.max === null || b.max === undefined) {
            return { ...b, max: i === arr.length - 1 ? Infinity : b.max };
        }
        return b;
    });

    return normalized;
}