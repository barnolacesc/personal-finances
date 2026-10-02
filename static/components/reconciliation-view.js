import { BaseComponent } from './event-manager.js';
import { CONFIG, CurrencyHelper, DateHelper, Utils } from './config.js';
import { ApiService } from './api-service.js';

class ReconciliationView extends BaseComponent {
    constructor() {
        super();
        this.summary = null;
        this.allocations = [];
        this.loading = true;
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedYear = new Date().getFullYear();
        this.editingAllocationId = null;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadData();
    }

    setupEventListeners() {
        this.addEventListenerWithCleanup(this, 'click', (e) => {
            const confirmSuggestBtn = e.target.closest('.confirm-suggestion-btn');
            if (confirmSuggestBtn) {
                this.handleConfirmSuggestion(confirmSuggestBtn);
                return;
            }

            const deleteAllocBtn = e.target.closest('.delete-allocation-btn');
            if (deleteAllocBtn) {
                const allocId = deleteAllocBtn.dataset.allocationId;
                this.handleDeleteAllocation(allocId);
                return;
            }

            const editAllocBtn = e.target.closest('.edit-allocation-btn');
            if (editAllocBtn) {
                const allocId = editAllocBtn.dataset.allocationId;
                this.handleEditAllocation(allocId);
                return;
            }

            const saveAllocBtn = e.target.closest('.save-allocation-edit-btn');
            if (saveAllocBtn) {
                const allocId = saveAllocBtn.dataset.allocationId;
                this.handleSaveAllocationEdit(allocId);
                return;
            }

            const cancelAllocBtn = e.target.closest('.cancel-allocation-edit-btn');
            if (cancelAllocBtn) {
                this.editingAllocationId = null;
                this.renderAllocationsList();
                return;
            }
        });

    }

    setupFormListeners() {
        const manualForm = this.querySelector('#manualAllocateForm');
        if (manualForm) {
            manualForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleManualAllocate();
            });
        }

        const reimbSelect = this.querySelector('#selectReimbursement');
        const expenseSelect = this.querySelector('#selectExpense');
        if (reimbSelect && expenseSelect) {
            const updateSuggestedAmount = () => {
                const rOpt = reimbSelect.selectedOptions[0];
                const eOpt = expenseSelect.selectedOptions[0];
                const amountInput = this.querySelector('#allocateAmount');
                if (rOpt && eOpt && rOpt.value && eOpt.value && amountInput) {
                    const rUnalloc = parseFloat(rOpt.dataset.unallocated || '0');
                    const eRem = parseFloat(eOpt.dataset.remaining || '0');
                    const suggested = Math.min(rUnalloc, eRem);
                    if (suggested > 0 && !amountInput.value) {
                        amountInput.value = suggested.toFixed(2);
                    }
                }
            };
            reimbSelect.addEventListener('change', updateSuggestedAmount);
            expenseSelect.addEventListener('change', updateSuggestedAmount);
        }
    }

    async loadData() {
        this.loading = true;
        this.renderLoadingState();
        try {
            const [summaryData, allocsData] = await Promise.all([
                ApiService.getReconciliationSummary(this.selectedMonth, this.selectedYear),
                ApiService.getAllocations({ month: this.selectedMonth, year: this.selectedYear })
            ]);

            this.summary = summaryData;
            this.allocations = allocsData.allocations || [];
            this.loading = false;
            this.render();
            this.setupFormListeners();
        } catch (error) {
            console.error('Error loading reconciliation data:', error);
            if (window.showToast) window.showToast('Failed to load reconciliation data', 'error');
            this.loading = false;
            this.renderErrorState();
        }
    }

    renderLoadingState() {
        const content = this.querySelector('#reconContent');
        if (content) {
            content.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-2">Loading reconciliation status...</p>
                </div>
            `;
        }
    }

    renderErrorState() {
        const content = this.querySelector('#reconContent');
        if (content) {
            content.innerHTML = `
                <div class="alert alert-danger my-4" role="alert">
                    <span class="material-symbols-outlined align-middle me-2">error</span>
                    Error loading reconciliation data. Please refresh.
                </div>
            `;
        }
    }

    render() {
        const summary = this.summary || {
            unmatched_reimbursements: [],
            partially_reimbursed_expenses: [],
            unreimbursed_expenses: [],
            suggestions: [],
            total_unallocated_reimbursements: 0,
            total_partially_reimbursed_remaining: 0
        };

        const totalReconciled = this.allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

        this.innerHTML = `
            <style>
                .recon-header {
                    margin-bottom: 1.5rem;
                }
                .recon-title {
                    font-family: 'Manrope', sans-serif;
                    font-size: 1.5rem;
                    font-weight: 800;
                    color: var(--on-surface);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .recon-subtitle {
                    color: var(--outline);
                    font-size: 0.875rem;
                }
                .stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .recon-stat-card {
                    background: var(--surface-container);
                    border: 1px solid rgba(86, 67, 52, 0.12);
                    border-radius: 1rem;
                    padding: 1.125rem;
                }
                .stat-label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--outline);
                    margin-bottom: 0.25rem;
                }
                .stat-value {
                    font-family: 'Manrope', sans-serif;
                    font-size: 1.5rem;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                }
                .stat-sub {
                    font-size: 0.75rem;
                    color: var(--outline);
                    margin-top: 0.25rem;
                }
                .section-card {
                    background: var(--surface-container);
                    border: 1px solid rgba(86, 67, 52, 0.1);
                    border-radius: 1rem;
                    padding: 1.25rem;
                    margin-bottom: 1.5rem;
                }
                .section-title {
                    font-family: 'Manrope', sans-serif;
                    font-size: 1.125rem;
                    font-weight: 700;
                    color: var(--on-surface);
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .suggestion-card {
                    background: var(--surface-container-high);
                    border: 1px solid rgba(86, 67, 52, 0.12);
                    border-radius: 0.75rem;
                    padding: 1rem;
                    margin-bottom: 0.75rem;
                    transition: border-color 0.15s ease;
                }
                .suggestion-card:hover {
                    border-color: var(--primary);
                }
                .reason-badge {
                    font-size: 0.6875rem;
                    font-weight: 600;
                    padding: 0.2rem 0.5rem;
                    border-radius: 9999px;
                    background: rgba(255, 140, 0, 0.15);
                    color: var(--primary);
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .confidence-high {
                    background: rgba(16, 185, 129, 0.15);
                    color: #10b981;
                }
                .confidence-medium {
                    background: rgba(59, 130, 246, 0.15);
                    color: #3b82f6;
                }
                .alloc-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .alloc-table th {
                    font-size: 0.6875rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--outline);
                    border-bottom: 1px solid rgba(86, 67, 52, 0.1);
                    padding: 0.5rem 0.75rem;
                    text-align: left;
                }
                .alloc-table td {
                    padding: 0.75rem;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.06);
                    font-size: 0.8125rem;
                    vertical-align: middle;
                }
                .progress-bar-container {
                    height: 8px;
                    border-radius: 4px;
                    background: var(--surface-container-highest);
                    overflow: hidden;
                    display: flex;
                    margin-top: 0.35rem;
                }
                .progress-reimbursed {
                    background: #10b981;
                    height: 100%;
                }
                .progress-remaining {
                    background: var(--primary);
                    height: 100%;
                }
            </style>

            <div class="recon-header">
                <div class="recon-title">
                    <span class="material-symbols-outlined" style="color: var(--primary);">link</span>
                    <span>Reconciliation & Reimbursements</span>
                </div>
                <div class="recon-subtitle">
                    Link reimbursements to purchases, handle split shares, and track your true net spending.
                </div>
            </div>

            <!-- Top KPI Stats -->
            <div class="stat-grid">
                <div class="recon-stat-card">
                    <div class="stat-label">Pending Reimbursements</div>
                    <div class="stat-value" style="color: #10b981;">
                        ${CurrencyHelper.format(summary.total_unallocated_reimbursements || 0)}
                    </div>
                    <div class="stat-sub">
                        ${summary.unmatched_reimbursements.length} unmatched / partially allocated
                    </div>
                </div>

                <div class="recon-stat-card">
                    <div class="stat-label">Pending Expense Shares</div>
                    <div class="stat-value" style="color: var(--primary);">
                        ${CurrencyHelper.format(summary.total_partially_reimbursed_remaining || 0)}
                    </div>
                    <div class="stat-sub">
                        ${summary.partially_reimbursed_expenses.length} partially reimbursed expenses
                    </div>
                </div>

                <div class="recon-stat-card">
                    <div class="stat-label">Reconciled Links</div>
                    <div class="stat-value" style="color: var(--on-surface);">
                        ${CurrencyHelper.format(totalReconciled)}
                    </div>
                    <div class="stat-sub">
                        ${this.allocations.length} active allocation(s)
                    </div>
                </div>
            </div>

            <div id="reconContent">
                <!-- Smart Suggestions Section -->
                ${this.renderSuggestionsSection(summary.suggestions)}

                <!-- Manual Allocation Form Section -->
                <div class="section-card">
                    <div class="section-title">
                        <span class="material-symbols-outlined" style="font-size: 1.25rem; color: var(--primary);">add_link</span>
                        <span>Link Reimbursement to Expense</span>
                    </div>

                    <form id="manualAllocateForm">
                        <div class="row g-3 mb-3">
                            <div class="col-md-6">
                                <label class="form-label" style="font-size: 0.75rem; font-weight: 700; color: var(--outline); text-transform: uppercase;">
                                    1. Reimbursement Source *
                                </label>
                                <select class="form-select" id="selectReimbursement" required>
                                    <option value="">Select reimbursement...</option>
                                    ${this.renderReimbursementOptions(summary.unmatched_reimbursements)}
                                </select>
                            </div>

                            <div class="col-md-6">
                                <label class="form-label" style="font-size: 0.75rem; font-weight: 700; color: var(--outline); text-transform: uppercase;">
                                    2. Expense to Reimburse *
                                </label>
                                <select class="form-select" id="selectExpense" required>
                                    <option value="">Select expense...</option>
                                    ${this.renderExpenseOptions(summary.partially_reimbursed_expenses, summary.unreimbursed_expenses)}
                                </select>
                            </div>

                            <div class="col-md-4">
                                <label class="form-label" style="font-size: 0.75rem; font-weight: 700; color: var(--outline); text-transform: uppercase;">
                                    Amount to Allocate (${CONFIG.CURRENCY.symbol}) *
                                </label>
                                <input type="number" step="0.01" min="0.01" class="form-control" id="allocateAmount" placeholder="0.00" required>
                            </div>

                            <div class="col-md-4">
                                <label class="form-label" style="font-size: 0.75rem; font-weight: 700; color: var(--outline); text-transform: uppercase;">
                                    Counterparty (Who reimbursed?)
                                </label>
                                <input type="text" class="form-control" id="allocateCounterparty" placeholder="e.g. Alice, Bizum, Family">
                            </div>

                            <div class="col-md-4">
                                <label class="form-label" style="font-size: 0.75rem; font-weight: 700; color: var(--outline); text-transform: uppercase;">
                                    Notes
                                </label>
                                <input type="text" class="form-control" id="allocateNotes" placeholder="e.g. 50/50 split on dinner">
                            </div>
                        </div>

                        <div class="d-flex justify-content-end">
                            <button type="submit" class="btn btn-primary d-flex align-items-center gap-2" style="font-weight: 700;">
                                <span class="material-symbols-outlined" style="font-size: 1.125rem;">link</span>
                                <span>Create Allocation Link</span>
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Active Allocations Table -->
                <div class="section-card">
                    <div class="section-title">
                        <span class="material-symbols-outlined" style="font-size: 1.25rem; color: var(--primary);">playlist_add_check</span>
                        <span>Active Reconciliation Allocations (${this.allocations.length})</span>
                    </div>

                    <div id="allocationsListContainer">
                        ${this.renderAllocationsListHtml()}
                    </div>
                </div>

                <!-- Partially Reimbursed Expenses Overview -->
                ${this.renderPartiallyReimbursedSection(summary.partially_reimbursed_expenses)}
            </div>
        `;
        this.setupFormListeners();
    }

    renderSuggestionsSection(suggestions) {
        if (!suggestions || suggestions.length === 0) {
            return `
                <div class="section-card">
                    <div class="section-title">
                        <span class="material-symbols-outlined" style="font-size: 1.25rem; color: var(--primary);">auto_awesome</span>
                        <span>Smart Suggestions</span>
                    </div>
                    <div class="text-muted text-center py-3" style="font-size: 0.875rem;">
                        <span class="material-symbols-outlined" style="font-size: 1.75rem; display: block; margin-bottom: 0.25rem;">task_alt</span>
                        No automatic matching suggestions pending right now.
                    </div>
                </div>
            `;
        }

        return `
            <div class="section-card">
                <div class="section-title">
                    <span class="material-symbols-outlined" style="font-size: 1.25rem; color: var(--primary);">auto_awesome</span>
                    <span>Smart Suggestions (${suggestions.length})</span>
                    <span class="badge bg-primary ms-auto" style="font-size: 0.6875rem;">Requires Confirmation</span>
                </div>

                <div>
                    ${suggestions.map(s => {
                        const confStr = String(s.confidence || '').toLowerCase();
                        return `
                        <div class="suggestion-card" data-suggestion-id="${s.reimbursement_id}-${s.expense_id}">
                            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                                <div class="d-flex align-items-center gap-2">
                                    <span class="reason-badge confidence-${Utils.escapeHTML(confStr)}">
                                        <span class="material-symbols-outlined" style="font-size: 0.75rem;">verified</span>
                                        ${Utils.escapeHTML(confStr.toUpperCase())} CONFIDENCE
                                    </span>
                                    ${(s.reasons || []).map(r => `
                                        <span class="reason-badge">
                                            <span class="material-symbols-outlined" style="font-size: 0.75rem;">lightbulb</span>
                                            ${Utils.escapeHTML(r)}
                                        </span>
                                    `).join('')}
                                </div>
                                <div style="font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 1.125rem; color: #10b981;">
                                    ${CurrencyHelper.format(s.suggested_amount)}
                                </div>
                            </div>

                            <div class="row align-items-center g-3">
                                <div class="col-md-5">
                                    <div style="font-size: 0.75rem; color: var(--outline); text-transform: uppercase; font-weight: 700;">Reimbursement</div>
                                    <div style="font-weight: 600; color: var(--on-surface); font-size: 0.875rem;">${Utils.escapeHTML(s.reimbursement.description)}</div>
                                    <div style="font-size: 0.75rem; color: var(--outline);">
                                        ${DateHelper.formatDate(s.reimbursement.date)} • Available: ${CurrencyHelper.format(s.reimbursement.unallocated_amount)}
                                    </div>
                                </div>

                                <div class="col-md-4">
                                    <div style="font-size: 0.75rem; color: var(--outline); text-transform: uppercase; font-weight: 700;">Expense</div>
                                    <div style="font-weight: 600; color: var(--on-surface); font-size: 0.875rem;">${Utils.escapeHTML(s.expense.description)}</div>
                                    <div style="font-size: 0.75rem; color: var(--outline);">
                                        Gross: ${CurrencyHelper.format(s.expense.gross_cost || s.expense.amount)} • Remaining: ${CurrencyHelper.format(s.expense.remaining_share)}
                                    </div>
                                </div>

                                <div class="col-md-3 d-flex align-items-center justify-content-end gap-2">
                                    <input type="number" step="0.01" class="form-control form-control-sm suggestion-amount-input"
                                           value="${s.suggested_amount}" style="max-width: 90px; text-align: right;"
                                           data-reimbursement-id="${s.reimbursement_id}" data-expense-id="${s.expense_id}">
                                    <button class="btn btn-sm btn-primary confirm-suggestion-btn d-flex align-items-center gap-1"
                                            data-reimbursement-id="${s.reimbursement_id}" data-expense-id="${s.expense_id}">
                                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">check</span>
                                        <span>Link</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    renderReimbursementOptions(reimbursements) {
        if (!reimbursements || reimbursements.length === 0) {
            return '<option disabled>No unallocated reimbursements found</option>';
        }
        return reimbursements.map(r => `
            <option value="${r.id}" data-unallocated="${r.unallocated_amount}">
                ${Utils.escapeHTML(r.description)} (+${CurrencyHelper.format(r.amount)}) — Available: ${CurrencyHelper.format(r.unallocated_amount)}
            </option>
        `).join('');
    }

    renderExpenseOptions(partiallyReimbursed, unreimbursed) {
        let html = '';
        if (partiallyReimbursed && partiallyReimbursed.length > 0) {
            html += '<optgroup label="Partially Reimbursed">';
            html += partiallyReimbursed.map(e => `
                <option value="${e.id}" data-remaining="${e.remaining_share}">
                    ${Utils.escapeHTML(e.description)} (${CurrencyHelper.format(e.gross_cost || e.amount)}) — Remaining: ${CurrencyHelper.format(e.remaining_share)}
                </option>
            `).join('');
            html += '</optgroup>';
        }
        if (unreimbursed && unreimbursed.length > 0) {
            html += '<optgroup label="Unreimbursed Expenses">';
            html += unreimbursed.map(e => `
                <option value="${e.id}" data-remaining="${e.amount}">
                    ${Utils.escapeHTML(e.description)} (${CurrencyHelper.format(e.amount)})
                </option>
            `).join('');
            html += '</optgroup>';
        }
        return html;
    }

    renderAllocationsListHtml() {
        if (!this.allocations || this.allocations.length === 0) {
            return `
                <div class="text-muted text-center py-4" style="font-size: 0.875rem;">
                    <span class="material-symbols-outlined" style="font-size: 1.75rem; display: block; margin-bottom: 0.25rem;">link_off</span>
                    No active allocations created yet.
                </div>
            `;
        }

        return `
            <div class="table-responsive">
                <table class="alloc-table">
                    <thead>
                        <tr>
                            <th>Reimbursement Source</th>
                            <th>Reimbursed Expense</th>
                            <th style="text-align: right;">Allocated</th>
                            <th>Counterparty & Notes</th>
                            <th style="text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.allocations.map(a => this.renderAllocationRow(a)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderAllocationRow(a) {
        const isEditing = this.editingAllocationId === a.id;
        if (isEditing) {
            return `
                <tr class="table-active" data-allocation-id="${a.id}">
                    <td colspan="5">
                        <div class="p-2">
                            <div class="row g-2 align-items-center">
                                <div class="col-md-3">
                                    <label class="form-label small mb-0">Amount</label>
                                    <input type="number" step="0.01" class="form-control form-control-sm edit-alloc-amount" value="${a.amount}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label small mb-0">Counterparty</label>
                                    <input type="text" class="form-control form-control-sm edit-alloc-counterparty" value="${Utils.escapeHTML(a.counterparty || '')}">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label small mb-0">Notes</label>
                                    <input type="text" class="form-control form-control-sm edit-alloc-notes" value="${Utils.escapeHTML(a.notes || '')}">
                                </div>
                                <div class="col-md-2 d-flex gap-1 justify-content-end align-items-end pt-3">
                                    <button class="btn btn-sm btn-primary save-allocation-edit-btn" data-allocation-id="${a.id}">
                                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">check</span>
                                    </button>
                                    <button class="btn btn-sm btn-secondary cancel-allocation-edit-btn">
                                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }

        const reimbDesc = a.reimbursement ? a.reimbursement.description : `#${a.reimbursement_id}`;
        const reimbAmount = a.reimbursement ? `(+${CurrencyHelper.format(a.reimbursement.amount)})` : '';
        const expDesc = a.expense ? a.expense.description : `#${a.expense_id}`;
        const expGross = a.expense ? `(Gross: ${CurrencyHelper.format(a.expense.amount)})` : '';

        return `
            <tr data-allocation-id="${a.id}">
                <td>
                    <div style="font-weight: 600; color: #10b981;">${Utils.escapeHTML(reimbDesc)}</div>
                    <div style="font-size: 0.75rem; color: var(--outline);">${reimbAmount}</div>
                </td>
                <td>
                    <div style="font-weight: 600; color: var(--on-surface);">${Utils.escapeHTML(expDesc)}</div>
                    <div style="font-size: 0.75rem; color: var(--outline);">${expGross}</div>
                </td>
                <td style="text-align: right; font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 0.9375rem;">
                    ${CurrencyHelper.format(a.amount)}
                </td>
                <td>
                    <div>${a.counterparty ? `<span class="badge bg-secondary-subtle text-light me-1">${Utils.escapeHTML(a.counterparty)}</span>` : ''}</div>
                    <div style="font-size: 0.75rem; color: var(--outline);">${Utils.escapeHTML(a.notes || '—')}</div>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="btn btn-sm btn-outline-secondary edit-allocation-btn me-1" data-allocation-id="${a.id}" title="Edit Allocation">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">edit</span>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-allocation-btn" data-allocation-id="${a.id}" title="Delete Allocation">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">delete</span>
                    </button>
                </td>
            </tr>
        `;
    }

    renderPartiallyReimbursedSection(partiallyReimbursed) {
        if (!partiallyReimbursed || partiallyReimbursed.length === 0) return '';

        return `
            <div class="section-card">
                <div class="section-title">
                    <span class="material-symbols-outlined" style="font-size: 1.25rem; color: var(--primary);">donut_large</span>
                    <span>Partially Reimbursed Expenses Breakdown</span>
                </div>

                <div class="row g-3">
                    ${partiallyReimbursed.map(e => {
                        const gross = e.gross_cost || e.amount;
                        const reimbursed = e.reimbursed_amount || 0;
                        const remaining = e.remaining_share || 0;
                        const reimbPct = Math.min(100, Math.round((reimbursed / gross) * 100));
                        const remainPct = 100 - reimbPct;

                        return `
                            <div class="col-md-6">
                                <div style="background: var(--surface-container-high); border-radius: 0.75rem; padding: 1rem; border: 1px solid rgba(86, 67, 52, 0.1);">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <div style="font-weight: 700; font-size: 0.9375rem;">${Utils.escapeHTML(e.description)}</div>
                                        <div style="font-size: 0.75rem; color: var(--outline);">${DateHelper.formatDate(e.date)}</div>
                                    </div>

                                    <div class="d-flex justify-content-between align-items-baseline mb-2">
                                        <div style="font-size: 0.8125rem;">
                                            <span style="color: #10b981; font-weight: 700;">Reimbursed: ${CurrencyHelper.format(reimbursed)} (${reimbPct}%)</span>
                                        </div>
                                        <div style="font-size: 0.8125rem;">
                                            <span style="color: var(--primary); font-weight: 700;">Your share: ${CurrencyHelper.format(remaining)} (${remainPct}%)</span>
                                        </div>
                                    </div>

                                    <div class="progress-bar-container">
                                        <div class="progress-reimbursed" style="width: ${reimbPct}%;"></div>
                                        <div class="progress-remaining" style="width: ${remainPct}%;"></div>
                                    </div>

                                    <div class="text-end mt-2" style="font-size: 0.75rem; color: var(--outline);">
                                        Total Gross Cost: ${CurrencyHelper.format(gross)}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    renderAllocationsList() {
        const container = this.querySelector('#allocationsListContainer');
        if (container) {
            container.innerHTML = this.renderAllocationsListHtml();
        }
    }

    async handleConfirmSuggestion(btn) {
        const reimbId = parseInt(btn.dataset.reimbursementId);
        const expId = parseInt(btn.dataset.expenseId);
        const card = btn.closest('.suggestion-card');
        const amountInput = card ? card.querySelector('.suggestion-amount-input') : null;
        const amount = amountInput ? parseFloat(amountInput.value) : 0;

        if (!amount || amount <= 0) {
            if (window.showToast) window.showToast('Please enter a valid allocation amount', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            await ApiService.createAllocation({
                reimbursement_id: reimbId,
                expense_id: expId,
                amount: amount,
                notes: 'Confirmed suggestion link'
            });

            if (window.showToast) window.showToast('Reconciliation link created successfully!', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error confirming suggestion:', error);
            if (window.showToast) window.showToast(error.message || 'Failed to create link', 'error');
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 0.875rem;">check</span><span>Link</span>';
        }
    }

    async handleManualAllocate() {
        const reimbId = parseInt(this.querySelector('#selectReimbursement')?.value);
        const expId = parseInt(this.querySelector('#selectExpense')?.value);
        const amount = parseFloat(this.querySelector('#allocateAmount')?.value);
        const counterparty = this.querySelector('#allocateCounterparty')?.value.trim();
        const notes = this.querySelector('#allocateNotes')?.value.trim();

        if (!reimbId || !expId) {
            if (window.showToast) window.showToast('Please select both a reimbursement and an expense', 'error');
            return;
        }
        if (!amount || amount <= 0) {
            if (window.showToast) window.showToast('Please enter a valid positive amount', 'error');
            return;
        }

        const submitBtn = this.querySelector('#manualAllocateForm button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            await ApiService.createAllocation({
                reimbursement_id: reimbId,
                expense_id: expId,
                amount: amount,
                counterparty: counterparty || null,
                notes: notes || null
            });

            if (window.showToast) window.showToast('Allocation link created successfully!', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error creating manual allocation:', error);
            if (window.showToast) window.showToast(error.message || 'Failed to create allocation', 'error');
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    handleEditAllocation(allocId) {
        this.editingAllocationId = parseInt(allocId);
        this.renderAllocationsList();
    }

    async handleSaveAllocationEdit(allocId) {
        const row = this.querySelector(`tr[data-allocation-id="${allocId}"]`) || this.querySelector(`tr.table-active`);
        if (!row) return;

        const amountInput = row.querySelector('.edit-alloc-amount');
        const counterpartyInput = row.querySelector('.edit-alloc-counterparty');
        const notesInput = row.querySelector('.edit-alloc-notes');

        const amount = amountInput ? parseFloat(amountInput.value) : 0;
        const counterparty = counterpartyInput ? counterpartyInput.value.trim() : '';
        const notes = notesInput ? notesInput.value.trim() : '';

        if (!amount || amount <= 0) {
            if (window.showToast) window.showToast('Please enter a valid amount', 'error');
            return;
        }

        try {
            await ApiService.updateAllocation(allocId, {
                amount: amount,
                counterparty: counterparty || null,
                notes: notes || null
            });

            this.editingAllocationId = null;
            if (window.showToast) window.showToast('Allocation updated successfully', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error updating allocation:', error);
            if (window.showToast) window.showToast(error.message || 'Failed to update allocation', 'error');
        }
    }

    async handleDeleteAllocation(allocId) {
        if (!confirm('Are you sure you want to delete this reconciliation link?')) return;
        try {
            await ApiService.deleteAllocation(allocId);
            if (window.showToast) window.showToast('Allocation link deleted', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error deleting allocation:', error);
            if (window.showToast) window.showToast(error.message || 'Failed to delete allocation', 'error');
        }
    }
}

customElements.define('reconciliation-view', ReconciliationView);
