// ================================================================
// END-OF-YEAR SUMMARY - one printable page for tax time: income by
// job, deductions, share sales, estimated tax, spending and net worth.
// Before 30 June it shows the year so far plus what's still expected.
// ================================================================

// Capital gains on shares sold this financial year, the ATO way: losses
// come off gains held under 12 months first, then the 50% discount
// applies to what's left of gains held over 12 months.
function getFYCapitalGains() {
    const sales = (appData.investments?.holdings || [])
        .filter(l => l.sold && l.sold.date && isInFY(l.sold.date))
        .map(l => ({ lot: l, result: getSoldResult(l) }))
        .filter(s => s.result.gainAud !== null);
    let shortGains = 0, longGains = 0, losses = 0;
    sales.forEach(({ result }) => {
        if (result.gainAud < 0) losses -= result.gainAud;
        else if (result.heldDays !== null && result.heldDays > 365) longGains += result.gainAud;
        else shortGains += result.gainAud;
    });
    const shortLeft = Math.max(0, shortGains - losses);
    const lossesLeft = Math.max(0, losses - shortGains);
    const longLeft = Math.max(0, longGains - lossesLeft);
    return {
        sales, shortGains, longGains, losses,
        netCapitalGain: shortLeft + longLeft / 2,
        lossCarriedForward: Math.max(0, lossesLeft - longGains),
        unpriced: (appData.investments?.holdings || []).filter(l => l.sold && l.sold.date && isInFY(l.sold.date)).length - sales.length
    };
}

function getYearSummary() {
    const projection = getFYIncomeProjection();
    const paidByJob = {};
    getPayEvents().filter(e => e.actual && e.payDate >= FY_START && e.payDate <= FY_END)
        .forEach(e => { paidByJob[e.jobId] = (paidByJob[e.jobId] || 0) + e.amount; });
    const deductions = sumExpensesByCategory((appData.expenses || []).filter(e => e.deductible && isInFY(e.date)));
    const deductionsTotal = Object.values(deductions).reduce((s, v) => s + v, 0);
    const cgt = getFYCapitalGains();
    const taxable = Math.max(0, projection.annual - deductionsTotal + cgt.netCapitalGain);
    const tax = calculateTax(taxable);
    const spending = sumExpensesByCategory(getFYExpenses());
    const spendingTotal = Object.values(spending).reduce((s, v) => s + v, 0);
    const assets = getTotalAssets();
    const liabilities = (appData.liabilities || []).reduce((s, l) => s + (l.value || 0), 0);
    return {
        yearOver: new Date() > FY_END,
        jobs: JOBS.map(j => ({ name: j.name, paid: paidByJob[j.id] || 0, expected: projection.byJob[j.id] || 0 })),
        paidTotal: projection.actualToDate, expectedTotal: projection.annual,
        deductions, deductionsTotal, cgt, taxable, tax,
        spending, spendingTotal,
        netAfterTaxAndSpending: projection.actualToDate * (1 - getFYTaxRate()) - spendingTotal,
        assets, liabilities, netWorth: assets - liabilities,
        loan: appData.loan || {}
    };
}

function renderEoySummary() {
    const container = document.getElementById('eoySummary');
    if (!container) return;
    const s = getYearSummary();
    const dollars = n => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-AU');
    const fy = `${FY_START.getFullYear()}–${String(FY_END.getFullYear()).slice(-2)}`;
    const asAt = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    const sorted = obj => Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const table = (head, rows, foot) => `<table class="eoy-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        ${foot ? `<tfoot><tr>${foot.map(c => `<td>${c}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    const pending = !s.yearOver;

    const incomeHtml = table(
        pending ? ['Job', 'Paid so far', 'Expected for the year'] : ['Job', 'Paid'],
        s.jobs.filter(j => j.paid || j.expected).map(j => pending ? [escapeHtml(j.name), dollars(j.paid), dollars(j.expected)] : [escapeHtml(j.name), dollars(j.paid)]),
        pending ? ['Total', dollars(s.paidTotal), dollars(s.expectedTotal)] : ['Total', dollars(s.paidTotal)]
    );
    const deductionsHtml = s.deductionsTotal
        ? table(['Category', 'Amount'], sorted(s.deductions).map(([c, v]) => [escapeHtml(c), dollars(v)]), ['Total', dollars(s.deductionsTotal)])
        : '<p class="eoy-note">No expenses marked as deductible.</p>';
    const cgt = s.cgt;
    const salesHtml = cgt.sales.length
        ? table(['Sold', 'Shares', 'Held', 'Gain / loss (A$)'], cgt.sales.map(({ lot, result }) => [
            `${escapeHtml(lot.symbol)} · ${escapeHtml(lot.sold.date)}`, String(lot.shares),
            result.heldDays === null ? '—' : result.heldDays > 365 ? `${result.heldDays} days (discount)` : `${result.heldDays} days`,
            dollars(result.gainAud)]))
          + `<p class="eoy-note">Net capital gain: <strong>${dollars(cgt.netCapitalGain)}</strong>${cgt.longGains ? ' (after the 50% discount on shares held over 12 months)' : ''}${cgt.lossCarriedForward ? ` · loss carried forward: ${dollars(cgt.lossCarriedForward)}` : ''}${cgt.unpriced ? ` · ${cgt.unpriced} sale(s) missing a purchase price, not counted` : ''}</p>`
        : '<p class="eoy-note">No shares sold this year.</p>';
    const t = s.tax;
    const taxHtml = table(['', 'Estimate'], [
        [pending ? 'Expected income' : 'Income', dollars(s.expectedTotal)],
        ['Less deductions', '-' + dollars(s.deductionsTotal)],
        ...(cgt.netCapitalGain ? [['Plus net capital gain', dollars(cgt.netCapitalGain)]] : []),
        ['Taxable income', dollars(s.taxable)],
        ['Income tax (after low income offset)', dollars(t.tax)],
        ['Medicare levy', dollars(t.medicare)]
    ], ['Total tax', `${dollars(t.total)} (${s.taxable ? (t.total / s.taxable * 100).toFixed(1) : '0.0'}%)`]);
    const spendingHtml = s.spendingTotal
        ? table(['Category', 'Spent'], sorted(s.spending).map(([c, v]) => [escapeHtml(c), dollars(v)]), ['Total', dollars(s.spendingTotal)])
        : '<p class="eoy-note">No expenses recorded.</p>';
    const positionHtml = table(['', ''], [
        ['Assets', dollars(s.assets)],
        ['Liabilities', dollars(s.liabilities)],
        ['Net worth', `<strong>${dollars(s.netWorth)}</strong>`],
        ['Home loan balance', dollars(s.loan.currentBalance || 0)],
        ['Offset balance', dollars(s.loan.offset || 0)]
    ]);

    container.innerHTML = `
        <div class="eoy-head">
            <div>
                <div class="eoy-title">Financial year ${fy}</div>
                <div class="eoy-note">${pending ? `Year to date as at ${asAt}, with pay still expected to 30 June` : 'Full year'} · tax figures are estimates</div>
            </div>
            <button class="btn btn-primary btn-sm eoy-print-hide" onclick="printEoySummary()">Print / save as PDF</button>
        </div>
        <div class="eoy-grid">
            <section><h4>Income</h4>${incomeHtml}</section>
            <section><h4>Estimated tax</h4>${taxHtml}</section>
            <section><h4>Deductions</h4>${deductionsHtml}</section>
            <section><h4>Shares sold</h4>${salesHtml}</section>
            <section><h4>Spending</h4>${spendingHtml}
                <p class="eoy-note">Left after tax and spending so far: <strong>${dollars(s.netAfterTaxAndSpending)}</strong></p></section>
            <section><h4>Where you stand</h4>${positionHtml}</section>
        </div>`;
}

// Prints just the summary (the browser's print dialog can save a PDF)
function printEoySummary() {
    renderEoySummary();
    document.body.classList.add('printing-eoy');
    const done = () => { document.body.classList.remove('printing-eoy'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
}
