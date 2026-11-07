// ================================================================
// TAX - Tax calculations, bracket editor
// ================================================================

// ================================================================
// TAX SUMMARY
// ================================================================

function renderTaxSummary() {
    const container = document.getElementById('taxSummary');
    const projectedIncome = getFYIncomeProjection().annual;
    const deductibleTotal = getFYDeductibleTotal();
    const taxableIncome = Math.max(0, projectedIncome - deductibleTotal);
    const taxResult = calculateTax(taxableIncome);
    const effectiveRate = projectedIncome > 0 ? (taxResult.total / projectedIncome * 100) : 0;
    const afterTax = projectedIncome - taxResult.total;

    container.innerHTML = `
        <div class="tax-item">
            <div class="label">Gross Income</div>
            <div class="value">$${projectedIncome.toFixed(0)}</div>
        </div>
        <div class="tax-item">
            <div class="label">Deductible Expenses</div>
            <div class="value" style="color:var(--green);">$${deductibleTotal.toFixed(0)}</div>
        </div>
        <div class="tax-item">
            <div class="label">Taxable Income</div>
            <div class="value">$${taxableIncome.toFixed(0)}</div>
        </div>
        <div class="tax-item">
            <div class="label">Estimated Tax + Medicare</div>
            <div class="value" style="color:var(--red);">$${taxResult.total.toFixed(0)}</div>
        </div>
        <div class="tax-item">
            <div class="label">Effective Tax Rate</div>
            <div class="value" style="color:var(--amber);">${effectiveRate.toFixed(1)}%</div>
        </div>
        <div class="tax-item">
            <div class="label">After-Tax Income</div>
            <div class="value" style="color:var(--green);">$${afterTax.toFixed(0)}</div>
        </div>
        <div class="tax-item">
            <div class="label">Tax Per Week</div>
            <div class="value" style="color:var(--purple);">$${(taxResult.total / 52).toFixed(0)}</div>
        </div>
        <div class="tax-item">
            <div class="label">Take-Home Per Week</div>
            <div class="value" style="color:var(--blue);">$${(afterTax / 52).toFixed(0)}</div>
        </div>
    `;
}

// ================================================================
// TAX BRACKET EDITOR
// ================================================================

function renderTaxBracketEditor() {
    const container = document.getElementById('taxBracketEditor');
    const brackets = getTaxBrackets();
    
    const rateClasses = ['rate-0', 'rate-1', 'rate-2', 'rate-3', 'rate-4'];
    
    container.innerHTML = `
        ${brackets.map((b, idx) => {
            const isLast = idx === brackets.length - 1;
            return `
                <div class="tax-bracket-row">
                    <span style="color:var(--text-muted);font-size:11px;min-width:30px;">From</span>
                    <input class="bracket-input" type="number" step="100" value="${b.min}" 
                           onchange="updateTaxBracketMin(${idx}, this.value)" style="width:80px;min-width:70px;">
                    <span class="bracket-arrow">→</span>
                    ${isLast ? 
                        `<span style="display:inline-flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:13px;width:80px;min-width:70px;">∞</span>` :
                        `<input class="bracket-input" type="number" step="100" value="${b.max}" 
                                onchange="updateTaxBracketMax(${idx}, this.value)" style="width:80px;min-width:70px;">
                        `
                    }
                    <span style="color:var(--text-muted);font-size:11px;margin-left:4px;">Rate:</span>
                    <input class="bracket-input rate-input ${rateClasses[idx % rateClasses.length]}" 
                           type="number" step="0.1" value="${(b.rate * 100).toFixed(1)}" 
                           onchange="updateTaxBracketRate(${idx}, this.value)">
                    <span style="color:var(--text-secondary);font-size:12px;">%</span>
                    <span class="bracket-desc">${escapeHtml(b.description || '')}</span>
                </div>
            `;
        }).join('')}
        <div style="margin-top:12px;font-size:11px;color:var(--text-muted);">
            💡 Medicare (2%, none below ~$27k, phased in above that) and the low income tax offset are applied separately. The last bracket extends to infinity.
        </div>
    `;
}

function updateTaxBracketMin(index, value) {
    const newMin = parseFloat(value);
    if (isNaN(newMin) || newMin < 0) return;
    appData.taxBrackets[index].min = newMin;
    updateUI();
}

function updateTaxBracketMax(index, value) {
    const newMax = parseFloat(value);
    if (isNaN(newMax) || newMax < 0) return;
    appData.taxBrackets[index].max = newMax;
    updateUI();
}

function updateTaxBracketRate(index, value) {
    const rate = parseFloat(value) / 100;
    if (isNaN(rate) || rate < 0) return;
    appData.taxBrackets[index].rate = rate;
    updateUI();
}

// ================================================================
// DEDUCTIBLE EXPENSES
// ================================================================

function renderDeductibleList() {
    const container = document.getElementById('deductibleList');
    const deductibles = (appData.expenses || []).filter(e => e.deductible && isInFY(e.date));
    
    if (deductibles.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">💰</div><div class="message">No deductible expenses recorded</div></div>`;
        return;
    }
    
    const total = deductibles.reduce((s, e) => s + (e.amount || 0), 0);
    
    container.innerHTML = `
        <div style="margin-bottom:12px;padding:10px 14px;background:rgba(16,185,129,0.06);border-radius:8px;border:1px solid rgba(16,185,129,0.1);display:flex;justify-content:space-between;">
            <span style="font-weight:600;color:var(--green);">Total Deductible Expenses</span>
            <span style="font-weight:700;color:var(--green);font-size:18px;">$${total.toFixed(2)}</span>
        </div>
        ${deductibles.map(e => `
            <div class="list-item">
                <div class="left">
                    <span class="meta">${escapeHtml(e.date || '')}</span>
                    <span class="tag">${escapeHtml(e.category || 'Other')}</span>
                    <span class="label">${escapeHtml(e.description || e.category || 'Expense')}</span>
                </div>
                <div class="right">
                    <span class="amount green">$${(e.amount || 0).toFixed(2)}</span>
                </div>
            </div>
        `).join('')}
    `;
}

// ================================================================
// TAX PROJECTION
// ================================================================

function renderTaxProjection() {
    const container = document.getElementById('taxProjection');
    const projectedIncome = getFYIncomeProjection().annual;
    const deductibleTotal = getFYDeductibleTotal();
    const taxableIncome = Math.max(0, projectedIncome - deductibleTotal);
    
    const taxResult = calculateTax(taxableIncome);
    const afterTax = projectedIncome - taxResult.total;
    const weeklyTakeHome = afterTax / 52;
    const monthlyTakeHome = weeklyTakeHome * 4.33;
    
    let breakdownHtml = taxResult.breakdown.map(({ bracket, taxable, amount }) => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-color);font-size:13px;">
                    <span style="color:var(--text-secondary);">${escapeHtml(bracket.description || '')}</span>
                    <span>$${taxable.toFixed(0)} @ ${(bracket.rate * 100).toFixed(1)}% = <strong>$${amount.toFixed(0)}</strong></span>
                </div>
            `).join('');
    if (taxResult.lito > 0) {
        breakdownHtml += `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-color);font-size:13px;">
                    <span style="color:var(--text-secondary);">Low income tax offset</span>
                    <span style="color:var(--green);">-$${taxResult.lito.toFixed(0)}</span>
                </div>
            `;
    }

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">Weekly Take-Home</div>
                <div style="font-size:22px;font-weight:600;color:var(--green);">$${weeklyTakeHome.toFixed(0)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);">Monthly Take-Home</div>
                <div style="font-size:22px;font-weight:600;color:var(--green);">$${monthlyTakeHome.toFixed(0)}</div>
            </div>
        </div>
        <div style="background:rgba(255,255,255,0.02);padding:16px;border-radius:8px;border:1px solid var(--border-color);">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Tax Breakdown</div>
            ${breakdownHtml}
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:600;border-top:2px solid var(--border-color);margin-top:4px;">
                <span>Medicare levy</span>
                <span>$${taxResult.medicare.toFixed(0)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;border-top:2px solid var(--border-color);margin-top:4px;font-size:15px;">
                <span style="color:var(--red);">Total Tax</span>
                <span style="color:var(--red);">$${taxResult.total.toFixed(0)}</span>
            </div>
        </div>
    `;
}