// ================================================================
// RATE TRACKER - Home loan rates from banks' public Open Banking
// (Consumer Data Right) product data, plus a refinance calculator.
//
// Every Australian bank publishes its products at
//   <publicBaseUri>/cds-au/v1/banking/products
// with no login or API key, and allows browser requests, so this runs
// entirely in the page. Nothing about you is sent to the banks - the
// requests only ask for their public product lists.
// ================================================================

const CDR_REGISTER_URL = 'https://api.cdr.gov.au/cdr-register/v1/banking/data-holders/brands/summary';
// Versions of the product standard, newest first. Banks are meant to
// answer with the newest they support, but some refuse a version they
// don't have with HTTP 406, so the next one down is tried. (CommBank's
// product details only answer version 7.)
const CDR_VERSIONS = ['7', '6', '5', '4', '3'];
const cdrVersionByHost = {};
const RATE_HISTORY_LIMIT = 200;
const LATEST_RATES_LIMIT = 100;

// Lenders checked by default. Any other bank can be added from the
// government register on the Rates tab.
const DEFAULT_LENDERS = [
    { name: 'CommBank', baseUri: 'https://api.commbank.com.au/public' },
    { name: 'ANZ', baseUri: 'https://api.anz' },
    { name: 'Westpac', baseUri: 'https://digital-api.westpac.com.au' },
    { name: 'NAB', baseUri: 'https://openbank.api.nab.com.au' },
    { name: 'ING', baseUri: 'https://id.ob.ing.com.au' },
    { name: 'Macquarie', baseUri: 'https://api.macquariebank.io' },
    { name: 'UBank', baseUri: 'https://public.cdr-api.86400.com.au' },
    { name: 'Unloan', baseUri: 'https://public.api.cdr.unloan.com.au' },
    { name: 'Great Southern Bank', baseUri: 'https://api.open-banking.greatsouthernbank.com.au' },
    { name: 'Bank Australia', baseUri: 'https://public.cdr.bankaust.com.au' },
    { name: 'BOQ', baseUri: 'https://api.cds.boq.com.au' },
    { name: 'Bendigo Bank', baseUri: 'https://api.cdr.bendigobank.com.au' },
    { name: 'St.George', baseUri: 'https://digital-api.stgeorge.com.au' },
    { name: 'Bankwest', baseUri: 'https://open-api.bankwest.com.au/bwpublic' },
    { name: 'RACQ Bank', baseUri: 'https://cdrbank.racq.com.au' },
    { name: 'People First and Heritage Bank', baseUri: 'https://public.openbanking.peoplefirstbank.com.au' },
    { name: 'Queensland Country Bank', baseUri: 'https://public.cdr-api.queenslandcountry.bank' }
];

// Tracker state lives in the data file. An empty lender list means
// "use the defaults"; once you change it, the full list is saved.
function getRateTracker() {
    const rt = appData.rateTracker;
    if (!rt.lenders || rt.lenders.length === 0) {
        rt.lenders = DEFAULT_LENDERS.map(l => ({ ...l, enabled: true }));
    }
    return rt;
}

// ================================================================
// FETCHING
// ================================================================

async function cdrGet(url, timeoutMs = 20000) {
    // Remembered per bank and endpoint (list vs one product's detail can differ)
    const u = new URL(url);
    const host = u.host + u.pathname.replace(/\/products\/[^/]+$/, '/products/:id');
    for (let i = Math.max(0, CDR_VERSIONS.indexOf(cdrVersionByHost[host])); i < CDR_VERSIONS.length; i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { headers: { 'x-v': CDR_VERSIONS[i], 'x-min-v': '1' }, signal: controller.signal });
            if (res.status === 406 && i < CDR_VERSIONS.length - 1) continue;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            cdrVersionByHost[host] = CDR_VERSIONS[i];
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }
}

// Run async jobs with at most `limit` in flight, so a refresh doesn't
// fire a couple of hundred requests at once.
async function runLimited(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function lane() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
    return results;
}

async function fetchMortgageProducts(lender) {
    const products = [];
    let url = `${lender.baseUri}/cds-au/v1/banking/products?product-category=RESIDENTIAL_MORTGAGES&page-size=100`;
    for (let page = 0; url && page < 10; page++) {
        const json = await cdrGet(url);
        products.push(...(json.data?.products || []));
        url = json.links?.next || null;
    }
    return products;
}

// '0.60' and '60' both mean 60% - lenders aren't consistent.
function toFraction(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    return n > 1 ? n / 100 : n;
}

// 'P3Y' -> 3, 'P36M' -> 3, 'P18M' -> 1.5
function isoDurationYears(duration) {
    const m = /^P(?:(\d+)Y)?(?:(\d+)M)?/.exec(duration || '');
    if (!m) return null;
    const years = (parseInt(m[1]) || 0) + (parseInt(m[2]) || 0) / 12;
    return years > 0 ? years : null;
}

// Loans only some people can get (left out of the results). Matched
// against the product name and the lender's eligibility notes (not the
// marketing description).
const RESTRICTED_PATTERN = /defen[cs]e force|\bADF\b|clean energy|\bgreen\b|first home|single parent|\bstaff\b|employee|student|graduate|medical|essential worker|seniors|reverse mortgage/i;
// Loan types that only matter in the product name - eligibility notes
// often list e.g. "properties under construction" as exclusions.
// "Sustainable" loans only fund energy upgrades (e.g. Westpac's).
const RESTRICTED_NAME_PATTERN = /bridging|construction|sustainab/i;

function findRestriction(product) {
    if (RESTRICTED_NAME_PATTERN.test(product.name || '')) return product.name;
    const texts = [product.name || '', ...(product.eligibility || []).map(e => e.additionalInfo || '')];
    for (const text of texts) {
        if (RESTRICTED_PATTERN.test(text)) return text.length > 140 ? text.slice(0, 140) + '...' : text;
    }
    return null;
}

// What a loan comes with: offset, redraw, extra repayments, fees and
// loan-size limits, from one product's detail. Notes are trimmed so the
// data file stays small.
function extractLoanDetails(product) {
    const feature = type => (product.features || []).find(f => f.featureType === type);
    const note = f => f ? String(f.additionalInfo || f.additionalValue || '').trim().slice(0, 300) : '';
    const constraint = type => {
        const c = (product.constraints || []).find(c => c.constraintType === type);
        return c && parseFloat(c.additionalValue) > 0 ? parseFloat(c.additionalValue) : null;
    };
    // Newer versions of the standard put the amount in fixedAmount
    const fees = (product.fees || []).filter(fee => fee.name).slice(0, 25).map(fee => {
        const raw = fee.fixedAmount?.amount ?? fee.amount;
        const amount = raw !== undefined && raw !== null && raw !== '' && !isNaN(parseFloat(raw)) ? parseFloat(raw) : null;
        return { name: String(fee.name).slice(0, 80), type: fee.feeType || 'OTHER', amount, period: fee.additionalValue || null };
    });
    // Periodic fees as a yearly cost ('P1M' x 12, 'P6M' x 2; no period = yearly)
    const perYear = fee => fee.amount / (isoDurationYears(fee.period) || 1);
    const total = (type, fn = fee => fee.amount) => fees.filter(fee => fee.type === type && fee.amount !== null).reduce((sum, fee) => sum + fn(fee), 0);
    const offset = feature('OFFSET'), redraw = feature('REDRAW'), extra = feature('EXTRA_REPAYMENTS');
    return {
        offset: !!offset, offsetNote: note(offset),
        redraw: !!redraw, redrawNote: note(redraw),
        extraRepayments: !!extra, extraNote: note(extra),
        annualFee: Math.round(total('PERIODIC', perYear) * 100) / 100,
        upfrontFees: total('UPFRONT'),
        exitFees: total('EXIT'),
        fees,
        minLoan: constraint('MIN_LIMIT'), maxLoan: constraint('MAX_LIMIT'),
        url: product.additionalInformation?.overviewUri || product.applicationUri || null
    };
}

// Offsets are usually only on the variable part of a loan: a lender note
// like "can only be linked to variable rate loans" means none when fixed.
function hasOffset(details, type) {
    if (!details || !details.offset) return false;
    return !(type === 'FIXED' && /variable/i.test(details.offsetNote) && !/fixed/i.test(details.offsetNote));
}

// A short label for the extra repayments allowed, e.g. "up to $10,000/yr"
// for fixed loans that cap them; the full note is in the details. A cap
// in a note that talks about fixed rates doesn't apply to variable ones.
function extraRepaymentLabel(details, type) {
    if (!details || !details.extraRepayments) return null;
    const cap = /\$\s?([\d,]+)/.exec(details.extraNote);
    if (cap && (type === 'FIXED' || !/fixed/i.test(details.extraNote)) && /year|annual|anniversary|12.month|per annum/i.test(details.extraNote)) {
        return `up to $${cap[1]}/yr`;
    }
    return 'yes';
}

// Pull the owner-occupied (or investment) principal & interest rates out
// of one product's detail, keeping the LVR and loan-size limits each
// rate applies to.
function extractLendingRates(lenderName, product, loanPurpose) {
    const restriction = findRestriction(product);
    const details = extractLoanDetails(product);
    return (product.lendingRates || [])
        .filter(r => (r.lendingRateType === 'VARIABLE' || r.lendingRateType === 'FIXED')
            && (!r.loanPurpose || r.loanPurpose === loanPurpose)
            && (!r.repaymentType || r.repaymentType === 'PRINCIPAL_AND_INTEREST'))
        .map(r => {
            let lvrMin = null, lvrMax = null, balanceMin = null, balanceMax = null;
            (r.tiers || []).forEach(t => {
                if (t.unitOfMeasure === 'PERCENT') {
                    lvrMin = toFraction(t.minimumValue);
                    lvrMax = toFraction(t.maximumValue);
                } else if (t.unitOfMeasure === 'DOLLAR') {
                    balanceMin = t.minimumValue != null ? parseFloat(t.minimumValue) : null;
                    balanceMax = t.maximumValue != null ? parseFloat(t.maximumValue) : null;
                }
            });
            return {
                lender: lenderName,
                product: product.name,
                restriction,
                type: r.lendingRateType,
                fixedYears: r.lendingRateType === 'FIXED' ? isoDurationYears(r.additionalValue) : null,
                rate: parseFloat(r.rate),
                comparisonRate: r.comparisonRate != null ? parseFloat(r.comparisonRate) : null,
                lvrMin, lvrMax, balanceMin, balanceMax,
                key: `${lenderName}|${product.name}`,
                details
            };
        })
        .filter(r => r.rate > 0 && r.rate < 0.2);
}

async function fetchLenderRates(lender, loanPurpose, onProduct) {
    const products = await fetchMortgageProducts(lender);
    const details = await runLimited(products, 4, async p => {
        try {
            const json = await cdrGet(`${lender.baseUri}/cds-au/v1/banking/products/${encodeURIComponent(p.productId)}`);
            return json.data;
        } catch (e) {
            return null;
        } finally {
            if (onProduct) onProduct();
        }
    });
    return details.filter(Boolean).flatMap(d => extractLendingRates(lender.name, d, loanPurpose));
}

// ================================================================
// ELIGIBILITY & CALCULATIONS
// ================================================================

function getPropertyValue() {
    const rt = getRateTracker();
    if (rt.propertyValue > 0) return rt.propertyValue;
    const house = (appData.assets || []).find(a => /house|home|property/i.test(a.name || ''));
    return house ? house.value : 0;
}

function getCurrentLVR() {
    const value = getPropertyValue();
    const balance = appData.loan?.currentBalance || 0;
    return value > 0 ? balance / value : null;
}

// Tiers are bands like 0-60%, 60-70%: the lower bound is exclusive
// (except 0) so an LVR of exactly 60% only lands in one band. Some
// lenders (ING) write bands as 61-70%, meaning "over 60%".
function isRateEligible(r, lvr, balance) {
    if (lvr !== null) {
        if (r.lvrMax !== null && lvr > r.lvrMax + 1e-9) return false;
        if (r.lvrMin !== null && r.lvrMin > 0.02) {
            const wholePercentAbove = Math.round(r.lvrMin * 100) % 10 === 1;
            const lower = wholePercentAbove ? r.lvrMin - 0.01 : r.lvrMin;
            if (lvr <= lower + 1e-9) return false;
        }
    }
    if (r.balanceMin !== null && balance < r.balanceMin) return false;
    if (r.balanceMax !== null && balance > r.balanceMax) return false;
    return true;
}

function getSwitchingCost() {
    const c = getRateTracker().costs || {};
    return (c.discharge || 0) + (c.govtFees || 0) + (c.newLoanFees || 0) - (c.cashback || 0);
}

// The selected loan's details, saved with the latest check
function getSelectedDetails() {
    const rt = getRateTracker();
    const key = rt.selectedRate?.key;
    return key ? rt.latest?.details?.[key] || null : null;
}

// What switching to `newRate` (a fraction, e.g. 0.0599) is worth. With
// the new loan's details, its annual fee is compared with yours, and if it
// has neither an offset nor redraw your offset savings stop saving interest.
function refinanceComparison(newRate, details = null, type = 'VARIABLE') {
    const loan = appData.loan || {};
    const balance = loan.currentBalance || 0;
    const loseOffset = !!details && !hasOffset(details, type) && !details.redraw;
    const currentInterestBalance = Math.max(0, balance - (loan.offset || 0));
    const newInterestBalance = loseOffset ? balance : currentInterestBalance;
    const currentRate = (loan.rate || 0) / 100;
    const months = remainingLoanMonths(loan);
    const monthlyInterestSaving = (currentInterestBalance * currentRate - newInterestBalance * newRate) / 12;
    const annualFeeDiff = details ? details.annualFee - (getRateTracker().costs?.currentAnnualFee || 0) : 0;
    const monthlySaving = monthlyInterestSaving - annualFeeDiff / 12;
    const switchingCost = getSwitchingCost();
    return {
        currentRate, newRate, months, switchingCost, monthlySaving, annualFeeDiff, loseOffset,
        currentRepayment: repaymentAt(balance, currentRate, months),
        newRepayment: repaymentAt(balance, newRate, months),
        breakEvenMonths: monthlySaving > 0 ? switchingCost / monthlySaving : null,
        firstYearNet: monthlySaving * 12 - switchingCost
    };
}

// ================================================================
// REFRESH
// ================================================================

let rateRefreshInProgress = false;

async function refreshRates() {
    if (rateRefreshInProgress) return;
    const rt = getRateTracker();
    const lenders = rt.lenders.filter(l => l.enabled);
    if (lenders.length === 0) return alert('Tick at least one lender first.');

    rateRefreshInProgress = true;
    renderRateTracker();
    let productsDone = 0, lendersDone = 0;
    // Look the element up each time - other edits can re-render the tab
    const showProgress = () => {
        const status = document.getElementById('rateRefreshStatus');
        if (status) status.textContent = `Checking lenders... ${lendersDone}/${lenders.length} done, ${productsDone} products read`;
    };
    showProgress();

    const failed = [];
    const perLender = await runLimited(lenders, 3, async lender => {
        try {
            return await fetchLenderRates(lender, rt.loanPurpose, () => { productsDone++; showProgress(); });
        } catch (e) {
            failed.push(`${lender.name} (${e.name === 'AbortError' ? 'timed out' : e.message})`);
            return [];
        } finally {
            lendersDone++;
            showProgress();
        }
    });
    const allRates = perLender.flat();

    const lvr = getCurrentLVR();
    const balance = appData.loan?.currentBalance || 0;
    const eligible = allRates.filter(r => !r.restriction && isRateEligible(r, lvr, balance)).sort((a, b) => a.rate - b.rate);
    const bestVariable = eligible.find(r => r.type === 'VARIABLE') || null;
    const bestFixed = eligible.find(r => r.type === 'FIXED') || null;
    // Details once per product, not repeated on every rate
    const kept = eligible.slice(0, LATEST_RATES_LIMIT);
    const details = {};
    kept.forEach(r => { details[r.key] = r.details; });

    rt.latest = {
        fetchedAt: new Date().toISOString(),
        lvr, loanPurpose: rt.loanPurpose,
        lendersChecked: lenders.length - failed.length,
        failed,
        rates: kept.map(({ details, restriction, ...r }) => r),
        details
    };
    rt.history.push({
        date: toLocalISODate(),
        yourRate: appData.loan?.rate || 0,
        lvr,
        bestVariable: bestVariable ? { lender: bestVariable.lender, product: bestVariable.product, rate: bestVariable.rate } : null,
        bestFixed: bestFixed ? { lender: bestFixed.lender, product: bestFixed.product, rate: bestFixed.rate, years: bestFixed.fixedYears } : null
    });
    if (rt.history.length > RATE_HISTORY_LIMIT) rt.history = rt.history.slice(-RATE_HISTORY_LIMIT);
    if (bestVariable) selectRate(bestVariable);

    rateRefreshInProgress = false;
    renderRateTracker();
    setStatus('Rates updated - remember to save (Ctrl+S)');
}

// ================================================================
// SETTINGS HANDLERS
// ================================================================

function updateRateSettings() {
    const rt = getRateTracker();
    const num = id => parseFloat(document.getElementById(id).value) || 0;
    rt.propertyValue = num('rtPropertyValue');
    rt.loanPurpose = document.getElementById('rtLoanPurpose').value;
    rt.costs = {
        discharge: num('rtDischarge'),
        govtFees: num('rtGovtFees'),
        newLoanFees: num('rtNewLoanFees'),
        cashback: num('rtCashback'),
        currentAnnualFee: num('rtCurrentAnnualFee')
    };
    renderRateTracker();
}

function setRateFilter(filter) {
    getRateTracker().filter = filter;
    renderRateTracker();
}

// Compare a loan: its published upfront fees fill in "New loan fees"
// (you can still change them).
function selectRate(r) {
    const rt = getRateTracker();
    rt.selectedRate = { lender: r.lender, product: r.product, rate: r.rate, type: r.type, key: r.key };
    const details = rt.latest?.details?.[r.key];
    if (details) rt.costs = { ...(rt.costs || {}), newLoanFees: details.upfrontFees };
}

function selectRateForComparison(idx) {
    const r = getRateTracker().latest?.rates?.[idx];
    if (!r) return;
    selectRate(r);
    renderRateTracker();
}

// Side by side: up to two loans from the table (picking a third replaces
// the older one). A copy of each is kept so it survives the next check.
function toggleSideBySide(idx) {
    const rt = getRateTracker();
    const r = rt.latest?.rates?.[idx];
    if (!r) return;
    const same = s => s.key === r.key && s.type === r.type && s.rate === r.rate && s.fixedYears === r.fixedYears;
    const list = rt.sideBySide || [];
    rt.sideBySide = list.some(same)
        ? list.filter(s => !same(s))
        : [...list, { lender: r.lender, product: r.product, rate: r.rate, comparisonRate: r.comparisonRate, type: r.type, fixedYears: r.fixedYears, key: r.key }].slice(-2);
    renderRateTracker();
}

function clearSideBySide() {
    getRateTracker().sideBySide = [];
    renderRateTracker();
}

// What one loan would cost you: repayment on your balance, roughly this
// year's interest (on your balance less offset, if the loan has an offset
// or redraw to hold that money) and its fees.
function loanCostForYou(r, details) {
    const loan = appData.loan || {};
    const balance = loan.currentBalance || 0;
    const keepsOffset = !details || hasOffset(details, r.type) || details.redraw;
    const interest = Math.max(0, balance - (keepsOffset ? loan.offset || 0 : 0)) * r.rate;
    const annualFees = details ? details.annualFee : 0;
    const upfront = details ? details.upfrontFees : 0;
    return {
        repayment: repaymentAt(balance, r.rate, remainingLoanMonths(loan)),
        interest, annualFees, upfront, keepsOffset,
        yearly: interest + annualFees,
        firstYear: interest + annualFees + upfront
    };
}

// Which of two loans is cheaper for you, and when the cheaper one catches
// up if it costs more upfront
function compareTwoLoans(a, b) {
    const diff = b.yearly - a.yearly;
    if (Math.abs(diff) < 1) return { cheaper: null, perYear: 0, catchUpMonths: null };
    const [cheap, dear] = diff < 0 ? [b, a] : [a, b];
    const extraUpfront = cheap.upfront - dear.upfront;
    return {
        cheaper: diff < 0 ? 'B' : 'A',
        perYear: Math.abs(diff),
        catchUpMonths: extraUpfront > 0 ? extraUpfront / (Math.abs(diff) / 12) : null
    };
}

let expandedRateKey = null;
function toggleRateDetails(key) {
    expandedRateKey = expandedRateKey === key ? null : key;
    renderRateTracker();
}

function toggleLender(idx, enabled) {
    getRateTracker().lenders[idx].enabled = enabled;
    renderRateTracker();
}

function removeLender(idx) {
    getRateTracker().lenders.splice(idx, 1);
    renderRateTracker();
}

let cdrRegisterCache = null;

async function loadLenderRegister() {
    const select = document.getElementById('rtAddLender');
    select.innerHTML = '<option>Loading bank list...</option>';
    try {
        if (!cdrRegisterCache) {
            const brands = [];
            for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
                const res = await fetch(`${CDR_REGISTER_URL}?page=${page}&page-size=100`, { headers: { 'x-v': '1' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                brands.push(...(json.data || []));
                pages = json.meta?.totalPages || 1;
            }
            cdrRegisterCache = brands
                .filter(b => b.publicBaseUri)
                .map(b => ({ name: b.brandName, baseUri: b.publicBaseUri.replace(/\/$/, '') }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        const have = new Set(getRateTracker().lenders.map(l => l.baseUri));
        select.innerHTML = '<option value="">Choose a bank to add...</option>' + cdrRegisterCache
            .map((b, i) => have.has(b.baseUri) ? '' : `<option value="${i}">${escapeHtml(b.name)}</option>`)
            .join('');
    } catch (e) {
        select.innerHTML = '<option value="">Could not load the bank list</option>';
    }
}

function addLenderFromRegister(value) {
    if (value === '' || !cdrRegisterCache) return;
    const brand = cdrRegisterCache[parseInt(value)];
    if (!brand) return;
    getRateTracker().lenders.push({ ...brand, enabled: true });
    renderRateTracker();
}

// ================================================================
// RENDER
// ================================================================

function pct(fraction, digits = 2) {
    return fraction === null || fraction === undefined ? '—' : (fraction * 100).toFixed(digits) + '%';
}

function money(n) {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 0 });
}

function renderRateTracker() {
    const container = document.getElementById('rateTracker');
    if (!container) return;
    const rt = getRateTracker();
    const loan = appData.loan || {};
    const yourRate = (loan.rate || 0) / 100;
    const lvr = getCurrentLVR();
    const latest = rt.latest;
    const filter = rt.filter || 'VARIABLE';
    // Checks saved before special-eligibility loans were dropped still have them
    const visible = r => !r.restriction;

    // ---- Summary ----
    const bestVariable = latest?.rates?.find(r => r.type === 'VARIABLE' && visible(r));
    const gap = bestVariable ? yourRate - bestVariable.rate : null;
    const fetchedLabel = latest ? new Date(latest.fetchedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
    const lvrChanged = latest && lvr !== null && latest.lvr !== null && Math.abs(lvr - latest.lvr) > 0.005;

    const summaryHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;">
            <div class="tax-item"><div class="label">Your rate</div><div class="value" style="color:var(--c-blue);">${pct(yourRate)}</div></div>
            <div class="tax-item"><div class="label">Your LVR</div><div class="value" style="color:var(--c-cyan);">${lvr === null ? 'Set property value' : pct(lvr, 1)}</div></div>
            <div class="tax-item"><div class="label">Best variable found</div>
                <div class="value" style="color:var(--green);">${bestVariable ? pct(bestVariable.rate) : '—'}</div>
                <div class="label">${bestVariable ? escapeHtml(bestVariable.lender) + ' · ' + escapeHtml(bestVariable.product) : 'Refresh to check'}</div></div>
            <div class="tax-item"><div class="label">Gap to best</div>
                <div class="value" style="color:${gap > 0 ? 'var(--amber)' : 'var(--green)'};">${gap === null ? '—' : (gap > 0 ? '+' : '') + (gap * 100).toFixed(2) + '%'}</div>
                <div class="label private">${gap === null ? '' : gap > 0 ? `≈ ${money(Math.max(0, (loan.currentBalance || 0) - (loan.offset || 0)) * gap)}/yr in interest` : 'at or below the best'}</div></div>
        </div>
        <div class="form-row" style="margin-top:14px;">
            <button class="btn btn-primary" onclick="refreshRates()" ${rateRefreshInProgress ? 'disabled' : ''}>↻ Check rates now</button>
            <span id="rateRefreshStatus" style="font-size:12px;color:var(--text-muted);">
                Last checked: ${fetchedLabel}${latest ? ` · ${latest.lendersChecked} lenders` : ''}
                ${latest?.failed?.length ? ` · <span style="color:var(--amber);">couldn't reach: ${latest.failed.map(escapeHtml).join(', ')}</span>` : ''}
                ${lvrChanged ? ' · <span style="color:var(--amber);">your LVR has changed since - check again</span>' : ''}
            </span>
        </div>
    `;

    // ---- Refinance calculator ----
    const selected = rt.selectedRate;
    let refiHtml = '<div class="empty-state" style="padding:20px;"><div class="message">Press "Vs mine" on a loan below</div></div>';
    if (selected) {
        const details = getSelectedDetails();
        const c = refinanceComparison(selected.rate, details, selected.type);
        const breakEven = c.breakEvenMonths === null
            ? '<span style="color:var(--red);">Never - it isn\'t cheaper</span>'
            : c.breakEvenMonths < 1 ? 'Under a month' : `${Math.ceil(c.breakEvenMonths)} months`;
        const offsetText = !details ? '' : hasOffset(details, selected.type) ? 'offset ✓'
            : details.redraw ? '<span style="color:var(--amber);">no offset - redraw only</span>' : '<span style="color:var(--red);">no offset or redraw</span>';
        refiHtml = `
            <div style="font-size:13px;margin-bottom:4px;">vs <strong>${escapeHtml(selected.lender)} · ${escapeHtml(selected.product)}</strong> at <strong>${pct(selected.rate)}</strong></div>
            ${details ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${offsetText} · annual fees ${money(details.annualFee)} · upfront fees ${money(details.upfrontFees)}${extraRepaymentLabel(details, selected.type) ? ' · extra repayments ' + escapeHtml(extraRepaymentLabel(details, selected.type)) : ''}</div>` : '<div style="margin-bottom:10px;"></div>'}
            ${c.loseOffset && loan.offset > 0 ? `<div style="font-size:12px;color:var(--red);margin-bottom:10px;">No offset or redraw - your ${money(loan.offset)} offset stops saving interest (included below).</div>` : ''}
            ${details && !hasOffset(details, selected.type) && details.redraw && loan.offset > 0 ? `<div style="font-size:12px;color:var(--amber);margin-bottom:10px;">No offset - your ${money(loan.offset)} would need to go into redraw.</div>` : ''}
            <div class="private" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
                <div class="tax-item"><div class="label">Repayment now</div><div class="value" style="color:var(--c-blue);">${money(c.currentRepayment)}/mo</div></div>
                <div class="tax-item"><div class="label">Repayment after</div><div class="value" style="color:var(--c-cyan);">${money(c.newRepayment)}/mo</div></div>
                <div class="tax-item"><div class="label">Interest saved</div><div class="value" style="color:${c.monthlySaving > 0 ? 'var(--green)' : 'var(--red)'};">${money(c.monthlySaving)}/mo</div></div>
                <div class="tax-item"><div class="label">Switching costs</div><div class="value" style="color:var(--c-orange);">${money(c.switchingCost)}</div></div>
                <div class="tax-item"><div class="label">Break-even</div><div class="value" style="color:var(--c-purple);">${breakEven}</div></div>
                <div class="tax-item"><div class="label">First-year net</div><div class="value" style="color:${c.firstYearNet >= 0 ? 'var(--green)' : 'var(--red)'};">${money(c.firstYearNet)}</div></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">
                Includes the annual fee difference${details ? ` (${c.annualFeeDiff >= 0 ? '+' : ''}${money(c.annualFeeDiff)}/yr)` : ''}. Tip: quoting this rate to your bank can get you a cut with no switching costs.
            </div>
        `;
    }

    const costs = rt.costs || {};
    const costInput = (id, label, value, hint) => `
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-muted);">${label}
            <input type="number" id="${id}" value="${value || 0}" step="10" min="0" onchange="updateRateSettings()" title="${hint}" />
        </label>`;
    const settingsHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-muted);">Property value
                <input type="number" id="rtPropertyValue" value="${rt.propertyValue || ''}" placeholder="${getPropertyValue() ? 'From Net Worth: ' + getPropertyValue() : 'e.g. 650000'}" step="1000" min="0" onchange="updateRateSettings()" />
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-muted);">Loan purpose
                <select id="rtLoanPurpose" onchange="updateRateSettings()">
                    <option value="OWNER_OCCUPIED" ${rt.loanPurpose === 'OWNER_OCCUPIED' ? 'selected' : ''}>Owner occupied</option>
                    <option value="INVESTMENT" ${rt.loanPurpose === 'INVESTMENT' ? 'selected' : ''}>Investment</option>
                </select>
            </label>
            ${costInput('rtDischarge', 'Discharge fee (current bank)', costs.discharge, 'Fee your current lender charges to close the loan')}
            ${costInput('rtGovtFees', 'Govt mortgage fees', costs.govtFees, 'State fees to release the old mortgage and register the new one - check the current Titles Queensland fees')}
            ${costInput('rtNewLoanFees', 'New loan fees', costs.newLoanFees, 'Application, valuation and settlement fees')}
            ${costInput('rtCashback', 'Cashback offered', costs.cashback, 'Refinance cashback from the new lender')}
            ${costInput('rtCurrentAnnualFee', 'Your current annual fee', costs.currentAnnualFee, 'Annual or package fee on your current loan (monthly fees x 12)')}
        </div>
    `;

    // ---- Rates table ----
    const rows = (latest?.rates || [])
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => r.type === filter && visible(r))
        .slice(0, 10);
    const yes = '<span style="color:var(--green);">✓</span>', no = '<span style="color:var(--text-muted);">—</span>';
    const feesCell = d => d ? `<span style="color:${d.annualFee ? 'var(--c-yellow)' : 'var(--green)'};">${money(d.annualFee)}/yr</span>${d.upfrontFees ? `<div style="font-size:10px;color:var(--c-orange);">${money(d.upfrontFees)} upfront</div>` : ''}` : '—';
    const columns = filter === 'FIXED' ? 11 : 10;
    // Everything the lender publishes about the loan
    const detailsRow = (r, d) => {
        const section = (label, text) => text ? `<div><strong>${label}:</strong> ${escapeHtml(text)}</div>` : '';
        const feeList = d.fees.map(f => `<li>${escapeHtml(f.name)} - ${f.amount === null ? 'varies / see lender' : money(f.amount)}${f.type === 'PERIODIC' && f.period ? ` (${f.period === 'P1M' ? 'monthly' : f.period === 'P1Y' ? 'yearly' : escapeHtml(f.period)})` : ''}</li>`).join('');
        return `
            <tr><td colspan="${columns}" style="text-align:left;white-space:normal;background:var(--surface-2, rgba(255,255,255,0.03));font-size:12px;line-height:1.5;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px 24px;">
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${section('Offset', d.offset ? (hasOffset(d, r.type) ? d.offsetNote || 'Yes' : 'Not on fixed rates. ' + d.offsetNote) : 'None')}
                        ${section('Redraw', d.redraw ? d.redrawNote || 'Yes' : 'None')}
                        ${section('Extra repayments', d.extraRepayments ? d.extraNote || 'Allowed' : 'Not listed')}
                        ${section('Loan size', d.minLoan || d.maxLoan ? `${d.minLoan ? money(d.minLoan) : '$0'} to ${d.maxLoan ? money(d.maxLoan) : 'no limit'}` : '')}
                        ${/^https?:\/\//i.test(d.url || '') ? `<div><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Lender's page for this loan ↗</a></div>` : ''}
                    </div>
                    <div><strong>Fees:</strong>${d.fees.length ? `<ul style="margin:4px 0 0 18px;padding:0;">${feeList}</ul>` : ' none listed'}</div>
                </div>
            </td></tr>`;
    };
    const tableHtml = !latest
        ? '<div class="empty-state" style="padding:20px;"><div class="message">No rates checked yet</div></div>'
        : rows.length === 0
            ? '<div class="empty-state" style="padding:20px;"><div class="message">No matching rates for your LVR</div></div>'
            : `
            <div class="mbh-scroll">
                <table class="mbh-table" style="width:100%;">
                    <thead><tr>
                        <th class="mbh-cat-header">Lender</th><th style="text-align:left;">Product</th>
                        ${filter === 'FIXED' ? '<th>Fixed for</th>' : ''}
                        <th>Rate</th><th>Comparison</th><th>LVR band</th><th>Offset</th><th>Extra repayments</th><th>Fees</th><th></th>
                    </tr></thead>
                    <tbody>${rows.map(({ r, idx }) => {
                        const d = latest.details?.[r.key];
                        const open = d && expandedRateKey === r.key;
                        const keyArg = escapeHtml(JSON.stringify(r.key));
                        return `
                        <tr>
                            <td class="mbh-cat-name">${escapeHtml(r.lender)}</td>
                            <td style="text-align:left;white-space:normal;min-width:180px;max-width:300px;">${d ? `<span onclick="toggleRateDetails(${keyArg})" style="cursor:pointer;" title="Show offset, repayment and fee details">${open ? '▾' : '▸'} ${escapeHtml(r.product)}</span>` : escapeHtml(r.product)}</td>
                            ${filter === 'FIXED' ? `<td>${r.fixedYears ? r.fixedYears + ' yr' : '—'}</td>` : ''}
                            <td style="font-weight:700;color:${r.rate < yourRate ? 'var(--green)' : 'var(--text-primary)'};">${pct(r.rate)}</td>
                            <td style="color:var(--c-purple);">${pct(r.comparisonRate)}</td>
                            <td style="color:var(--c-cyan);">${r.lvrMax !== null ? `up to ${Math.round(r.lvrMax * 100)}%` : 'any'}</td>
                            <td>${d ? (hasOffset(d, r.type) ? yes : d.redraw ? '<span style="color:var(--c-blue);" title="No offset, but has redraw">redraw</span>' : no) : '—'}</td>
                            <td>${d ? (extraRepaymentLabel(d, r.type) === 'yes' ? yes : extraRepaymentLabel(d, r.type) ? `<span style="color:var(--amber);">${escapeHtml(extraRepaymentLabel(d, r.type))}</span>` : no) : '—'}</td>
                            <td>${feesCell(d)}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-outline btn-sm" onclick="selectRateForComparison(${idx})" title="Work out what switching your loan to this one is worth">Vs mine</button>
                                ${(() => {
                                    const pos = (rt.sideBySide || []).findIndex(s => s.key === r.key && s.type === r.type && s.rate === r.rate && s.fixedYears === r.fixedYears);
                                    return `<button class="btn btn-sm btn-outline" style="${pos >= 0 ? `border-color:var(--c-${pos ? 'orange' : 'blue'});color:var(--c-${pos ? 'orange' : 'blue'});` : ''}" onclick="toggleSideBySide(${idx})" title="${pos >= 0 ? 'Remove from' : 'Add to'} the side-by-side comparison">${pos >= 0 ? (pos ? 'B' : 'A') + ' ✓' : '⇄'}</button>`;
                                })()}
                            </td>
                        </tr>${open ? detailsRow(r, d) : ''}`;
                    }).join('')}
                    </tbody>
                </table>
            </div>`;

    // ---- History ----
    const history = rt.history.slice(-12).reverse();
    const historyHtml = history.length === 0
        ? '<div style="font-size:12px;color:var(--text-muted);">Each check is saved here.</div>'
        : `
            <div class="mbh-scroll">
                <table class="mbh-table" style="width:100%;">
                    <thead><tr><th class="mbh-cat-header">Date</th><th>Your rate</th><th>Best variable</th><th>Gap</th><th>Best fixed</th></tr></thead>
                    <tbody>${history.map(h => {
                        const g = h.bestVariable ? h.yourRate / 100 - h.bestVariable.rate : null;
                        return `
                        <tr>
                            <td class="mbh-cat-name">${h.date}</td>
                            <td style="color:var(--c-blue);">${pct(h.yourRate / 100)}</td>
                            <td style="color:var(--green);" title="${h.bestVariable ? escapeHtml(h.bestVariable.lender + ' · ' + h.bestVariable.product) : ''}">${h.bestVariable ? pct(h.bestVariable.rate) + ' · ' + escapeHtml(h.bestVariable.lender) : '—'}</td>
                            <td style="color:${g > 0 ? 'var(--amber)' : 'var(--green)'};">${g === null ? '—' : (g * 100).toFixed(2) + '%'}</td>
                            <td style="color:var(--c-purple);">${h.bestFixed ? pct(h.bestFixed.rate) + (h.bestFixed.years ? ` (${h.bestFixed.years} yr)` : '') : '—'}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>`;

    // ---- Lenders ----
    const lendersHtml = `
        <div style="display:flex;flex-wrap:wrap;gap:8px 16px;font-size:12px;">
            ${rt.lenders.map((l, i) => `
                <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" ${l.enabled ? 'checked' : ''} onchange="toggleLender(${i}, this.checked)" />
                    ${escapeHtml(l.name)}
                    <span onclick="removeLender(${i})" title="Remove" style="cursor:pointer;color:var(--text-muted);">×</span>
                </label>`).join('')}
        </div>
        <div class="form-row" style="margin-top:12px;">
            <select id="rtAddLender" onfocus="if (!cdrRegisterCache) loadLenderRegister()" onchange="addLenderFromRegister(this.value)">
                <option value="">+ Add a bank from the Open Banking register...</option>
            </select>
        </div>
    `;

    // ---- Side by side ----
    const pair = rt.sideBySide || [];
    let sideHtml = `<div style="font-size:12px;color:var(--text-muted);">${pair.length === 1 ? `A: ${escapeHtml(pair[0].lender)} · ${escapeHtml(pair[0].product)} - press ⇄ on one more loan.` : 'Press ⇄ on two loans below.'}</div>`;
    if (pair.length === 2) {
        const [A, B] = pair.map(s => ({ s, d: latest?.details?.[s.key] || null }));
        [A, B].forEach(x => { x.c = loanCostForYou(x.s, x.d); });
        const verdict = compareTwoLoans(A.c, B.c);
        const typeText = s => s.type === 'FIXED' ? `Fixed${s.fixedYears ? ` ${s.fixedYears} yr` : ''}` : 'Variable';
        const tick = (ok, text = '') => ok ? `<span style="color:var(--green);">✓</span>${text ? ` <span style="color:var(--text-muted);">${escapeHtml(text)}</span>` : ''}` : '<span style="color:var(--text-muted);">—</span>';
        const known = x => x.d ? '' : '<div style="font-size:10px;color:var(--text-muted);">no details</div>';
        // Difference column: B minus A, green when B costs less
        const delta = (a, b, fmt, same = 0.5) => {
            const d = b - a;
            if (Math.abs(d) < same) return '<span style="color:var(--text-muted);">same</span>';
            return `<span style="color:${d < 0 ? 'var(--green)' : 'var(--red)'};">${d > 0 ? '+' : '-'}${fmt(Math.abs(d))}</span>`;
        };
        const rateDelta = (a, b) => a === null || b === null ? '' : delta(a, b, v => (v * 100).toFixed(2) + '%', 0.00005);
        const rows = [
            ['Type', typeText(A.s), typeText(B.s), ''],
            ['Interest rate', pct(A.s.rate), pct(B.s.rate), rateDelta(A.s.rate, B.s.rate)],
            ['Comparison rate', pct(A.s.comparisonRate), pct(B.s.comparisonRate), rateDelta(A.s.comparisonRate ?? null, B.s.comparisonRate ?? null)],
            ['Offset', A.d ? tick(hasOffset(A.d, A.s.type)) : '—', B.d ? tick(hasOffset(B.d, B.s.type)) : '—', ''],
            ['Redraw', A.d ? tick(A.d.redraw) : '—', B.d ? tick(B.d.redraw) : '—', ''],
            ['Extra repayments', A.d ? tick(!!extraRepaymentLabel(A.d, A.s.type), extraRepaymentLabel(A.d, A.s.type) === 'yes' ? '' : extraRepaymentLabel(A.d, A.s.type)) : '—',
                B.d ? tick(!!extraRepaymentLabel(B.d, B.s.type), extraRepaymentLabel(B.d, B.s.type) === 'yes' ? '' : extraRepaymentLabel(B.d, B.s.type)) : '—', ''],
            ['Annual fees', money(A.c.annualFees), money(B.c.annualFees), delta(A.c.annualFees, B.c.annualFees, money)],
            ['Upfront fees', money(A.c.upfront), money(B.c.upfront), delta(A.c.upfront, B.c.upfront, money)],
            ['Exit fees', A.d ? money(A.d.exitFees) : '—', B.d ? money(B.d.exitFees) : '—', A.d && B.d ? delta(A.d.exitFees, B.d.exitFees, money) : ''],
            ['Loan size', A.d && (A.d.minLoan || A.d.maxLoan) ? `${money(A.d.minLoan || 0)} to ${A.d.maxLoan ? money(A.d.maxLoan) : 'any'}` : '—',
                B.d && (B.d.minLoan || B.d.maxLoan) ? `${money(B.d.minLoan || 0)} to ${B.d.maxLoan ? money(B.d.maxLoan) : 'any'}` : '—', ''],
            ['Repayment on your balance', money(A.c.repayment) + '/mo', money(B.c.repayment) + '/mo', delta(A.c.repayment, B.c.repayment, v => money(v) + '/mo'), true],
            ['Interest this year (≈)', money(A.c.interest), money(B.c.interest), delta(A.c.interest, B.c.interest, money), true],
            ['Yearly cost (interest + fees)', `<strong>${money(A.c.yearly)}</strong>`, `<strong>${money(B.c.yearly)}</strong>`, delta(A.c.yearly, B.c.yearly, money), true],
            ['First year incl. upfront fees', money(A.c.firstYear), money(B.c.firstYear), delta(A.c.firstYear, B.c.firstYear, money), true]
        ];
        const name = x => `${escapeHtml(x.s.lender)}<div style="font-size:11px;font-weight:400;color:var(--text-muted);white-space:normal;">${escapeHtml(x.s.product)}</div>${known(x)}`;
        const winner = verdict.cheaper === 'A' ? A : B;
        const verdictText = verdict.cheaper === null
            ? 'They cost about the same for you each year.'
            : `<strong style="color:var(--c-${verdict.cheaper === 'A' ? 'blue' : 'orange'});">${verdict.cheaper}: ${escapeHtml(winner.s.lender)}</strong> is <strong style="color:var(--green);">≈ ${money(verdict.perYear)}/yr cheaper</strong> for you${verdict.catchUpMonths !== null ? `, ahead after ${Math.ceil(verdict.catchUpMonths)} months (higher upfront fees)` : ''}.`;
        const notes = [
            ...[A, B].filter(x => !x.c.keepsOffset && (loan.offset || 0) > 0).map(x => `${x === A ? 'A' : 'B'}: no offset or redraw, so interest is on your full balance.`),
            ...[A, B].filter(x => x.s.type === 'FIXED').map(x => `${x === A ? 'A' : 'B'}: fixed rate, then the lender's variable rate.`)
        ];
        sideHtml = `
            <div class="mbh-scroll">
                <table class="mbh-table" style="width:100%;min-width:600px;">
                    <thead><tr><th class="mbh-cat-header"></th><th style="color:var(--c-blue);">A</th><th style="color:var(--c-orange);">B</th><th title="B minus A - green means B costs less">B vs A</th></tr></thead>
                    <tbody>
                        <tr><td class="mbh-cat-name"></td><td style="font-weight:700;color:var(--c-blue);">${name(A)}</td><td style="font-weight:700;color:var(--c-orange);">${name(B)}</td><td></td></tr>
                        ${rows.map(([label, a, b, d, hide]) => `<tr${hide ? ' class="private"' : ''}><td class="mbh-cat-name">${label}</td><td>${a}</td><td>${b}</td><td>${d}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="private" style="font-size:13px;margin-top:10px;">${verdictText}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">
                ${notes.map(n => escapeHtml(n)).join('<br>')}
            </div>`;
    }

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><div class="card-title">Your Loan vs the Market</div><span class="badge">Open Banking data</span></div>
            ${summaryHtml}
        </div>
        <div class="card">
            <div class="card-header"><div class="card-title">Refinance Break-even</div></div>
            ${refiHtml}
            <div style="margin-top:14px;">${settingsHtml}</div>
        </div>
        <div class="card">
            <div class="card-header"><div class="card-title">Side by Side</div>${pair.length ? '<button class="btn btn-sm btn-outline" onclick="clearSideBySide()">Clear</button>' : ''}</div>
            ${sideHtml}
        </div>
        <div class="card">
            <div class="card-header">
                <div class="card-title">Best Rates for Your LVR</div>
                <div class="form-row" style="margin:0;">
                    <button class="btn btn-sm ${filter === 'VARIABLE' ? 'btn-primary' : 'btn-outline'}" onclick="setRateFilter('VARIABLE')">Variable</button>
                    <button class="btn btn-sm ${filter === 'FIXED' ? 'btn-primary' : 'btn-outline'}" onclick="setRateFilter('FIXED')">Fixed</button>
                </div>
            </div>
            ${tableHtml}
        </div>
        <div class="grid-2">
            <div class="card">
                <div class="card-header"><div class="card-title">Rate History</div></div>
                ${historyHtml}
            </div>
            <div class="card">
                <div class="card-header"><div class="card-title">Lenders Checked</div></div>
                ${lendersHtml}
            </div>
        </div>
    `;
}
