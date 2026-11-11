// ================================================================
// BACKUP (EXCEL) - the year on screen as a spreadsheet: readable
// sheets, one per area, plus a hidden "Data" sheet holding everything
// exactly, which is what Import restores from. (Edits to the readable
// sheets aren't imported; Import warns if it notices any.)
// ================================================================

const BACKUP_MARK = 'FINANCE_TRACKER_BACKUP v1';
const BACKUP_CHUNK = 30000;   // Excel allows 32,767 characters a cell

function buildFinanceWorkbook(Excel, data) {
    const wb = new Excel.Workbook();
    wb.creator = 'Finance Tracker';
    const money = '$#,##0.00;[Red]-$#,##0.00';
    const sheet = (name, cols) => {
        const ws = wb.addWorksheet(name);
        ws.columns = cols.map(([header, width, fmt]) => ({ header, width, style: fmt ? { numFmt: fmt } : {} }));
        const head = ws.getRow(1);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        return ws;
    };
    const put = (ws, vals) => {
        const row = ws.getRow(ws.rowCount + 1);
        vals.forEach((v, i) => { row.getCell(i + 1).value = v === undefined ? null : v; });
        row.commit();
        return row;
    };
    // Excel has no time zones: write each local date/time as the same
    // clock reading in UTC, or Brisbane dates show a day early
    const asExcel = d => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
    const date = s => (s ? asExcel(parseLocalDate(s)) : null);
    const stamp = iso => (iso ? asExcel(new Date(iso)) : null);
    const fy = data.financialYear;
    const jobName = id => (typeof JOBS !== 'undefined' && JOBS.find(j => j.id === Number(id))?.name) || `Job ${id}`;

    // Summary
    const sum = sheet('Summary', [['Item', 34], ['Value', 18]]);
    const totalExpenses = (data.expenses || []).filter(e => !e.excludeFromTotals).reduce((t, e) => t + (e.amount || 0), 0);
    const income = (data.income || []).reduce((t, w) => t + (w.shifts || []).reduce((s, sh) => s + shiftPay(sh), 0), 0);
    const assets = typeof getTotalAssets === 'function' ? getTotalAssets() : 0;
    const liabilities = (data.liabilities || []).reduce((t, l) => t + (l.value || 0), 0);
    [
        ['Financial year', `${fy}–${String(fy + 1).slice(-2)}${data.yearClosedOn ? ' (archived)' : ''}`],
        ['Backup made', asExcel(new Date())],
        ['Gross pay logged', income],
        ['Expenses (not counting excluded)', totalExpenses],
        ['Total assets (incl. savings and shares)', assets],
        ['Total liabilities', liabilities],
        ['Net worth', assets - liabilities],
        ['Home loan balance', data.loan?.currentBalance || 0],
        ['Offset / savings', data.loan?.offset || 0]
    ].forEach(([k, v]) => {
        const row = put(sum, [k, v]);
        if (typeof v === 'number') row.getCell(2).numFmt = money;
        if (v instanceof Date) row.getCell(2).numFmt = 'd mmm yyyy h:mm';
    });

    // Income: one row per shift
    const inc = sheet('Income', [['Week starting', 14, 'd mmm yyyy'], ['Job', 12], ['Hours', 8, '0.0#'], ['Public holiday', 14], ['Rate', 10, money], ['Pay', 12, money]]);
    (data.income || []).slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(w => (w.shifts || []).forEach(sh => {
        const rate = (sh.ph ? data.phRates?.['job' + sh.job] : data.rates?.['job' + sh.job]) || 0;
        put(inc, [date(w.date), jobName(sh.job), sh.hours || 0, sh.ph ? 'Yes' : '', rate, shiftPay(sh)]);
    }));

    // Expenses
    const exp = sheet('Expenses', [['Date', 14, 'd mmm yyyy'], ['Category', 18], ['Description', 34], ['Amount', 12, money], ['Deductible', 11], ['Excluded from totals', 18]]);
    (data.expenses || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e =>
        put(exp, [date(e.date), e.category || '', e.description || '', e.amount || 0, e.deductible ? 'Yes' : '', e.excludeFromTotals ? 'Yes' : '']));

    // Budgets
    const bud = sheet('Budgets', [['Category', 22], ['Monthly budget', 16, money]]);
    (data.categories || Object.keys(data.budgets || {})).forEach(c => put(bud, [c, data.budgets?.[c] || 0]));

    // Home loan
    const loan = sheet('Home Loan', [['Item', 24], ['Value', 18]]);
    const l = data.loan || {};
    [['Original amount', l.initial, money], ['Current balance', l.currentBalance, money], ['Interest rate %', l.rate, '0.00'],
     ['Term (years)', l.term], ['Offset', l.offset, money], ['Start date', date(l.startDate), 'd mmm yyyy']]
        .forEach(([k, v, f]) => { const row = put(loan, [k, v ?? null]); if (f) row.getCell(2).numFmt = f; });
    if ((data.renovation || []).length) {
        put(loan, []);
        put(loan, ['Renovation costs']).font = { bold: true };
        data.renovation.forEach(r => { const row = put(loan, [r.item, r.cost || 0]); row.getCell(2).numFmt = money; });
    }

    // Net worth
    const nw = sheet('Net Worth', [['Type', 12], ['Name', 28], ['Value', 16, money], ['Last updated', 16, 'd mmm yyyy']]);
    put(nw, ['Asset', 'Savings (offset)', data.loan?.offset || 0, null]);
    (data.assets || []).forEach(a => put(nw, ['Asset', a.name, a.value || 0, stamp(a.lastUpdated)]));
    if (typeof getInvestmentsValueAud === 'function') put(nw, ['Asset', 'Share portfolio (latest)', getInvestmentsValueAud(), null]);
    (data.liabilities || []).forEach(li => put(nw, ['Liability', li.name, li.value || 0, stamp(li.lastUpdated)]));

    // Investments
    const holdings = data.investments?.holdings || [];
    if (holdings.length) {
        const inv = sheet('Investments', [['Ticker', 10], ['Shares', 10, '0.####'], ['US$ per share', 14, '$#,##0.00'], ['Purchase date', 14, 'd mmm yyyy'],
            ['A$ fees', 10, money], ['A$ cost', 12, money], ['Sold', 8], ['Sold date', 14, 'd mmm yyyy'], ['US$ sale price', 14, '$#,##0.00']]);
        holdings.forEach(h => {
            const cost = typeof getLotCost === 'function' ? getLotCost(h).aud : null;
            put(inv, [h.symbol, h.shares || 0, h.costPerShareUsd || 0, date(h.purchaseDate), h.feesAud || 0, cost, h.sold ? 'Yes' : '',
                h.sold?.date ? date(h.sold.date) : null, h.sold?.pricePerShareUsd ?? null]);
        });
    }

    // Planning
    const goals = data.planning?.goals || [];
    if (goals.length) {
        const pl = sheet('Big Purchases', [['In order', 30], ['Cost', 12, money], ['Buffer', 12, money], ['Running cost /mo', 16, money]]);
        goals.forEach(g => put(pl, [g.name, g.cost || 0, g.buffer || 0, g.ongoingMonthly || 0]));
    }

    // Home office log
    if ((data.homeOfficeLog || []).length) {
        const ho = sheet('Home Office', [['Date', 14, 'd mmm yyyy'], ['Hours', 8, '0.0#'], ['Notes', 40]]);
        data.homeOfficeLog.forEach(e => put(ho, [date(e.date), e.hours || 0, e.notes || '']));
    }

    // Calendar and lists
    if ((data.events || []).length) {
        const cal = sheet('Calendar', [['Date', 14, 'd mmm yyyy'], ['Start', 8], ['End', 8], ['Title', 30], ['Repeats', 12], ['Until', 14, 'd mmm yyyy'], ['Details', 40]]);
        data.events.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e =>
            put(cal, [date(e.date), e.startTime || '', e.endTime || '', e.title || '', e.recurrence && e.recurrence !== 'none' ? e.recurrence : '', date(e.recurrenceEnd), e.details || '']));
    }
    if ((data.lists || []).length) {
        const li = sheet('Lists', [['List', 20], ['Item', 40], ['Done', 8], ['Starred', 8]]);
        data.lists.forEach(list => list.items.forEach(it => put(li, [list.name, it.text, it.done ? 'Yes' : '', it.starred ? 'Yes' : ''])));
    }

    // Everything, exactly, for Import (hidden so it isn't edited by accident)
    const raw = wb.addWorksheet('Data', { state: 'veryHidden' });
    // Includes the Shopping tab (stored separately, so it can be shared)
    const json = JSON.stringify(typeof getShopping === 'function' ? { ...data, shopping: getShopping() } : data);
    raw.getCell(1, 1).value = BACKUP_MARK;
    for (let i = 0, r = 2; i < json.length; i += BACKUP_CHUNK, r++) raw.getCell(r, 1).value = json.slice(i, i + BACKUP_CHUNK);
    return wb;
}

// Reads a backup made by the app. Returns { text, warnings }: text is the
// saved data (JSON); warnings note edits to the readable sheets.
async function readBackupWorkbook(Excel, buffer) {
    const wb = new Excel.Workbook();
    await wb.xlsx.load(buffer);
    const raw = wb.getWorksheet('Data');
    if (!raw || cellText(raw.getCell(1, 1).value) !== BACKUP_MARK) {
        throw new Error('it isn\'t a backup made by this app (use Backup to make one)');
    }
    let text = '';
    for (let r = 2; r <= raw.rowCount; r++) text += cellText(raw.getCell(r, 1).value);
    const data = JSON.parse(text);
    const warnings = [];
    // Spot edits to the readable sheets, which Import doesn't use
    const exp = wb.getWorksheet('Expenses');
    if (exp) {
        let count = 0, total = 0;
        exp.eachRow((row, r) => { if (r > 1) { count++; total += Number(row.getCell(4).value) || 0; } });
        const saved = data.expenses || [];
        const savedTotal = saved.reduce((t, e) => t + (e.amount || 0), 0);
        if (count !== saved.length || Math.abs(total - savedTotal) > 0.005) warnings.push('the Expenses sheet');
    }
    const inc = wb.getWorksheet('Income');
    if (inc) {
        let hours = 0;
        inc.eachRow((row, r) => { if (r > 1) hours += Number(row.getCell(3).value) || 0; });
        const savedHours = (data.income || []).reduce((t, w) => t + (w.shifts || []).reduce((s, sh) => s + (sh.hours || 0), 0), 0);
        if (Math.abs(hours - savedHours) > 0.005) warnings.push('the Income sheet');
    }
    return { text, warnings };
}

async function downloadBackupExcel() {
    try {
        const Excel = await loadExcelJS();
        const wb = buildFinanceWorkbook(Excel, appData);
        saveWorkbook(await wb.xlsx.writeBuffer(), getDefaultFileName().replace(/\.json$/i, '.xlsx'));
        setStatus('Backup downloaded', '');
    } catch (e) {
        console.error('Excel backup failed:', e);
        setStatus('Backup failed: ' + e.message, 'error');
    }
}
