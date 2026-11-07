// ================================================================
// INVESTMENTS - US share purchases valued in AUD from live prices.
//
// Each purchase is its own entry (a "lot"): shares, price paid per share
// in US$, and purchase date. A$ figures use the USD/AUD rate on the
// purchase date for what you paid, and today's rate for what it's worth,
// so A$ gains include currency movements (the basis the ATO uses for
// capital gains). Sold purchases move to their own list.
//
// Optionally, each purchase and sale can take your fees (in A$) from
// your broker's confirmation.
//
// Sources (all called straight from the page, no proxies):
//   Prices    Finnhub - needs a free API key, 60 requests/minute
//   USD->AUD  Frankfurter (European Central Bank daily rates, including
//             past dates), falling back to ExchangeRate-API's open
//             endpoint for today's rate - both free, no key
//   History   Twelve Data daily closes for the charts - needs a free API
//             key, 800 requests/day, 8/minute (Finnhub's free plan has no
//             history); Frankfurter for each day's USD->AUD
//   Stocks    S&P 500 constituents list (public dataset), for the picker
// Only ticker symbols and dates are sent anywhere - never your holdings.
// ================================================================

const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';
// Exchange-rate sources, tried in order. Use Frankfurter's current
// address: the old api.frankfurter.app redirects without the header
// browsers need, so the browser blocks it.
const FX_SOURCES = [
    {
        name: 'ECB via Frankfurter',
        url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD',
        parse: j => j?.rates?.AUD ? { usdAud: j.rates.AUD, date: j.date } : null
    },
    {
        name: 'ExchangeRate-API',
        url: 'https://open.er-api.com/v6/latest/USD',
        parse: j => j?.result === 'success' && j.rates?.AUD
            ? { usdAud: j.rates.AUD, date: toLocalISODate(new Date(j.time_last_update_unix * 1000)) }
            : null
    }
];
// Rate on a past date (weekends/holidays give the previous business day)
const FX_HISTORICAL_URL = date => `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=AUD`;
// Every day's rate from a date to today, in one request
const FX_RANGE_URL = from => `https://api.frankfurter.dev/v1/${from}..?base=USD&symbols=AUD`;
const HISTORY_URL = (symbol, from, apiKey) => `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&start_date=${from}&order=ASC&outputsize=5000&apikey=${encodeURIComponent(apiKey)}`;
const HISTORY_CALLS_PER_MINUTE = 8;
const SP500_LIST_URL ='https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';
const INVESTMENT_HISTORY_LIMIT = 400;

// Market comparisons for the performance chart. Index values aren't on
// the free price feed, so the ETFs that track them stand in.
const BENCHMARKS = [
    { symbol: 'SPY', name: 'S&P 500', color: '#d95926' },
    { symbol: 'QQQ', name: 'Nasdaq-100', color: '#199e70' }
];
const PORTFOLIO_LINE_COLOR = '#3987e5';
// One colour per stock on the "since you bought" chart, in this order
const STOCK_LINE_COLORS = ['#3b82f6', '#facc15', '#a855f7', '#22d3ee', '#fb923c', '#34d399', '#ef4444'];

function getInvestments() {
    return appData.investments;
}

function getOpenLots() {
    return (getInvestments().holdings || []).filter(l => !l.sold);
}

function getSoldLots() {
    return (getInvestments().holdings || []).filter(l => l.sold);
}

function findLot(id) {
    return (getInvestments().holdings || []).find(l => l.id === id);
}

// ================================================================
// VALUES
// ================================================================

function getUsdAud() {
    return getInvestments().fx?.usdAud || 0;
}

// What you paid for a purchase, in US$ and A$, at the market rate on the
// purchase date (today's until that's been looked up). Fees are in A$
// and count towards both totals (converted to US$ at the same rate).
function getLotCost(l) {
    if (!(l.costPerShareUsd > 0)) return { usd: 0, aud: 0, feesAud: 0, rate: 0, known: false, approxAud: false };
    const sharesUsd = l.costPerShareUsd * (l.shares || 0);
    const feesAud = l.feesAud > 0 ? l.feesAud : 0;
    const rate = l.purchaseFx || getUsdAud();
    return {
        usd: sharesUsd + (rate ? feesAud / rate : 0),
        aud: rate ? sharesUsd * rate + feesAud : 0,
        feesAud, rate, known: true,
        approxAud: !l.purchaseFx
    };
}

// Current value and unrealised gain of an open purchase.
function getLotValue(l) {
    const quote = getInvestments().prices[l.symbol];
    const fx = getUsdAud();
    const cost = getLotCost(l);
    if (!quote) return { priced: false, converted: false, valueAud: 0, valueUsd: 0, dayChangeAud: 0, gainAud: null, gainUsd: null, cost };
    const valueUsd = (l.shares || 0) * quote.price;
    const prevValueUsd = (l.shares || 0) * (quote.prevClose || quote.price);
    return {
        priced: true,
        converted: fx > 0,
        priceUsd: quote.price,
        changePct: quote.changePct,
        valueUsd,
        valueAud: fx ? valueUsd * fx : 0,
        dayChangeAud: fx ? (valueUsd - prevValueUsd) * fx : 0,
        gainUsd: cost.known ? valueUsd - cost.usd : null,
        gainAud: cost.known && fx ? valueUsd * fx - cost.aud : null,
        cost
    };
}

// Result of a sold purchase: proceeds less sale fees, at the sale-date
// market rate, less what it cost.
function getSoldResult(l) {
    const cost = getLotCost(l);
    const grossUsd = (l.sold.pricePerShareUsd || 0) * (l.shares || 0);
    const feesAud = l.sold.feesAud > 0 ? l.sold.feesAud : 0;
    const rate = l.sold.fx || getUsdAud();
    const proceedsUsd = grossUsd - (rate ? feesAud / rate : 0);
    const proceedsAud = rate ? grossUsd * rate - feesAud : 0;
    const start = l.purchaseDate ? parseLocalDate(l.purchaseDate) : null;
    const end = l.sold.date ? parseLocalDate(l.sold.date) : null;
    return {
        proceedsUsd, proceedsAud, cost, feesAud, rate,
        gainUsd: cost.known ? proceedsUsd - cost.usd : null,
        gainAud: cost.known && rate ? proceedsAud - cost.aud : null,
        heldDays: start && end ? Math.round((end - start) / 86400000) : null,
        approxAud: !l.sold.fx || cost.approxAud
    };
}

function getPortfolioSummary() {
    const open = getOpenLots();
    let valueAud = 0, valueUsd = 0, dayChangeAud = 0, costAud = 0, costUsd = 0, gainAud = 0, gainUsd = 0, withCost = 0;
    const unpriced = [];
    open.forEach(l => {
        const v = getLotValue(l);
        if (v.cost.known) costAud += v.cost.aud;
        if (!v.priced) { if (!unpriced.includes(l.symbol)) unpriced.push(l.symbol); return; }
        valueUsd += v.valueUsd;
        if (!v.converted) return;
        valueAud += v.valueAud;
        dayChangeAud += v.dayChangeAud;
        if (v.cost.known) { gainAud += v.gainAud; gainUsd += v.gainUsd; costUsd += v.cost.usd; withCost += v.cost.aud; }
    });
    let realisedAud = 0, realisedUsd = 0, soldWithCost = 0, soldCostAud = 0;
    getSoldLots().forEach(l => {
        const r = getSoldResult(l);
        if (r.gainAud !== null) { realisedAud += r.gainAud; realisedUsd += r.gainUsd; soldWithCost++; soldCostAud += r.cost.aud; }
    });
    // Overall = unrealised on what you hold + realised on what you've sold,
    // as a % of what all of those purchases cost
    const anyGain = withCost > 0 || soldWithCost > 0;
    const totalAud = gainAud + realisedAud;
    const investedUsd = open.reduce((sum, l) => sum + getLotCost(l).usd, 0);
    return {
        valueAud, valueUsd, dayChangeAud, costAud, investedUsd, unpriced,
        missingRate: getUsdAud() <= 0 && open.some(l => getLotValue(l).priced),
        // Gains only over purchases where you've entered what you paid
        gainAud: withCost > 0 ? gainAud : null,
        gainUsd: withCost > 0 ? gainUsd : null,
        gainPct: withCost > 0 ? gainAud / withCost : null,
        realisedAud: soldWithCost ? realisedAud : null,
        realisedUsd: soldWithCost ? realisedUsd : null,
        totalAud: anyGain ? totalAud : null,
        totalUsd: anyGain ? gainUsd + realisedUsd : null,
        totalPct: anyGain && withCost + soldCostAud > 0 ? totalAud / (withCost + soldCostAud) : null
    };
}

// Used by the Net Worth tab and the dashboard - open purchases only
function getInvestmentsValueAud() {
    return getPortfolioSummary().valueAud;
}

// ================================================================
// FETCHING
// ================================================================

async function fetchJson(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let res;
        try {
            res = await fetch(url, { signal: controller.signal });
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('timed out');
            throw new Error("couldn't connect");
        }
        if (res.status === 401 || res.status === 403) throw new Error('API key rejected');
        if (res.status === 429) throw new Error('rate limit - try again in a minute');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchQuote(symbol, apiKey) {
    const q = await fetchJson(`${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`);
    // Finnhub answers unknown symbols with all zeros rather than an error
    if (!q || !q.c) throw new Error('no price (check the ticker)');
    return { price: q.c, prevClose: q.pc || q.c, changePct: q.dp ?? null, priceTime: q.t ? new Date(q.t * 1000).toISOString() : null };
}

// Try each exchange-rate source until one answers
async function fetchUsdAud() {
    const errors = [];
    for (const source of FX_SOURCES) {
        try {
            const rate = source.parse(await fetchJson(source.url));
            if (rate && rate.usdAud > 0) return { ...rate, source: source.name };
            errors.push(`${source.name}: unexpected reply`);
        } catch (e) {
            errors.push(`${source.name}: ${e.message}`);
        }
    }
    throw new Error(errors.join('; '));
}

// USD/AUD on a past date, remembered in the data file so each date is
// only looked up once
async function getRateOn(date) {
    const inv = getInvestments();
    inv.fxHistory = inv.fxHistory || {};
    if (inv.fxHistory[date]) return inv.fxHistory[date];
    const j = await fetchJson(FX_HISTORICAL_URL(date));
    if (!j?.rates?.AUD) throw new Error('no rate for that date');
    inv.fxHistory[date] = j.rates.AUD;
    return j.rates.AUD;
}

// Look up the purchase- and sale-date rates that haven't been fetched yet.
// Returns a list of problems (empty when all found).
async function fillMissingRates() {
    const problems = [];
    const today = toLocalISODate();
    for (const l of getInvestments().holdings || []) {
        if (l.purchaseDate && !l.purchaseFx && l.purchaseDate <= today) {
            try { l.purchaseFx = await getRateOn(l.purchaseDate); } catch (e) { problems.push(`${l.symbol} purchase-date rate (${e.message})`); }
        }
        if (l.sold && l.sold.date && !l.sold.fx && l.sold.date <= today) {
            try { l.sold.fx = await getRateOn(l.sold.date); } catch (e) { problems.push(`${l.symbol} sale-date rate (${e.message})`); }
        }
    }
    return problems;
}

// Daily closes for one symbol from a date, as { 'YYYY-MM-DD': price }
async function fetchCloses(symbol, from, apiKey) {
    const j = await fetchJson(HISTORY_URL(symbol, from, apiKey), 30000);
    if (j?.status === 'error') {
        if (/no data/i.test(j.message || '')) return {};   // e.g. bought today
        throw new Error(j.code === 401 ? 'API key rejected' : j.code === 429 ? 'limit reached - try again later' : (j.message || 'error').slice(0, 60));
    }
    const closes = {};
    (j?.values || []).forEach(v => { const c = parseFloat(v.close); if (c > 0) closes[String(v.datetime).slice(0, 10)] = c; });
    return closes;
}

// Fill in daily closes for each stock from its first purchase, the S&P 500
// and Nasdaq-100 ETFs from your first purchase, and every day's USD/AUD.
// Kept in the data file, so later updates only fetch the new days.
// Returns a list of problems (empty when all fetched).
async function updatePriceHistory(setProgress = () => {}) {
    const inv = getInvestments();
    if (!inv.historyApiKey) return [];
    inv.priceHistory = inv.priceHistory || {};
    inv.fxHistory = inv.fxHistory || {};
    const today = toLocalISODate();
    const starts = {};
    (inv.holdings || []).forEach(l => {
        if (l.purchaseDate && l.purchaseDate <= today && !(starts[l.symbol] <= l.purchaseDate)) starts[l.symbol] = l.purchaseDate;
    });
    const earliest = Object.values(starts).sort()[0];
    if (!earliest) return [];
    BENCHMARKS.forEach(b => { starts[b.symbol] = earliest; });
    const problems = [];

    try {
        const range = inv.fxRange && inv.fxRange.from <= earliest ? inv.fxRange : null;
        if (!range || range.to < today) {
            const j = await fetchJson(FX_RANGE_URL(range ? range.to : earliest));
            Object.entries(j?.rates || {}).forEach(([date, r]) => { if (r.AUD) inv.fxHistory[date] = r.AUD; });
            inv.fxRange = { from: range ? range.from : earliest, to: today };
        }
    } catch (e) {
        problems.push(`daily exchange rates (${e.message})`);
    }

    // Already up to date today, or starting later than what's stored -> skip
    const todo = Object.entries(starts).filter(([symbol, start]) => {
        const h = inv.priceHistory[symbol];
        return !(h && h.from <= start && h.checked === today);
    });
    for (let i = 0; i < todo.length; i++) {
        const [symbol, start] = todo[i];
        if (i > 0 && i % HISTORY_CALLS_PER_MINUTE === 0) {
            setProgress(`Price history: waiting a minute (free plan limit)... ${i}/${todo.length}`);
            await new Promise(r => setTimeout(r, 61000));
        }
        setProgress(`Price history... ${i}/${todo.length}`);
        const h = inv.priceHistory[symbol];
        const keep = h && h.from <= start;
        // Re-fetch from the last stored day (its close may have been partial)
        const from = keep ? Object.keys(h.closes).sort().pop() || start : start;
        try {
            const closes = await fetchCloses(symbol, from, inv.historyApiKey);
            inv.priceHistory[symbol] = { from: keep ? h.from : start, checked: today, closes: { ...(keep ? h.closes : {}), ...closes } };
        } catch (e) {
            problems.push(`${symbol} history (${e.message})`);
            if (/key/.test(e.message)) break;
        }
    }
    return problems;
}

let investmentRefreshInProgress = false;

async function refreshInvestmentPrices() {
    if (investmentRefreshInProgress) return;
    const inv = getInvestments();
    if (!inv.apiKey) return alert('Add your free Finnhub API key first (see "API Keys" below).');
    if (getOpenLots().length === 0 && getSoldLots().length === 0) return alert('Add a purchase first.');

    investmentRefreshInProgress = true;
    renderInvestments();
    const setProgress = text => {
        const el = document.getElementById('invRefreshStatus');
        if (el) el.textContent = text;
    };
    const failed = [];

    try {
        inv.fx = await fetchUsdAud();
    } catch (e) {
        failed.push(`USD/AUD rate (${e.message})${inv.fx ? ' - using the last rate' : ''}`);
    }
    failed.push(...await fillMissingRates());

    const symbols = [...new Set(getOpenLots().map(l => l.symbol))];
    let done = 0;
    setProgress(`Fetching prices... 0/${symbols.length}`);
    await runLimited(symbols, 3, async symbol => {
        try {
            inv.prices[symbol] = { ...(await fetchQuote(symbol, inv.apiKey)), fetchedAt: new Date().toISOString() };
        } catch (e) {
            failed.push(`${symbol} (${e.message})`);
        } finally {
            done++;
            setProgress(`Fetching prices... ${done}/${symbols.length}`);
        }
    });

    // Benchmark prices for the comparison lines
    const bench = {};
    await runLimited(BENCHMARKS, 2, async b => {
        try { bench[b.symbol] = (await fetchQuote(b.symbol, inv.apiKey)).price; } catch (e) { /* comparison skips this day */ }
    });
    failed.push(...await updatePriceHistory(setProgress));

    inv.lastRefresh = { at: new Date().toISOString(), failed };
    const s = getPortfolioSummary();
    if (s.valueAud > 0) {
        // One history entry per day - a later refresh replaces today's.
        // costAud/costUsd = what's invested in the purchases still held.
        const entry = {
            date: toLocalISODate(), valueAud: Math.round(s.valueAud * 100) / 100,
            costAud: Math.round(s.costAud * 100) / 100, costUsd: Math.round(s.investedUsd * 100) / 100,
            usdAud: getUsdAud(), bench
        };
        inv.history = inv.history.filter(h => h.date !== entry.date).concat(entry).slice(-INVESTMENT_HISTORY_LIMIT);
    }
    investmentRefreshInProgress = false;
    updateUI();
    setStatus('Prices updated - remember to save (Ctrl+S)');
}

// Opening the Investments tab updates prices once a day, so the
// performance chart keeps building without having to remember to click.
function maybeAutoRefreshInvestments() {
    const inv = getInvestments();
    if (!inv.apiKey || getOpenLots().length === 0 || investmentRefreshInProgress) return;
    const lastDay = inv.lastRefresh ? toLocalISODate(new Date(inv.lastRefresh.at)) : null;
    if (lastDay !== toLocalISODate()) refreshInvestmentPrices();
}

// The S&P 500 list is only used to fill the picker, so it's fetched on
// demand and kept in memory, not in your data file.
let sp500Cache = null;

function parseCsvLine(line) {
    const out = [];
    let field = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { out.push(field); field = ''; }
        else field += ch;
    }
    out.push(field);
    return out;
}

async function loadSp500List() {
    if (sp500Cache) return sp500Cache;
    const res = await fetch(SP500_LIST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
    const header = parseCsvLine(lines[0]);
    const col = name => header.indexOf(name);
    sp500Cache = lines.slice(1).map(parseCsvLine)
        .map(f => ({ symbol: f[col('Symbol')], name: f[col('Security')], sector: f[col('GICS Sector')] }))
        .filter(s => s.symbol)
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
    return sp500Cache;
}

async function fillSp500Picker() {
    const list = document.getElementById('sp500Options');
    if (!list || list.dataset.loaded) return;
    try {
        const stocks = await loadSp500List();
        list.innerHTML = stocks.map(s => `<option value="${escapeHtml(s.symbol)}">${escapeHtml(s.name)} · ${escapeHtml(s.sector || '')}</option>`).join('');
        list.dataset.loaded = '1';
    } catch (e) {
        const hint = document.getElementById('invAddHint');
        if (hint) hint.textContent = "Couldn't load the S&P 500 list - you can still type any US ticker.";
    }
}

// ================================================================
// EDITING
// ================================================================

// Look up a date's rate in the background, then redraw
function lookUpRateLater(lot, which) {
    const date = which === 'purchase' ? lot.purchaseDate : lot.sold?.date;
    if (!date || date > toLocalISODate()) return;
    getRateOn(date)
        .then(rate => {
            if (which === 'purchase' && lot.purchaseDate === date) lot.purchaseFx = rate;
            if (which === 'sale' && lot.sold && lot.sold.date === date) lot.sold.fx = rate;
            updateUI();
        })
        .catch(() => { /* filled in on the next price update */ });
}

function addHolding() {
    const inv = getInvestments();
    const symbol = document.getElementById('invSymbol').value.trim().toUpperCase().replace(/\s+/g, '');
    const shares = parseFloat(document.getElementById('invShares').value) || 0;
    const pricePaid = parseFloat(document.getElementById('invCost').value) || 0;
    const date = document.getElementById('invDate').value || toLocalISODate();
    const fees = parseFloat(document.getElementById('invFees').value) || 0;
    if (!/^[A-Z0-9.\-]{1,10}$/.test(symbol)) return alert('Enter a ticker, e.g. AAPL');
    if (shares <= 0) return alert('Enter how many shares you bought');
    if (date > toLocalISODate()) return alert("The purchase date can't be in the future.");

    const listed = (sp500Cache || []).find(s => s.symbol === symbol);
    const known = inv.holdings.find(l => l.symbol === symbol && l.name);
    const lot = {
        id: genId(), symbol, name: listed ? listed.name : known ? known.name : '', shares, costPerShareUsd: pricePaid || null,
        purchaseDate: date, purchaseFx: null, sold: null, feesAud: fees > 0 ? fees : null
    };
    inv.holdings.push(lot);
    lookUpRateLater(lot, 'purchase');
    updateUI();
}

function updateLot(id, field, value) {
    const lot = findLot(id);
    if (!lot) return;
    if (field === 'purchaseDate') {
        if (value && value > toLocalISODate()) { updateUI(); return alert("The purchase date can't be in the future."); }
        lot.purchaseDate = value;
        lot.purchaseFx = null;
        lookUpRateLater(lot, 'purchase');
    } else if (field === 'costPerShareUsd') {
        const n = parseFloat(value);
        lot.costPerShareUsd = n > 0 ? n : null;
    } else if (field === 'feesAud') {
        const n = parseFloat(value);
        lot.feesAud = n > 0 ? n : null;
    } else {
        lot[field] = Math.max(0, parseFloat(value) || 0);
    }
    updateUI();
}

// Ticking "sold" moves a purchase to the Sold list, starting with today's
// date and current price - both can be edited there.
function toggleSold(id, sold) {
    const lot = findLot(id);
    if (!lot) return;
    if (sold) {
        const quote = getInvestments().prices[lot.symbol];
        lot.sold = { date: toLocalISODate(), pricePerShareUsd: quote ? quote.price : (lot.costPerShareUsd || 0), fx: null, feesAud: null };
        lookUpRateLater(lot, 'sale');
    } else {
        lot.sold = null;
    }
    updateUI();
}

function updateSold(id, field, value) {
    const lot = findLot(id);
    if (!lot || !lot.sold) return;
    if (field === 'date') {
        if (value && value > toLocalISODate()) { updateUI(); return alert("The sale date can't be in the future."); }
        lot.sold.date = value;
        lot.sold.fx = null;
        lookUpRateLater(lot, 'sale');
    } else if (field === 'feesAud') {
        const n = parseFloat(value);
        lot.sold.feesAud = n > 0 ? n : null;
    } else if (field === 'pricePerShareUsd') {
        lot.sold.pricePerShareUsd = Math.max(0, parseFloat(value) || 0);
    }
    updateUI();
}

function removeLot(id) {
    const lot = findLot(id);
    if (!lot || !confirm(`Delete this ${lot.symbol} purchase completely? (To keep a record, tick Sold instead.)`)) return;
    getInvestments().holdings = getInvestments().holdings.filter(l => l.id !== id);
    updateUI();
}

function updateInvestmentSettings() {
    getInvestments().apiKey = document.getElementById('invApiKey').value.trim();
    getInvestments().historyApiKey = document.getElementById('invHistoryKey').value.trim();
    renderInvestments();
}

// ================================================================
// PERFORMANCE CHART - portfolio value vs amount invested, from the
// daily snapshots taken whenever prices update
// ================================================================

// The portfolio on every trading day since your first purchase, from the
// stored daily closes: each purchase counts from its purchase date until
// the day it's sold, at that day's close and USD/AUD rate.
function buildDailyHistory() {
    const inv = getInvestments();
    const ph = inv.priceHistory || {};
    const lots = (inv.holdings || []).filter(l => l.purchaseDate && ph[l.symbol]);
    if (!lots.length) return [];
    const first = lots.map(l => l.purchaseDate).sort()[0];
    const days = [...new Set(Object.values(ph).flatMap(h => Object.keys(h.closes || {})))].filter(d => d >= first).sort();
    const fxDates = Object.keys(inv.fxHistory || {}).sort();
    const lastClose = {};
    let fx = null, fi = 0;
    return days.map(date => {
        Object.keys(ph).forEach(s => { const c = ph[s].closes?.[date]; if (c) lastClose[s] = c; });
        while (fi < fxDates.length && fxDates[fi] <= date) fx = inv.fxHistory[fxDates[fi++]];
        let valueUsd = 0, costUsd = 0, costAud = 0;
        lots.forEach(l => {
            if (l.purchaseDate > date || (l.sold && l.sold.date && l.sold.date <= date) || !lastClose[l.symbol]) return;
            valueUsd += (l.shares || 0) * lastClose[l.symbol];
            const c = getLotCost(l);
            costUsd += c.usd; costAud += c.aud;
        });
        const bench = {};
        BENCHMARKS.forEach(b => { if (lastClose[b.symbol]) bench[b.symbol] = lastClose[b.symbol]; });
        return { date, valueAud: fx ? valueUsd * fx : 0, costAud, costUsd, usdAud: fx, bench };
    }).filter(p => p.valueAud > 0);
}

// What was invested on a date, from your purchases as they are now: each
// one counts from its purchase date until it's sold (purchases without a
// date count throughout)
function investedOn(date) {
    let costAud = 0, costUsd = 0;
    (getInvestments().holdings || []).forEach(l => {
        if ((l.purchaseDate && l.purchaseDate > date) || (l.sold && l.sold.date && l.sold.date <= date)) return;
        const c = getLotCost(l);
        if (!c.known) return;
        costAud += c.aud; costUsd += c.usd;
    });
    return { costAud, costUsd };
}

// Daily history where it's been fetched, plus the snapshots from price
// updates for any other days (e.g. today, before the market closes).
// Snapshots keep their value, but what was invested is worked out again
// from today's purchase details - a snapshot saved before a purchase
// price was filled in would otherwise show too little invested.
function getPerformanceHistory() {
    const daily = buildDailyHistory();
    const have = new Set(daily.map(p => p.date));
    const snapshots = (getInvestments().history || []).filter(h => !have.has(h.date)).map(h => ({ ...h, ...investedOn(h.date) }));
    return [...daily, ...snapshots].sort((a, b) => a.date.localeCompare(b.date));
}

let performanceShowTable = false;

function togglePerformanceTable() {
    performanceShowTable = !performanceShowTable;
    renderInvestments();
}

// "If the same money had gone into the index instead": starting from the
// first snapshot, every increase in the amount invested buys the ETF at
// that day's price, and every decrease (a sale) sells the same share of
// it. Purchases made before tracking started count from the first day.
function addBenchmarkValues(points) {
    BENCHMARKS.forEach(b => {
        let units = 0, prevCostUsd = null;
        points.forEach(p => {
            const price = p.bench && p.bench[b.symbol];
            if (!price || !(p.costUsd > 0) || !p.usdAud) return;
            if (prevCostUsd === null) units = p.costUsd / price;
            else if (p.costUsd > prevCostUsd) units += (p.costUsd - prevCostUsd) / price;
            else if (p.costUsd < prevCostUsd) units *= p.costUsd / prevCostUsd;
            prevCostUsd = p.costUsd;
            p['bench_' + b.symbol] = units * price * p.usdAud;
        });
    });
    return points;
}

function renderPerformanceChart(history) {
    const whole = n => '$' + Math.round(n).toLocaleString('en-AU');
    const points = addBenchmarkValues(history.filter(h => h.valueAud > 0).map(h => ({ ...h, d: parseLocalDate(h.date) })));
    // Lines to draw: comparisons only once they have at least two days
    const lines = [
        { key: 'valueAud', name: 'Your portfolio', color: PORTFOLIO_LINE_COLOR, cls: 'value' },
        { key: 'costAud', name: 'Amount invested', color: 'var(--ink-4)', cls: 'invested' },
        ...BENCHMARKS.map(b => ({ key: 'bench_' + b.symbol, name: `${b.name} (${b.symbol})`, color: b.color, cls: 'bench' }))
    ].filter(line => points.filter(p => p[line.key] > 0).length >= (line.cls === 'bench' ? 2 : 1));
    const toggle = `<button class="btn btn-sm btn-outline" onclick="togglePerformanceTable()">${performanceShowTable ? 'Show chart' : 'Show table'}</button>`;
    if (points.length < 2) {
        const hasKey = !!getInvestments().historyApiKey;
        return { toggle: '', html: `<div style="font-size:12px;color:var(--text-muted);">${hasKey
            ? 'Press Update prices to fill this in from your purchase dates.'
            : 'Add a free Twelve Data key under API Keys below and press Update prices to fill this in from your purchase dates, with the S&amp;P 500 and Nasdaq-100 for comparison.'}</div>` };
    }
    if (performanceShowTable) {
        return {
            toggle,
            html: `<div class="mbh-scroll"><table class="mbh-table" style="width:100%;">
                <thead><tr><th class="mbh-cat-header">Date</th><th>Value (A$)</th><th>Invested (A$)</th><th>Gain (A$)</th>${BENCHMARKS.map(b => `<th>If in ${b.name} (A$)</th>`).join('')}<th>USD → AUD</th></tr></thead>
                <tbody>${[...points].reverse().map(p => `<tr><td class="mbh-cat-name">${escapeHtml(p.date)}</td><td>${whole(p.valueAud)}</td><td>${p.costAud ? whole(p.costAud) : '—'}</td><td>${p.costAud ? (p.valueAud >= p.costAud ? '+' : '-') + whole(Math.abs(p.valueAud - p.costAud)) : '—'}</td>${BENCHMARKS.map(b => `<td>${p['bench_' + b.symbol] ? whole(p['bench_' + b.symbol]) : '—'}</td>`).join('')}<td>${p.usdAud ? p.usdAud.toFixed(4) : '—'}</td></tr>`).join('')}</tbody>
            </table></div>`
        };
    }

    const container = document.getElementById('investmentsTracker');
    const width = Math.max(Math.min((container && container.clientWidth) || 900, 1180) - 44, 320);
    const height = 220;
    const margin = { top: 16, right: 96, bottom: 26, left: 56 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const t0 = points[0].d.getTime(), t1 = points[points.length - 1].d.getTime();
    const x = d => margin.left + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * innerW;
    const values = points.flatMap(p => lines.map(line => p[line.key] || 0)).filter(v => v > 0);
    const lo = Math.min(...values), hi = Math.max(...values);
    const pad = (hi - lo) * 0.15 || hi * 0.1;
    const rough = (hi - lo + 2 * pad) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map(f => f * mag).find(s => s >= rough);
    const yMin = Math.max(0, Math.floor((lo - pad) / step) * step);
    const yMax = Math.ceil((hi + pad) / step) * step;
    const y = v => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    const compact = v => v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : `$${Math.round(v)}`;

    let grid = '';
    for (let v = yMin; v <= yMax + 0.001; v += step) {
        grid += `<line x1="${margin.left}" x2="${margin.left + innerW}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/>`
            + `<text x="${margin.left - 8}" y="${y(v) + 3.5}" class="chart-axis" text-anchor="end">${compact(v)}</text>`;
    }
    // A few date labels: first, last and evenly spaced between
    const fmtDate = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const labelIdx = [...new Set([0, Math.round((points.length - 1) / 3), Math.round(2 * (points.length - 1) / 3), points.length - 1])];
    const xLabels = labelIdx.map(i => `<text x="${x(points[i].d)}" y="${height - 8}" class="chart-axis" text-anchor="middle">${fmtDate(points[i].d)}</text>`).join('');

    const path = key => points.filter(p => p[key] > 0).map((p, i) => `${i ? 'L' : 'M'}${x(p.d)},${y(p[key])}`).join(' ');
    const last = points[points.length - 1];
    const dots = points.length <= 40
        ? points.map(p => `<circle cx="${x(p.d)}" cy="${y(p.valueAud)}" r="3" class="perf-dot" style="fill:${PORTFOLIO_LINE_COLOR};"/>`).join('') : '';
    // Only your portfolio gets an end label; the legend and tooltip carry the rest
    const endLabels = `<text x="${margin.left + innerW + 8}" y="${y(last.valueAud) + 4}" class="chart-value">${compact(last.valueAud)}</text>`;
    // Draw the reference and comparison lines first so your portfolio sits on top
    const drawOrder = [...lines.filter(l => l.cls !== 'value'), ...lines.filter(l => l.cls === 'value')];

    return {
        toggle,
        html: `
        <div class="chart-legend">
            ${lines.map(l => `<span><span class="legend-line${l.cls === 'invested' ? ' dashed' : ''}" style="background:${l.color};"></span>${escapeHtml(l.name)}</span>`).join('')}
        </div>
        <div class="chart-wrap" id="perfChartWrap">
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Portfolio value over time compared with the amount invested${lines.some(l => l.cls === 'bench') ? ' and the same money in the S&amp;P 500 and Nasdaq-100' : ''}">
                ${grid}
                ${drawOrder.map(l => `<path d="${path(l.key)}" class="perf-line ${l.cls}" style="stroke:${l.color};"/>`).join('')}
                ${dots}${endLabels}${xLabels}
                <line id="perfCrosshair" class="perf-crosshair" y1="${margin.top}" y2="${margin.top + innerH}" x1="0" x2="0" style="display:none;"/>
                <rect x="${margin.left}" y="${margin.top}" width="${innerW}" height="${innerH}" fill="transparent" id="perfHit"/>
            </svg>
            <div class="chart-tooltip" id="perfTooltip"></div>
        </div>`,
        // Crosshair + tooltip: nearest snapshot to the pointer
        wire: () => {
            const hit = document.getElementById('perfHit');
            const tip = document.getElementById('perfTooltip');
            const cross = document.getElementById('perfCrosshair');
            if (!hit) return;
            hit.addEventListener('mousemove', ev => {
                const box = hit.ownerSVGElement.getBoundingClientRect();
                const px = (ev.clientX - box.left) * (width / box.width);
                const p = points.reduce((best, q) => Math.abs(x(q.d) - px) < Math.abs(x(best.d) - px) ? q : best, points[0]);
                cross.setAttribute('x1', x(p.d)); cross.setAttribute('x2', x(p.d)); cross.style.display = '';
                const gain = p.costAud ? p.valueAud - p.costAud : null;
                const benchRows = BENCHMARKS.filter(b => p['bench_' + b.symbol])
                    .map(b => `<div class="chart-tip-row"><span>If in ${b.name}</span><span>${whole(p['bench_' + b.symbol])}</span></div>`).join('');
                tip.innerHTML = `<div class="chart-tip-title">${p.d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div class="chart-tip-row"><span>Your portfolio</span><strong>${whole(p.valueAud)}</strong></div>
                    ${p.costAud ? `<div class="chart-tip-row"><span>Invested</span><span>${whole(p.costAud)}</span></div>
                    <div class="chart-tip-row"><span>Gain</span><span>${gain >= 0 ? '+' : '-'}${whole(Math.abs(gain))}</span></div>` : ''}
                    ${benchRows ? `<div class="chart-tip-divider"></div>${benchRows}` : ''}`;
                tip.style.left = `${Math.min(x(p.d) + 12, width - 180)}px`;
                tip.style.top = '8px';
                tip.style.display = 'block';
            });
            hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.style.display = 'none'; });
        }
    };
}

// ================================================================
// RENDER
// ================================================================

// ================================================================
// SINCE YOU BOUGHT - each stock you hold as % above or below the average
// US$ price you paid (so a line ends at that stock's US$ gain), from its
// first purchase, with the S&P 500 from your first purchase for reference
// ================================================================

function getStockSeries() {
    const inv = getInvestments();
    const ph = inv.priceHistory || {};
    const open = getOpenLots().filter(l => l.purchaseDate);
    const today = toLocalISODate();
    const toPoints = (closes, base) => closes.map(([date, price]) => ({ date, d: parseLocalDate(date), price, pct: price / base - 1 }));
    const series = [...new Set(open.map(l => l.symbol))].sort().filter(s => ph[s]).map(symbol => {
        const lots = open.filter(l => l.symbol === symbol);
        const start = lots.map(l => l.purchaseDate).sort()[0];
        const closes = Object.entries(ph[symbol].closes || {}).filter(([d]) => d >= start).sort((a, b) => a[0].localeCompare(b[0]));
        const live = inv.prices[symbol];
        if (live && live.price && (!closes.length || closes[closes.length - 1][0] < today)) closes.push([today, live.price]);
        const paid = lots.filter(l => l.costPerShareUsd > 0);
        const shares = paid.reduce((s, l) => s + (l.shares || 0), 0);
        // No price paid entered -> measured from the first close instead
        const base = shares > 0 ? paid.reduce((s, l) => s + l.shares * l.costPerShareUsd, 0) / shares : closes[0]?.[1];
        return { symbol, name: symbol, base, fromPaid: shares > 0, points: base > 0 ? toPoints(closes, base) : [], buys: lots.map(l => l.purchaseDate) };
    }).filter(s => s.points.length);
    series.forEach((s, i) => { s.color = STOCK_LINE_COLORS[i % STOCK_LINE_COLORS.length]; });

    let reference = null;
    const spy = ph[BENCHMARKS[0].symbol];
    if (series.length && spy) {
        const start = series.map(s => s.points[0].date).sort()[0];
        const closes = Object.entries(spy.closes || {}).filter(([d]) => d >= start).sort((a, b) => a[0].localeCompare(b[0]));
        if (closes.length >= 2) reference = { symbol: BENCHMARKS[0].symbol, name: `${BENCHMARKS[0].name} (${BENCHMARKS[0].symbol})`, color: 'var(--text-muted)', points: toPoints(closes, closes[0][1]) };
    }
    return { series, reference };
}

function renderStockChart() {
    const { series, reference } = getStockSeries();
    if (!series.length) return null;
    const pctText = p => `${p >= 0 ? '+' : ''}${(p * 100).toFixed(1)}%`;
    const all = reference ? [...series, reference] : series;

    const container = document.getElementById('investmentsTracker');
    const width = Math.max(Math.min((container && container.clientWidth) || 900, 1180) - 44, 320);
    const height = 240;
    const margin = { top: 16, right: 24, bottom: 26, left: 56 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const allPoints = all.flatMap(s => s.points);
    const t0 = Math.min(...allPoints.map(p => p.d.getTime())), t1 = Math.max(...allPoints.map(p => p.d.getTime()));
    const x = d => margin.left + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * innerW;
    const lo = Math.min(0, ...allPoints.map(p => p.pct)), hi = Math.max(0, ...allPoints.map(p => p.pct));
    const rough = (hi - lo || 0.1) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= rough);
    const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step || step;
    const y = v => margin.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    let grid = '';
    for (let v = yMin; v <= yMax + step / 1000; v += step) {
        grid += `<line x1="${margin.left}" x2="${margin.left + innerW}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"${Math.abs(v) < step / 1000 ? ' style="stroke:var(--ink-4);"' : ''}/>`
            + `<text x="${margin.left - 8}" y="${y(v) + 3.5}" class="chart-axis" text-anchor="end">${Math.abs(v) < step / 1000 ? '0%' : `${v > 0 ? '+' : ''}${+(v * 100).toFixed(1)}%`}</text>`;
    }
    const fmtDate = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const xLabels = [0, 1 / 3, 2 / 3, 1].map(f => new Date(t0 + f * (t1 - t0)))
        .map(d => `<text x="${x(d)}" y="${height - 8}" class="chart-axis" text-anchor="middle">${fmtDate(d)}</text>`).join('');
    const path = s => s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.d)},${y(p.pct)}`).join(' ');
    // A dot on each line where you bought
    const buyDots = series.flatMap(s => s.buys.map(date => s.points.find(p => p.date >= date)).filter(Boolean)
        .map(p => `<circle cx="${x(p.d)}" cy="${y(p.pct)}" r="3.5" class="perf-dot" style="fill:${s.color};"><title>${escapeHtml(s.symbol)} bought ${escapeHtml(p.date)}</title></circle>`)).join('');
    const latest = s => s.points[s.points.length - 1];

    return {
        html: `
        <div class="chart-legend">
            ${series.map(s => `<span><span class="legend-line" style="background:${s.color};"></span>${escapeHtml(s.symbol)} <strong style="color:${latest(s).pct >= 0 ? 'var(--green)' : 'var(--red)'};">${pctText(latest(s).pct)}</strong></span>`).join('')}
            ${reference ? `<span><span class="legend-line dashed"></span>${escapeHtml(reference.name)} ${pctText(latest(reference).pct)}</span>` : ''}
        </div>
        <div class="chart-wrap">
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Each stock's price since you bought it, as a percentage above or below what you paid">
                ${grid}
                ${reference ? `<path d="${path(reference)}" class="perf-line invested" style="stroke:var(--text-muted);"/>` : ''}
                ${series.map(s => `<path d="${path(s)}" class="perf-line" style="stroke:${s.color};"/>`).join('')}
                ${buyDots}${xLabels}
                <line id="stockCrosshair" class="perf-crosshair" y1="${margin.top}" y2="${margin.top + innerH}" x1="0" x2="0" style="display:none;"/>
                <rect x="${margin.left}" y="${margin.top}" width="${innerW}" height="${innerH}" fill="transparent" id="stockHit"/>
            </svg>
            <div class="chart-tooltip" id="stockTooltip"></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">% above or below the average price you paid (dots mark each purchase)${series.some(s => !s.fromPaid) ? '; stocks without a price paid are measured from their first day' : ''}.</div>`,
        // Tooltip: each line's price on the hovered day
        wire: () => {
            const hit = document.getElementById('stockHit');
            const tip = document.getElementById('stockTooltip');
            const cross = document.getElementById('stockCrosshair');
            if (!hit) return;
            hit.addEventListener('mousemove', ev => {
                const box = hit.ownerSVGElement.getBoundingClientRect();
                const px = (ev.clientX - box.left) * (width / box.width);
                const when = t0 + ((px - margin.left) / innerW) * (t1 - t0);
                const nearest = allPoints.reduce((best, p) => Math.abs(p.d.getTime() - when) < Math.abs(best.d.getTime() - when) ? p : best, allPoints[0]);
                cross.setAttribute('x1', x(nearest.d)); cross.setAttribute('x2', x(nearest.d)); cross.style.display = '';
                const rows = all.map(s => {
                    const p = [...s.points].reverse().find(q => q.date <= nearest.date);
                    return p ? `<div class="chart-tip-row"><span>${escapeHtml(s.symbol)}</span><span>US$${p.price.toFixed(2)} · <strong>${pctText(p.pct)}</strong></span></div>` : '';
                }).join('');
                tip.innerHTML = `<div class="chart-tip-title">${nearest.d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>${rows}`;
                tip.style.left = `${Math.min(x(nearest.d) + 12, width - 200)}px`;
                tip.style.top = '8px';
                tip.style.display = 'block';
            });
            hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.style.display = 'none'; });
        }
    };
}

function renderInvestments() {
    const container = document.getElementById('investmentsTracker');
    if (!container) return;
    const inv = getInvestments();
    const s = getPortfolioSummary();
    const fx = inv.fx;
    const rate = getUsdAud();
    const money = (n, cur = '$') => (n < 0 ? '-' : '') + cur + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const whole = (n, cur = '$') => (n < 0 ? '-' : '') + cur + Math.round(Math.abs(n)).toLocaleString('en-AU');
    const signed = (n, cur) => (n >= 0 ? '+' : '-') + money(Math.abs(n), cur);
    const signedWhole = (n, cur) => (n >= 0 ? '+' : '-') + cur + Math.round(Math.abs(n)).toLocaleString('en-AU');
    const tone = n => n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text-primary)';
    const pctText = p => p === null || p === undefined || !isFinite(p) ? '—' : `${p >= 0 ? '+' : ''}${(p * 100).toFixed(2)}%`;
    const sub = text => `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;font-weight:400;">${text}</div>`;
    const dateStr = d => d ? parseLocalDate(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const last = inv.lastRefresh;
    const approx = '<span title="Uses today\'s exchange rate until the rate for that date has been looked up">≈</span>';

    // ---- Summary ----
    const summaryHtml = `
        <div class="private" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
            <div class="tax-item"><div class="label">Portfolio value</div><div class="value" style="color:var(--green);">${s.missingRate ? '—' : whole(s.valueAud, 'A$')}</div><div class="label">${s.valueUsd > 0 ? whole(s.valueUsd, 'US$') : ''}${s.missingRate ? ' · A$ needs USD/AUD rate' : ''}</div></div>
            <div class="tax-item"><div class="label">Total profit / loss</div><div class="value" style="color:${tone(s.totalAud || 0)};">${s.totalAud === null ? '—' : signedWhole(s.totalAud, 'A$')}</div><div class="label">${s.totalAud === null ? (s.missingRate ? 'needs USD/AUD rate' : 'enter what you paid') : pctText(s.totalPct) + ' · ' + signedWhole(s.totalUsd, 'US$')}</div></div>
            <div class="tax-item"><div class="label">Today</div><div class="value" style="color:${tone(s.dayChangeAud)};">${s.missingRate ? '—' : signedWhole(s.dayChangeAud, 'A$')}</div><div class="label">${rate ? signedWhole(s.dayChangeAud / rate, 'US$') + ' · ' : ''}since previous close</div></div>
            <div class="tax-item"><div class="label">Unrealised gain</div><div class="value" style="color:${tone(s.gainAud || 0)};">${s.gainAud === null ? '—' : signedWhole(s.gainAud, 'A$')}</div><div class="label">${s.gainAud === null ? (s.missingRate ? 'needs USD/AUD rate' : 'enter what you paid') : signedWhole(s.gainUsd, 'US$') + ' · ' + pctText(s.gainPct)}</div></div>
            <div class="tax-item"><div class="label">Realised (sold)</div><div class="value" style="color:${tone(s.realisedAud || 0)};">${s.realisedAud === null ? '—' : signedWhole(s.realisedAud, 'A$')}</div><div class="label">${s.realisedUsd === null ? 'nothing sold yet' : signedWhole(s.realisedUsd, 'US$')}</div></div>
            <div class="tax-item"><div class="label">USD → AUD</div><div class="value">${fx ? fx.usdAud.toFixed(4) : '—'}</div><div class="label">${fx ? escapeHtml((fx.source || 'ECB') + ', ' + fx.date) : 'not fetched yet'}</div></div>
        </div>
        <div class="form-row" style="margin-top:14px;">
            <button class="btn btn-primary" onclick="refreshInvestmentPrices()" ${investmentRefreshInProgress ? 'disabled' : ''}>↻ Update prices</button>
            <span id="invRefreshStatus" style="font-size:12px;color:var(--text-muted);">
                ${last ? 'Last updated: ' + new Date(last.at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'Prices not fetched yet'}
                ${last?.failed?.length ? ` · <span style="color:var(--amber);">couldn't update: ${last.failed.map(escapeHtml).join(', ')}</span>` : ''}
                ${s.unpriced.length && last ? ` · <span style="color:var(--amber);">no price yet for ${s.unpriced.map(escapeHtml).join(', ')}</span>` : ''}
                ${s.missingRate ? ' · <span style="color:var(--amber);">A$ values need the USD/AUD rate - press Update prices again</span>' : ''}
            </span>
        </div>
    `;

    // ---- Holdings (open purchases) ----
    const open = getOpenLots().sort((a, b) => a.symbol.localeCompare(b.symbol) || (a.purchaseDate || '').localeCompare(b.purchaseDate || ''));
    const paidCell = l => {
        const c = getLotCost(l);
        const legacy = !l.costPerShareUsd && l.legacyCostPerShareAud ? `<div style="font-size:10px;color:var(--amber);margin-top:2px;">enter the US$ price (was A$${(+l.legacyCostPerShareAud).toFixed(2)}/share)</div>` : '';
        return `<input class="inline-edit" type="number" step="0.01" min="0" value="${l.costPerShareUsd ? +(+l.costPerShareUsd).toFixed(4) : ''}" placeholder="US$" style="width:90px;text-align:right;" onchange="updateLot('${l.id}', 'costPerShareUsd', this.value)" />
            ${c.known ? sub(`total ${money(c.usd, 'US$')} · ${c.approxAud ? approx : ''}${money(c.aud, 'A$')}`)
                + (!c.approxAud && c.rate ? sub(`at ${c.rate.toFixed(4)}${c.feesAud ? ` incl. ${money(c.feesAud, 'A$')} fees` : ''}`) : '') : legacy}`;
    };
    // Optional fees from your broker's confirmation
    const feesCell = (feesAud, onchange) => `<input class="inline-edit" type="number" step="0.01" min="0" value="${feesAud ? (+feesAud).toFixed(2) : ''}" placeholder="A$" title="Brokerage and other fees, in A$" style="width:80px;text-align:right;" onchange="${onchange}" />`;
    const holdingsHtml = open.length === 0
        ? '<div class="empty-state" style="padding:20px;"><div class="message">No holdings</div><div class="sub">Add a purchase below</div></div>'
        : `
        <div class="mbh-scroll">
            <table class="mbh-table" style="width:100%;">
                <thead><tr>
                    <th class="mbh-cat-header">Stock</th><th>Bought</th><th>Shares</th><th>Paid per share (US$)</th><th>Fees (A$)</th><th>Price (US$)</th><th>Today</th>
                    <th>Value</th><th title="A$ gain uses the exchange rate on the purchase date for what you paid">Gain / loss</th><th>Sold</th><th></th>
                </tr></thead>
                <tbody>${open.map(l => {
                    const v = getLotValue(l);
                    return `
                    <tr>
                        <td class="mbh-cat-name">${escapeHtml(l.symbol)}${sub(escapeHtml(l.name || ''))}</td>
                        <td><input class="inline-edit" type="date" value="${escapeHtml(l.purchaseDate || '')}" max="${toLocalISODate()}" onchange="updateLot('${l.id}', 'purchaseDate', this.value)" /></td>
                        <td><input class="inline-edit" type="number" step="any" min="0" value="${l.shares}" style="width:70px;text-align:right;" onchange="updateLot('${l.id}', 'shares', this.value)" /></td>
                        <td>${paidCell(l)}</td>
                        <td>${feesCell(l.feesAud, `updateLot('${l.id}', 'feesAud', this.value)`)}</td>
                        <td>${v.priced ? money(v.priceUsd, 'US$') : '—'}</td>
                        <td style="color:${tone(v.changePct || 0)};">${v.priced && v.changePct !== null ? (v.changePct >= 0 ? '+' : '') + v.changePct.toFixed(2) + '%' : '—'}</td>
                        <td style="font-weight:700;">${v.converted ? money(v.valueAud, 'A$') + sub(money(v.valueUsd, 'US$')) : v.priced ? money(v.valueUsd, 'US$') + sub('A$ needs rate') : '—'}</td>
                        <td style="color:${tone(v.gainAud ?? v.gainUsd ?? 0)};">${v.gainAud !== null ? signed(v.gainAud, 'A$') + ` (${pctText(v.gainAud / v.cost.aud)})` + sub(signed(v.gainUsd, 'US$') + ` (${pctText(v.gainUsd / v.cost.usd)})`) : v.gainUsd !== null ? signed(v.gainUsd, 'US$') : '—'}</td>
                        <td><input type="checkbox" title="Mark as sold" onchange="toggleSold('${l.id}', this.checked)" /></td>
                        <td><button class="delete-btn" onclick="removeLot('${l.id}')" title="Delete">✕</button></td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>`;

    const addHtml = `
        <div class="form-row">
            <input id="invSymbol" list="sp500Options" placeholder="Ticker, e.g. AAPL" onfocus="fillSp500Picker()" style="max-width:170px;" autocomplete="off" />
            <datalist id="sp500Options"></datalist>
            <input id="invShares" type="number" step="any" min="0" placeholder="Shares" style="max-width:110px;" />
            <input id="invCost" type="number" step="0.01" min="0" placeholder="US$ per share" title="Paid per share, US$" style="max-width:150px;" />
            <input id="invDate" type="date" value="${toLocalISODate()}" max="${toLocalISODate()}" title="Purchase date" style="max-width:160px;" />
            <input id="invFees" type="number" step="0.01" min="0" placeholder="A$ fees" title="Optional. Brokerage and other fees, in A$" style="max-width:110px;" />
            <button class="btn btn-success" onclick="addHolding()">+ Add purchase</button>
        </div>
        <div id="invAddHint" style="font-size:11px;color:var(--amber);"></div>
    `;

    // ---- Sold ----
    const sold = getSoldLots().sort((a, b) => (b.sold.date || '').localeCompare(a.sold.date || ''));
    const soldHtml = sold.length === 0 ? '' : `
        <div class="card">
            <div class="card-header"><div class="card-title">Sold</div><span class="badge">Not counted in holdings or net worth</span></div>
            <div class="mbh-scroll">
                <table class="mbh-table" style="width:100%;">
                    <thead><tr>
                        <th class="mbh-cat-header">Stock</th><th>Bought</th><th>Sold</th><th>Shares</th><th>Paid per share (US$)</th><th>Sold at (US$)</th><th>Sale fees (A$)</th>
                        <th>Proceeds</th><th title="A$ uses the exchange rates on the purchase and sale dates">Realised gain</th><th>Held</th><th></th>
                    </tr></thead>
                    <tbody>${sold.map(l => {
                        const r = getSoldResult(l);
                        const held = r.heldDays === null ? '—' : r.heldDays >= 365 ? `${(r.heldDays / 365).toFixed(1)} yrs` : `${r.heldDays} days`;
                        return `
                        <tr>
                            <td class="mbh-cat-name">${escapeHtml(l.symbol)}${sub(escapeHtml(l.name || ''))}</td>
                            <td>${dateStr(l.purchaseDate)}</td>
                            <td><input class="inline-edit" type="date" value="${escapeHtml(l.sold.date || '')}" max="${toLocalISODate()}" onchange="updateSold('${l.id}', 'date', this.value)" /></td>
                            <td>${l.shares}</td>
                            <td>${l.costPerShareUsd ? money(l.costPerShareUsd, 'US$') : '—'}${r.cost.known && r.cost.aud ? sub(`cost ${money(r.cost.aud, 'A$')}`) + (r.cost.feesAud ? sub(`incl. ${money(r.cost.feesAud, 'A$')} fees`) : '') : ''}</td>
                            <td><input class="inline-edit" type="number" step="0.01" min="0" value="${l.sold.pricePerShareUsd || ''}" style="width:90px;text-align:right;" onchange="updateSold('${l.id}', 'pricePerShareUsd', this.value)" /></td>
                            <td>${feesCell(l.sold.feesAud, `updateSold('${l.id}', 'feesAud', this.value)`)}</td>
                            <td>${r.proceedsAud ? (r.approxAud ? approx : '') + money(r.proceedsAud, 'A$') : '—'}${sub(money(r.proceedsUsd, 'US$'))}${r.feesAud ? sub(`after ${money(r.feesAud, 'A$')} fees`) : ''}</td>
                            <td style="color:${tone(r.gainAud ?? r.gainUsd ?? 0)};">${r.gainAud !== null ? signed(r.gainAud, 'A$') + sub(signed(r.gainUsd, 'US$')) : r.gainUsd !== null ? signed(r.gainUsd, 'US$') : '—'}</td>
                            <td title="${r.heldDays !== null && r.heldDays > 365 ? 'Held over 12 months - may qualify for the 50% CGT discount' : ''}">${held}${r.heldDays !== null && r.heldDays > 365 ? sub('over 12 months') : ''}</td>
                            <td style="white-space:nowrap;">
                                <button class="btn btn-sm btn-outline" onclick="toggleSold('${l.id}', false)" title="Move back to holdings">↩</button>
                                <button class="delete-btn" onclick="removeLot('${l.id}')" title="Delete">✕</button>
                            </td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;

    const perf = renderPerformanceChart(getPerformanceHistory());
    const stocks = renderStockChart();

    const keyRow = (id, value, label, link) => `
        <div class="form-row" style="margin-bottom:8px;align-items:center;">
            <span style="font-size:12px;color:var(--text-muted);width:190px;">${label}</span>
            <input id="${id}" type="password" value="${escapeHtml(value || '')}" placeholder="API key" onchange="updateInvestmentSettings()" autocomplete="off" style="max-width:320px;" />
            ${value ? '' : `<a href="${link}" target="_blank" rel="noopener" style="font-size:12px;">get a free key</a>`}
        </div>`;
    const settingsHtml = keyRow('invApiKey', inv.apiKey, 'Finnhub - live prices', 'https://finnhub.io/register')
        + keyRow('invHistoryKey', inv.historyApiKey, 'Twelve Data - price history', 'https://twelvedata.com/register');

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><div class="card-title">Portfolio</div><span class="badge">Counts towards net worth</span></div>
            ${summaryHtml}
        </div>
        <div class="card">
            <div class="card-header"><div class="card-title">Performance</div>${perf.toggle}</div>
            <div class="private">${perf.html}</div>
        </div>
        ${stocks ? `<div class="card">
            <div class="card-header"><div class="card-title">Since you bought</div></div>
            ${stocks.html}
        </div>` : ''}
        <div class="card">
            <div class="card-header"><div class="card-title">Holdings</div></div>
            <div class="private">${holdingsHtml}</div>
            <div style="margin-top:14px;">${addHtml}</div>
        </div>
        <div class="private">${soldHtml}</div>
        <div class="card">
            <div class="card-header"><div class="card-title">API Keys</div></div>
            ${settingsHtml}
        </div>
    `;
    if (perf.wire) perf.wire();
    if (stocks) stocks.wire();
}
