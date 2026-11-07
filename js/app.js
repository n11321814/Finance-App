// ================================================================
// APP STATE - Global variable accessible to all modules
// ================================================================

let appData = normalizeAppData(DEFAULT_DATA);

// ================================================================
// APP INIT
// ================================================================

function initApp() {
    // Hide figures is remembered on this device only
    setPrivacy(getPrivacyPreference());

    syncFinancialYear();
    markCleanAfterRender = true;
    updateUI();

    // Sign in with Google, then load your data (see file.js)
    initCloud();

    // Pick up saves made on another device when you come back to the tab,
    // and every minute while it's open
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForRemoteChanges(); });
    setInterval(() => { if (!document.hidden) checkForRemoteChanges(); }, 60000);

    // The monthly expenses chart is drawn to fit its card, so redraw on resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderMonthlyExpensesChart, 150);
    });

    // Unsaved-changes warning and autosave checks (see file.js)
    window.addEventListener('beforeunload', warnBeforeLeaving);
    setInterval(refreshUnsavedState, 2000);

    // Set default form dates
    const today = toLocalISODate();
    ['weekStart', 'expenseDate', 'eventDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('tab-' + this.dataset.tab).classList.add('active');
            
            const tabName = this.dataset.tab;
            if (tabName === 'dashboard') {
                setTimeout(() => {
                    renderMonthlyExpensesChart();
                    renderCashFlowProjection();
                }, 50);
            }
            if (tabName === 'tax') {
                setTimeout(() => {
                    renderTaxSummary();
                    renderTaxBracketEditor();
                    renderDeductibleList();
                    renderTaxProjection();
                    renderEoySummary();
                }, 50);
            }
            if (tabName === 'expenses') {
                setTimeout(() => {
                    populateCategorySelect();
                    renderCategoryList();
                    renderExpenses();
                    renderExpenseBreakdown();
                }, 50);
            }
            if (tabName === 'home') {
                setTimeout(() => {
                    renderPayoffSummary();
                    renderLoanLineGraph();
                }, 50);
            }
            if (tabName === 'calendar') {
                setTimeout(renderCalendar, 50);
            }
            if (tabName === 'lists') {
                setTimeout(renderLists, 50);
            }
            if (tabName === 'planning') {
                setTimeout(renderPlanning, 50);
            }
            if (tabName === 'rates') {
                setTimeout(renderRateTracker, 50);
            }
            if (tabName === 'investments') {
                setTimeout(() => {
                    renderInvestments();
                    maybeAutoRefreshInvestments();
                }, 50);
            }
            if (tabName === 'income') {
                setTimeout(() => {
                    renderIncome();
                    renderIncomeSummary();
                }, 50);
            }
        });
    });

    // Ctrl+S to save
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveData();
        }
    });

    // Fetch external data
    setTimeout(() => {
        fetchWeather();
        fetchNews();
    }, 500);

    console.log('💰 Finance Tracker loaded');
    console.log('📊 Income entries:', (appData.income || []).length);
    console.log('💳 Expense entries:', (appData.expenses || []).length);
}

// ================================================================
// HIDE FIGURES - blurs income, net worth, loan and investment amounts
// so the app can be shown to others. The blurring is done in CSS
// (body.privacy), so it holds through every re-render. Remembered on
// this computer only, not in the data file.
// ================================================================

const PRIVACY_KEY = 'financeTrackerHideFigures';

function getPrivacyPreference() {
    try { return localStorage.getItem(PRIVACY_KEY) === '1'; } catch (e) { return false; }
}

function setPrivacy(on) {
    document.body.classList.toggle('privacy', on);
    const btn = document.getElementById('privacyBtn');
    if (btn) {
        btn.textContent = on ? 'Show figures' : 'Hide figures';
        btn.classList.toggle('btn-primary', on);
        btn.classList.toggle('btn-outline', !on);
    }
    try { localStorage.setItem(PRIVACY_KEY, on ? '1' : '0'); } catch (e) {}
}

function togglePrivacy() {
    setPrivacy(!document.body.classList.contains('privacy'));
}

// ================================================================
// START THE APP
// ================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}