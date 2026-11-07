// ================================================================
// LOAN - Home loan details, payoff projection, graph
// ================================================================

// ================================================================
// RENDER LOAN DETAILS
// ================================================================

function renderLoan() {
    const l = appData.loan || DEFAULT_DATA.loan;
    document.getElementById('loanInitial').value = l.initial || 0;
    document.getElementById('loanCurrentBalance').value = l.currentBalance || 0;
    document.getElementById('loanRate').value = l.rate || 0;
    document.getElementById('loanTerm').value = l.term || 30;
    document.getElementById('offsetBalance').value = l.offset || 0;
    document.getElementById('loanStartDate').value = l.startDate || toLocalISODate();

    // Interest still to pay if you only make the required repayment,
    // with your offset reducing the interest each month
    const payment = calculateMonthlyRepayment(l);
    const totalInterest = simulateLoanPayoff(l, payment).totalInterest;

    document.getElementById('loanDetails').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
            <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">Monthly Repayment</div>
                <div style="font-size:18px;font-weight:600;color:var(--amber);">$${payment.toFixed(2)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">Total Interest</div>
                <div style="font-size:18px;font-weight:600;color:var(--red);">$${totalInterest.toFixed(0)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">Current Balance</div>
                <div style="font-size:18px;font-weight:600;color:var(--blue);">$${(l.currentBalance || 0).toFixed(0)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">Offset Balance</div>
                <div style="font-size:18px;font-weight:600;color:var(--green);">$${(l.offset || 0).toFixed(0)}</div>
            </div>
        </div>
    `;
}

// ================================================================
// UPDATE LOAN
// ================================================================

function updateLoan() {
    appData.loan = {
        initial: parseFloat(document.getElementById('loanInitial').value) || 0,
        currentBalance: parseFloat(document.getElementById('loanCurrentBalance').value) || 0,
        rate: parseFloat(document.getElementById('loanRate').value) || 0,
        term: parseInt(document.getElementById('loanTerm').value) || 30,
        offset: parseFloat(document.getElementById('offsetBalance').value) || 0,
        startDate: document.getElementById('loanStartDate').value || toLocalISODate()
    };
    
    // The same loan balance on the Net Worth page (savings there read the offset)
    const loanLiability = appData.liabilities.find(l => l.name === 'Home Loan');
    if (loanLiability) {
        loanLiability.value = appData.loan.currentBalance;
    }

    updateUI();
}

// ================================================================
// RENDER PAYOFF SUMMARY
// ================================================================

function renderPayoffSummary() {
    const l = appData.loan || DEFAULT_DATA.loan;
    const balance = l.currentBalance || 0;
    const requiredRepayment = calculateMonthlyRepayment(l);
    const monthlySurplus = getMonthlyLoanSurplus();
    const totalMonthlyPayment = requiredRepayment + Math.max(0, monthlySurplus);

    const maxMonths = 600;
    const payoff = simulateLoanPayoff(l, totalMonthlyPayment, maxMonths);
    const monthsToPayoff = payoff.paidOff ? payoff.months : maxMonths;

    const yearsToPayoff = monthsToPayoff / 12;
    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + monthsToPayoff);

    document.getElementById('payoffSummary').innerHTML = `
        <div class="payoff-grid">
            <div class="payoff-item">
                <div class="label">Current Balance</div>
                <div class="value blue">$${balance.toFixed(0)}</div>
            </div>
            <div class="payoff-item">
                <div class="label">Extra Surplus</div>
                <div class="value ${monthlySurplus > 0 ? 'green' : 'red'}">$${monthlySurplus.toFixed(0)}</div>
            </div>
            <div class="payoff-item">
                <div class="label">Required Repayment</div>
                <div class="value amber">$${requiredRepayment.toFixed(0)}</div>
            </div>
            <div class="payoff-item">
                <div class="label">Payoff in</div>
                <div class="value ${yearsToPayoff < 20 ? 'green' : yearsToPayoff < 30 ? 'amber' : 'red'}">
                    ${monthsToPayoff < maxMonths ? `${yearsToPayoff.toFixed(1)} years` : '⚠️ Not feasible'}
                </div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px;">
            <div class="payoff-item" style="background:rgba(255,255,255,0.02);">
                <div class="label">Projected Payoff Date</div>
                <div class="value blue">${monthsToPayoff < maxMonths ? payoffDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) : '—'}</div>
            </div>
            <div class="payoff-item" style="background:rgba(255,255,255,0.02);">
                <div class="label">Total Monthly Payment</div>
                <div class="value ${totalMonthlyPayment > 0 ? 'green' : 'red'}">$${totalMonthlyPayment.toFixed(0)}</div>
            </div>
        </div>
    `;
}

// ================================================================
// RENDER LOAN LINE GRAPH
// ================================================================

function renderLoanLineGraph() {
    const container = document.getElementById('loanLineGraph');
    const l = appData.loan || DEFAULT_DATA.loan;
    
    const monthlySurplus = getMonthlyLoanSurplus();
    const requiredRepayment = calculateMonthlyRepayment(l);
    const totalMonthlyPayment = requiredRepayment + Math.max(0, monthlySurplus);

    const currentBalance = l.currentBalance || 0;
    const initialBalance = l.initial || currentBalance;

    const startDate = parseLocalDate(l.startDate || toLocalISODate());
    const startYear = startDate.getFullYear();

    const points = [];
    const maxYears = 30;
    
    points.push({ year: startYear, balance: initialBalance, marker: true });
    
    const now = new Date();
    const yearsFromStart = (now - startDate) / (365.25 * 24 * 60 * 60 * 1000);
    const currentYear = startYear + yearsFromStart;
    const monthCount = Math.max(0, Math.round(yearsFromStart * 12));

    const historySteps = 8;
    for (let i = 1; i < historySteps; i++) {
        const frac = i / historySteps;
        points.push({
            year: startYear + yearsFromStart * frac,
            balance: initialBalance + (currentBalance - initialBalance) * frac,
            marker: false
        });
    }

    points.push({ year: currentYear, balance: currentBalance, marker: false });
    
    const { balances } = simulateLoanPayoff(l, totalMonthlyPayment, Math.max(12, maxYears * 12 - monthCount));
    balances.forEach((b, i) => {
        if ((i + 1) % 12 === 0) points.push({ year: currentYear + (i + 1) / 12, balance: b, marker: true });
    });
    const futureMonth = balances.length;
    const remainingBalance = futureMonth > 0 ? balances[futureMonth - 1] : currentBalance;

    if (remainingBalance === 0 && points[points.length - 1].balance > 0) {
        const finalYear = currentYear + (futureMonth / 12);
        points.push({ year: finalYear, balance: 0, marker: true });
    }
    
    points.sort((a, b) => a.year - b.year);
    
    if (points.length < 2) {
        points.push({ year: startYear + 5, balance: currentBalance * 0.8, marker: true });
        points.push({ year: startYear + 10, balance: currentBalance * 0.5, marker: true });
        points.push({ year: startYear + 15, balance: currentBalance * 0.2, marker: true });
        points.push({ year: startYear + 20, balance: 0, marker: true });
    }
    
    const currentPoint = (isFinite(currentYear) && isFinite(currentBalance))
        ? { year: currentYear, balance: currentBalance }
        : points[points.length - 1];
    
    const maxBalance = Math.max(initialBalance, 1);
    const padding = 0.15;
    const roughMax = maxBalance * (1 + padding);

    function niceStep(roughStep) {
        const exponent = Math.floor(Math.log10(roughStep));
        const magnitude = Math.pow(10, exponent);
        const fraction = roughStep / magnitude;
        let niceFraction;
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
        return niceFraction * magnitude;
    }
    const ySteps = 5;
    const tickSpacing = niceStep(roughMax / ySteps);
    const yMax = Math.ceil(roughMax / tickSpacing) * tickSpacing;
    const numYTicks = Math.round(yMax / tickSpacing);
    
    const containerWidth = container.clientWidth || 900;
    const graphWidth = Math.max(containerWidth, 600);
    const graphHeight = 320;
    
    const margin = { top: 30, right: 30, bottom: 40, left: 70 };
    const innerWidth = graphWidth - margin.left - margin.right;
    const innerHeight = graphHeight - margin.top - margin.bottom;
    
    const minYear = Math.floor(points[0].year) - 1;
    const maxYear = Math.ceil(points[points.length - 1].year) + 1;
    
    function getX(year) {
        return margin.left + ((year - minYear) / (maxYear - minYear)) * innerWidth;
    }
    function getY(balance) {
        return margin.top + innerHeight - (balance / yMax) * innerHeight;
    }
    
    let pathData = points.map((p, i) => {
        const x = getX(p.year);
        const y = getY(p.balance);
        return (i === 0 ? 'M' : 'L') + x + ',' + y;
    }).join(' ');
    
    let areaPoints = points.map((p) => {
        return getX(p.year) + ',' + getY(p.balance);
    }).join(' ');
    const lastX = getX(points[points.length - 1].year);
    const firstX = getX(points[0].year);
    areaPoints += ' ' + lastX + ',' + getY(0) + ' ' + firstX + ',' + getY(0);
    
    let gridLines = '';
    for (let i = 0; i <= numYTicks; i++) {
        const yPos = margin.top + (i / numYTicks) * innerHeight;
        gridLines += `<line x1="${margin.left}" y1="${yPos}" x2="${margin.left + innerWidth}" y2="${yPos}" class="grid-line"/>`;
    }
    
    let xLabels = '';
    const yearStep = Math.max(1, Math.floor((maxYear - minYear) / 8));
    for (let y = Math.floor(minYear / yearStep) * yearStep; y <= maxYear; y += yearStep) {
        if (y >= minYear) {
            const x = getX(y);
            xLabels += `<text x="${x}" y="${margin.top + innerHeight + 22}" class="axis-label" font-size="11">${y}</text>`;
        }
    }
    
    let yLabels = '';
    for (let i = 0; i <= numYTicks; i++) {
        const val = tickSpacing * (numYTicks - i);
        const yPos = margin.top + (i / numYTicks) * innerHeight;
        yLabels += `<text x="${margin.left - 12}" y="${yPos + 4}" class="axis-label-left" font-size="11">$${Math.round(val / 1000)}k</text>`;
    }
    
    const currentX = getX(currentPoint.year);
    const currentY = getY(currentPoint.balance);
    
    let dataPoints = points.filter(p => p.marker).map((p) => {
        const x = getX(p.year);
        const y = getY(p.balance);
        const isZero = p.balance === 0;
        const roundedBalance = Math.round(p.balance / 5000) * 5000;
        const label = isZero ? '✓ Paid off!' : '$' + (roundedBalance / 1000).toFixed(0) + 'k';
        return `<circle cx="${x}" cy="${y}" r="${isZero ? 5 : 3.5}" fill="${isZero ? 'var(--green)' : 'var(--blue)'}" />
                <text x="${x}" y="${y - 10}" class="data-label" font-size="10" fill="var(--text-secondary)" text-anchor="middle">${label}</text>`;
    }).join(' ');
    
    const willPayOff = points.some(p => p.balance === 0);
    const payoffYear = willPayOff ? points.find(p => p.balance === 0)?.year : null;
    
    container.innerHTML = `
        <div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary);">
            ${willPayOff ? 
                `<span style="color:var(--green);font-weight:600;">✓ Loan will be paid off in ${(payoffYear - currentYear).toFixed(1)} years (${payoffYear.toFixed(0)})</span>` : 
                `<span style="color:var(--red);font-weight:600;">⚠️ Not enough surplus to pay off loan within 30 years</span>`
            }
        </div>
        <div class="line-graph" style="width:100%;">
            <svg width="${graphWidth}" height="${graphHeight}" style="display:block;width:100%;height:${graphHeight}px;overflow:visible;">
                ${gridLines}
                <polygon points="${areaPoints}" fill="rgba(16,185,129,0.04)" stroke="none"/>
                <path d="${pathData}" fill="none" stroke="${willPayOff ? 'var(--green)' : 'var(--blue)'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                ${dataPoints}
                
                <circle cx="${currentX}" cy="${currentY}" r="7" fill="var(--red)" stroke="white" stroke-width="2"/>
                <text x="${currentX}" y="${currentY - 12}" class="current-label" font-size="10" fill="var(--red)" text-anchor="middle" font-weight="700">● Now</text>
                
                <text x="${margin.left + innerWidth/2}" y="${margin.top + innerHeight + 38}" class="axis-label" font-size="12" fill="var(--text-secondary)" text-anchor="middle" font-weight="600">Year</text>
                <text x="16" y="${margin.top + innerHeight/2}" fill="var(--text-secondary)" font-size="11" text-anchor="middle" font-weight="600" transform="rotate(-90, 16, ${margin.top + innerHeight/2})">Balance</text>
                ${xLabels}
                ${yLabels}
            </svg>
        </div>
    `;
}