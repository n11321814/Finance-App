// ================================================================
// UI UPDATE - Orchestrates all rendering
// ================================================================

function updateUI() {
    try { syncFinancialYear(); } catch(e) { console.warn('syncFinancialYear failed:', e); }
    try { autoAddWeeks(); } catch(e) { console.warn('autoAddWeeks failed:', e); }
    try { syncLoanLiability(); } catch(e) { console.warn('syncLoanLiability failed:', e); }
    try { renderRates(); } catch(e) { console.warn('renderRates failed:', e); }
    try { updateStats(); } catch(e) { console.warn('updateStats failed:', e); }
    try { renderIncome(); } catch(e) { console.warn('renderIncome failed:', e); }
    try { renderIncomeSummary(); } catch(e) { console.warn('renderIncomeSummary failed:', e); }
    try { renderExpenses(); } catch(e) { console.warn('renderExpenses failed:', e); }
    try { renderCategoryList(); } catch(e) { console.warn('renderCategoryList failed:', e); }
    try { populateCategorySelect(); } catch(e) { console.warn('populateCategorySelect failed:', e); }
    try { renderBudgetInput(); } catch(e) { console.warn('renderBudgetInput failed:', e); }
    try { renderMonthlyBudgetHistory(); } catch(e) { console.warn('renderMonthlyBudgetHistory failed:', e); }
    try { renderExpenseSummary(); } catch(e) { console.warn('renderExpenseSummary failed:', e); }
    try { renderActualSnapshot(); } catch(e) { console.warn('renderActualSnapshot failed:', e); }
    try { renderCategoryMonthlyAverage(); } catch(e) { console.warn('renderCategoryMonthlyAverage failed:', e); }
    try { renderLoan(); } catch(e) { console.warn('renderLoan failed:', e); }
    try { renderRenovation(); } catch(e) { console.warn('renderRenovation failed:', e); }
    try { renderAssets(); } catch(e) { console.warn('renderAssets failed:', e); }
    try { renderLiabilities(); } catch(e) { console.warn('renderLiabilities failed:', e); }
    try { renderNetWorthSummary(); } catch(e) { console.warn('renderNetWorthSummary failed:', e); }
    try { renderPayoffSummary(); } catch(e) { console.warn('renderPayoffSummary failed:', e); }
    try { renderLoanLineGraph(); } catch(e) { console.warn('renderLoanLineGraph failed:', e); }
    try { renderExpenseBreakdown(); } catch(e) { console.warn('renderExpenseBreakdown failed:', e); }
    try { renderMonthlyExpensesChart(); } catch(e) { console.warn('renderMonthlyExpensesChart failed:', e); }
    try { renderCashFlowProjection(); } catch(e) { console.warn('renderCashFlowProjection failed:', e); }
    try { renderTaxSummary(); } catch(e) { console.warn('renderTaxSummary failed:', e); }
    try { renderTaxBracketEditor(); } catch(e) { console.warn('renderTaxBracketEditor failed:', e); }
    try { renderDeductibleList(); } catch(e) { console.warn('renderDeductibleList failed:', e); }
    try { renderTaxProjection(); } catch(e) { console.warn('renderTaxProjection failed:', e); }
    try { renderCalendar(); } catch(e) { console.warn('renderCalendar failed:', e); }
    try { renderEventList(); } catch(e) { console.warn('renderEventList failed:', e); }
    try { renderLists(); } catch(e) { console.warn('renderLists failed:', e); }
    try { renderShopping(); } catch(e) { console.warn('renderShopping failed:', e); }
    try { renderRateTracker(); } catch(e) { console.warn('renderRateTracker failed:', e); }
    try { renderInvestments(); } catch(e) { console.warn('renderInvestments failed:', e); }
    try { renderPlanning(); } catch(e) { console.warn('renderPlanning failed:', e); }
    try { renderEoySummary(); } catch(e) { console.warn('renderEoySummary failed:', e); }
    try { refreshUnsavedState(); } catch(e) { console.warn('refreshUnsavedState failed:', e); }
}