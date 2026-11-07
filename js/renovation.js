// ================================================================
// RENOVATION - Renovation costs
// ================================================================

function renderRenovation() {
    const list = document.getElementById('renovationList');
    const total = (appData.renovation || []).reduce((s, r) => s + (r.cost || 0), 0);
    
    if (!appData.renovation || appData.renovation.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">🔨</div><div class="message">No renovation costs</div></div>`;
        return;
    }
    
    list.innerHTML = `
        ${appData.renovation.map((r, idx) => `
            <div class="list-item">
                <div class="left"><span class="label">${escapeHtml(r.item || 'Item')}</span></div>
                <div class="right">
                    <span class="amount amber">$${(r.cost || 0).toFixed(2)}</span>
                    <button class="delete-btn" onclick="deleteRenovation(${idx})">✕</button>
                </div>
            </div>
        `).join('')}
        <div style="padding:10px 14px;background:rgba(255,255,255,0.02);border-radius:8px;margin-top:8px;display:flex;justify-content:space-between;">
            <span style="font-weight:500;color:var(--text-secondary);">Total Renovation</span>
            <span style="font-weight:600;color:var(--amber);">$${total.toFixed(2)}</span>
        </div>
    `;
}

function addRenovation() {
    const item = document.getElementById('renoItem').value.trim();
    const cost = parseFloat(document.getElementById('renoCost').value);
    if (!item || !cost) return alert('Fill all fields');
    appData.renovation.push({ item, cost });
    document.getElementById('renoItem').value = '';
    document.getElementById('renoCost').value = '';
    updateUI();
}

function deleteRenovation(idx) { appData.renovation.splice(idx, 1); updateUI(); }