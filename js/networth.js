// ================================================================
// NET WORTH - Assets, liabilities
// ================================================================

// ================================================================
// ASSETS
// ================================================================

function renderAssets() {
    const list = document.getElementById('assetList');
    const total = getTotalAssets();
    const portfolio = getInvestmentsValueAud();
    // Read-only row for savings: the offset balance set on the Home tab
    const savingsRow = `
                <div class="list-item" style="border-left: 2px solid var(--emerald);">
                    <div class="left">
                        <span class="label">Savings (offset)</span>
                        <span class="meta" style="color:var(--emerald-light);">(managed in Home tab)</span>
                    </div>
                    <div class="right"><span class="amount green">$${(appData.loan?.offset || 0).toFixed(0)}</span></div>
                </div>`;
    // Read-only row for the share portfolio, kept up to date on the Investments tab
    const portfolioRow = (getInvestments().holdings || []).length === 0 ? '' : `
                <div class="list-item">
                    <div class="left">
                        <span class="label">Share portfolio</span>
                        <span class="meta" style="color:var(--emerald-light);">(managed in Investments tab)</span>
                    </div>
                    <div class="right"><span class="amount green">$${portfolio.toFixed(0)}</span></div>
                </div>`;
    
    {
        list.innerHTML = savingsRow + (appData.assets || []).map((a, idx) => {
            const lastUpdated = a.lastUpdated ? new Date(a.lastUpdated).toLocaleDateString() : 'Never';
            return `
                <div class="list-item">
                    <div class="left">
                        <span class="label">${escapeHtml(a.name || 'Asset')}</span>
                        <span class="meta">Last updated: ${lastUpdated}</span>
                    </div>
                    <div class="right">
                        <span class="currency-input-wrap">
                            <span class="currency-prefix">$</span>
                            <input class="inline-edit amount-input green" type="number" step="0.01" value="${a.value || 0}" 
                                   onchange="updateAsset(${idx}, 'value', this.value)" style="width:110px;">
                        </span>
                        <button class="delete-btn" onclick="deleteAsset(${idx})">✕</button>
                    </div>
                </div>
            `;
        }).join('') + portfolioRow;
    }
    document.getElementById('totalAssets').textContent = `Total Assets: $${total.toFixed(0)}`;
}

function addAsset() {
    const name = document.getElementById('assetName').value.trim();
    const value = parseFloat(document.getElementById('assetValue').value);
    if (!name || !value) return alert('Fill all fields');
    if (isSavingsAssetName(name)) return alert('Savings are the offset on the Home tab');
    appData.assets.push({ name, value, lastUpdated: new Date().toISOString() });
    document.getElementById('assetName').value = 'House';
    document.getElementById('assetValue').value = '';
    updateUI();
}

function deleteAsset(idx) { appData.assets.splice(idx, 1); updateUI(); }

function updateAsset(idx, field, value) {
    appData.assets[idx][field] = parseFloat(value) || 0;
    appData.assets[idx].lastUpdated = new Date().toISOString();
    updateUI();
}

// ================================================================
// LIABILITIES
// ================================================================

// Keeps the Home tab and Net Worth showing the same loan balance: the
// first "Home Loan" liability is the loan balance (added if missing).
// Savings / offset needs no syncing: Net Worth reads the Home tab figure.
// updateUI runs this before the stats, so the top bar's net worth is
// right straight after a file is opened.
function syncLoanLiability() {
    appData.liabilities = appData.liabilities || [];
    if (!appData.loan) return;
    const loanLiability = appData.liabilities.find(l => l.name === 'Home Loan');
    if (loanLiability) {
        loanLiability.value = appData.loan.currentBalance;
    } else {
        appData.liabilities.unshift({ name: 'Home Loan', value: appData.loan.currentBalance || 0 });
    }
}

function renderLiabilities() {
    const list = document.getElementById('liabilityList');
    
    syncLoanLiability();
    
    if (appData.liabilities.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">📉</div><div class="message">No liabilities</div></div>`;
        return;
    }
    
    const total = appData.liabilities.reduce((s, l) => s + (l.value || 0), 0);
    
    const managedIdx = appData.liabilities.findIndex(l => l.name === 'Home Loan');
    list.innerHTML = appData.liabilities.map((l, idx) => {
        if (idx === managedIdx) {
            return `
                <div class="list-item" style="border-left: 2px solid var(--emerald);">
                    <div class="left">
                        <span class="label">${escapeHtml(l.name)}</span>
                        <span class="meta" style="color:var(--emerald-light);">(same as the Home tab)</span>
                    </div>
                    <div class="right">
                        <input class="inline-edit amount-input red" type="number" step="0.01" value="${l.value || 0}"
                               onchange="updateLiability(${idx}, 'value', this.value)" style="width:120px;">
                    </div>
                </div>
            `;
        }
        const duplicateOfLoan = /^home loan$/i.test((l.name || '').trim());
        return `
            <div class="list-item">
                <div class="left">
                    <span class="label">${escapeHtml(l.name || 'Liability')}</span>
                    ${duplicateOfLoan ? '<span class="meta" style="color:var(--amber);">⚠ second "Home Loan" entry - it is counted on top of your loan. Delete it, or re-add it under its real name.</span>' : ''}
                </div>
                <div class="right">
                    <input class="inline-edit amount-input red" type="number" step="0.01" value="${l.value || 0}" 
                           onchange="updateLiability(${idx}, 'value', this.value)" style="width:120px;">
                    <button class="delete-btn" onclick="deleteLiability(${idx})">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('totalLiabilities').textContent = `Total Liabilities: $${total.toFixed(0)}`;
}

function updateLiability(idx, field, value) {
    const newValue = parseFloat(value) || 0;
    // Only the first "Home Loan" entry is linked to the Home tab
    if (idx === appData.liabilities.findIndex(l => l.name === 'Home Loan')) {
        appData.loan.currentBalance = newValue;
        appData.liabilities[idx].value = newValue;
        updateUI();
        return;
    }
    appData.liabilities[idx][field] = newValue;
    updateUI();
}

function deleteLiability(idx) { 
    appData.liabilities.splice(idx, 1); 
    updateUI(); 
}

function addLiability() {
    const name = document.getElementById('liabilityName').value.trim();
    const value = parseFloat(document.getElementById('liabilityValue').value);
    if (!name || !value) return alert('Fill all fields');
    if (/^home loan$/i.test(name)) return alert('Your home loan is already included from the Home tab. Give this liability its own name, e.g. "Car loan".');
    appData.liabilities.push({ name, value });
    document.getElementById('liabilityName').value = '';
    document.getElementById('liabilityValue').value = '';
    updateUI();
}

// ================================================================
// NET WORTH SUMMARY
// ================================================================

function renderNetWorthSummary() {
    const totalAssets = getTotalAssets();
    const totalLiabilities = (appData.liabilities || []).reduce((s, l) => s + (l.value || 0), 0);
    const netWorth = totalAssets - totalLiabilities;

    document.getElementById('netWorthSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
            <div style="background:rgba(16,185,129,0.06);padding:16px;border-radius:8px;border:1px solid rgba(16,185,129,0.1);">
                <div style="font-size:12px;color:var(--text-muted);">Total Assets</div>
                <div style="font-size:22px;font-weight:600;color:var(--green);">$${totalAssets.toFixed(0)}</div>
            </div>
            <div style="background:rgba(239,68,68,0.06);padding:16px;border-radius:8px;border:1px solid rgba(239,68,68,0.1);">
                <div style="font-size:12px;color:var(--text-muted);">Total Liabilities</div>
                <div style="font-size:22px;font-weight:600;color:var(--red);">$${totalLiabilities.toFixed(0)}</div>
            </div>
            <div style="background:rgba(139,92,246,0.06);padding:16px;border-radius:8px;border:1px solid rgba(139,92,246,0.1);">
                <div style="font-size:12px;color:var(--text-muted);">Net Worth</div>
                <div style="font-size:22px;font-weight:600;color:var(--purple);">$${netWorth.toFixed(0)}</div>
            </div>
        </div>
    `;
}