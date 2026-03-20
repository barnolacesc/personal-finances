import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';

class ExpenseList extends HTMLElement {
    constructor() {
        super();
        this.expenses = [];
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.currentWeek = 'all';
        this.categories = CategoryHelper.getAllCategories();
        this.page = 1;
        this.perPage = 5;
        this.total = 0;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadExpenses();
    }

    render() {
        this.innerHTML = `
            <style>
                .expense-list-card {
                    background: var(--surface-container);
                    border-radius: 1rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                    overflow: hidden;
                }
                .expense-list-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.08);
                }
                .expense-list-title {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 0.875rem;
                }
                .expense-list-total {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    color: var(--primary);
                    font-size: 1rem;
                }
                .expense-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem 1.25rem;
                    cursor: pointer;
                    transition: background 0.15s ease;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.06);
                }
                .expense-item:hover {
                    background: var(--surface-container-high);
                }
                .expense-item:last-child {
                    border-bottom: none;
                }
                .expense-icon-container {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: var(--surface-container-highest);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .expense-icon-container .material-symbols-outlined {
                    font-size: 1.125rem;
                }
                .expense-info {
                    flex: 1;
                    min-width: 0;
                }
                .expense-desc {
                    font-weight: 600;
                    color: var(--on-surface);
                    font-size: 0.875rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .expense-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    margin-top: 0.125rem;
                    font-size: 0.6875rem;
                    color: var(--outline);
                }
                .expense-meta .dot {
                    width: 3px;
                    height: 3px;
                    border-radius: 50%;
                    background: var(--outline-variant);
                }
                .expense-amount {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    font-size: 0.9375rem;
                    color: var(--on-surface);
                    flex-shrink: 0;
                }
                .empty-state {
                    text-align: center;
                    padding: 2.5rem 1rem;
                    color: var(--outline);
                }
                .empty-state .material-symbols-outlined {
                    font-size: 2.5rem;
                    display: block;
                    margin-bottom: 0.5rem;
                }
                .pagination-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.75rem 1.25rem;
                    border-top: 1px solid rgba(86, 67, 52, 0.08);
                }
                .page-btn {
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--on-surface);
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .page-btn:hover:not(:disabled) {
                    background: rgba(255, 140, 0, 0.2);
                    color: var(--primary);
                }
                .page-btn:disabled {
                    opacity: 0.3;
                    cursor: default;
                }
                .page-info {
                    font-size: 0.6875rem;
                    color: var(--outline);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .latest-badge {
                    font-size: 0.5625rem;
                    padding: 0.125rem 0.375rem;
                    border-radius: 9999px;
                    background: var(--primary-container);
                    color: var(--on-primary);
                    text-transform: uppercase;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                .source-badge {
                    font-size: 0.5625rem;
                    padding: 0.125rem 0.375rem;
                    border-radius: 9999px;
                    background: var(--surface-container-highest);
                    text-transform: uppercase;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                .source-manual { color: var(--primary); }
                .source-bank_sync { color: var(--tertiary); }

                /* Edit form styles */
                .edit-form {
                    padding: 0.25rem 0;
                }
                .edit-form label {
                    font-size: 0.6875rem;
                    font-weight: 700;
                    color: var(--outline);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 0.25rem;
                    display: block;
                }
                .edit-form input,
                .edit-form select {
                    width: 100%;
                    padding: 0.5rem 0.625rem;
                    border: none;
                    border-bottom: 2px solid var(--outline-variant);
                    background: transparent;
                    color: var(--on-surface);
                    font-size: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    border-radius: 0;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .edit-form input:focus,
                .edit-form select:focus {
                    border-bottom-color: var(--primary);
                }
                .edit-form select option {
                    background: var(--surface-container);
                    color: var(--on-surface);
                }
                .edit-fields {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.75rem;
                    margin-bottom: 0.75rem;
                }
                .edit-field-full {
                    grid-column: 1 / -1;
                }
                .edit-actions {
                    display: flex;
                    gap: 0.5rem;
                    margin-top: 0.5rem;
                }
                .edit-actions button {
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    border: none;
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    transition: background 0.15s;
                }
                .edit-actions .material-symbols-outlined {
                    font-size: 0.875rem;
                }
                .btn-save {
                    background: var(--primary-container);
                    color: var(--on-primary);
                }
                .btn-save:hover { opacity: 0.9; }
                .btn-cancel {
                    background: var(--surface-container-highest);
                    color: var(--on-surface);
                }
                .btn-cancel:hover { background: var(--surface-bright); }
                .btn-delete {
                    background: transparent;
                    color: var(--error);
                    margin-left: auto;
                }
                .btn-delete:hover { background: rgba(255, 180, 171, 0.1); }
                .expense-item.editing {
                    background: var(--surface-container-high);
                    border-left: 3px solid var(--primary);
                }
            </style>

            <div class="expense-list-card">
                <div class="expense-list-header">
                    <div class="expense-list-title">
                        <span class="material-symbols-outlined" style="font-size: 1.125rem;">receipt_long</span>
                        <span>Recent Expenses</span>
                    </div>
                    <div class="expense-list-total" id="totalAmount">${CurrencyHelper.format(0)}</div>
                </div>
                <div id="expensesList"></div>
                <div id="emptyState" class="empty-state" style="display: none;">
                    <span class="material-symbols-outlined">receipt</span>
                    <p>No expenses found for this period</p>
                </div>
                <div class="pagination-bar">
                    <div id="paginationNav"></div>
                    <backup-button></backup-button>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        document.addEventListener('datechange', (e) => {
            this.currentMonth = e.detail.month;
            this.currentYear = e.detail.year;
            this.currentWeek = e.detail.week;
            this.page = 1;
            this.loadExpenses();
        });

        this.addEventListener('click', (e) => {
            const expenseItem = e.target.closest('.expense-item');
            const saveBtn = e.target.closest('.save-expense-btn');
            const cancelBtn = e.target.closest('.cancel-expense-btn');

            if (expenseItem && !expenseItem.classList.contains('editing') && !saveBtn && !cancelBtn) {
                this.editExpense(expenseItem);
            } else if (saveBtn) {
                this.saveExpenseEdit(saveBtn);
            } else if (cancelBtn) {
                this.cancelExpenseEdit(cancelBtn);
            }
        });

        document.addEventListener('expenseadded', () => {
            this.loadExpenses();
        });
    }

    async loadExpenses(page = this.page) {
        try {
            this.page = page;
            const response = await fetch(`/api/expenses?month=${this.currentMonth}&year=${this.currentYear}&page=${this.page}&per_page=${this.perPage}`);
            if (!response.ok) throw new Error('Failed to fetch expenses');
            const data = await response.json();
            this.expenses = data.expenses;
            this.total = data.total;
            this.page = data.page;
            this.perPage = data.per_page;
            this.renderExpenses();
            this.renderPagination();
        } catch (error) {
            console.error('Error loading expenses:', error);
            window.showToast('Failed to load expenses', 'error');
        }
    }

    renderExpenses() {
        const expensesList = this.querySelector('#expensesList');
        const emptyState = this.querySelector('#emptyState');
        expensesList.innerHTML = '';

        let total = 0;
        let filteredExpenses = [];

        this.expenses.forEach(expense => {
            const date = new Date(expense.date);
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            const firstDayOfWeek = firstDay.getDay();
            const dayOffset = date.getDate() + firstDayOfWeek - 1;
            const weekNumber = Math.ceil(dayOffset / 7);
            const weekKey = `week${weekNumber}`;

            if (this.currentWeek === 'all' || this.currentWeek === weekKey) {
                total += expense.amount;
                filteredExpenses.push({ ...expense, date });
            }
        });

        if (filteredExpenses.length > 0) {
            emptyState.style.display = 'none';
            expensesList.style.display = 'block';

            filteredExpenses.forEach((expense, index) => {
                const isFirst = index === 0;
                const icon = CategoryHelper.getCategoryIcon(expense.category);
                const color = CategoryHelper.getCategoryColor(expense.category);
                const source = expense.source || 'manual';

                const item = document.createElement('div');
                item.className = 'expense-item';
                item.dataset.expenseId = expense.id;
                item.innerHTML = `
                    <div class="expense-icon-container">
                        <span class="material-symbols-outlined" style="color: ${color};">${icon}</span>
                    </div>
                    <div class="expense-info">
                        <div class="expense-desc">${expense.description}</div>
                        <div class="expense-meta">
                            <span>${CategoryHelper.getCategoryLabel(expense.category)}</span>
                            <span class="dot"></span>
                            <span>${this.formatDate(expense.date)}</span>
                            <span class="dot"></span>
                            <span class="source-badge source-${source}">${source === 'bank_sync' ? 'Bank' : 'Manual'}</span>
                            ${isFirst ? '<span class="latest-badge">Latest</span>' : ''}
                        </div>
                    </div>
                    <div class="expense-amount">${CurrencyHelper.format(expense.amount)}</div>
                `;
                expensesList.appendChild(item);
            });
        } else {
            expensesList.style.display = 'none';
            emptyState.style.display = 'block';
        }

        this.querySelector('#totalAmount').textContent = CurrencyHelper.format(total);
    }

    formatDate(date) {
        return date.toLocaleDateString('default', {
            day: '2-digit',
            month: 'short'
        });
    }

    editExpense(expenseItem) {
        if (expenseItem.classList.contains('editing')) return;

        const currentlyEditing = this.querySelector('.expense-item.editing');
        if (currentlyEditing) this.cancelEditingItem(currentlyEditing);

        const expenseId = expenseItem.dataset.expenseId;
        const expense = this.expenses.find(e => e.id == expenseId);
        if (!expense) return;

        expenseItem.dataset.originalContent = expenseItem.innerHTML;
        expenseItem.classList.add('editing');

        expenseItem.innerHTML = `
            <div class="edit-form" style="width: 100%;">
                <div class="edit-fields">
                    <div>
                        <label>Amount</label>
                        <div style="display: flex; align-items: center; gap: 0.25rem;">
                            <span style="color: var(--outline); font-size: 0.875rem;">${CONFIG.CURRENCY.symbol}</span>
                            <input type="text" class="edit-amount" value="${expense.amount}" pattern="[0-9]*[.,]?[0-9]*" inputmode="decimal">
                        </div>
                    </div>
                    <div>
                        <label>Category</label>
                        <select class="edit-category">
                            ${this.categories.map(cat => `
                                <option value="${cat}" ${cat === expense.category ? 'selected' : ''}>
                                    ${CategoryHelper.getCategoryLabel(cat)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="edit-field-full">
                        <label>Description</label>
                        <input type="text" class="edit-description" value="${expense.description}" maxlength="50">
                    </div>
                </div>
                <div class="edit-actions">
                    <button class="btn-save save-expense-btn" data-expense-id="${expenseId}">
                        <span class="material-symbols-outlined">check</span> Save
                    </button>
                    <button class="btn-cancel cancel-expense-btn" data-expense-id="${expenseId}">
                        <span class="material-symbols-outlined">close</span> Cancel
                    </button>
                    <button class="btn-delete delete-expense-btn" data-expense-id="${expenseId}">
                        <span class="material-symbols-outlined">delete</span> Delete
                    </button>
                </div>
            </div>
        `;

        expenseItem.querySelector('.delete-expense-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteExpense(expenseId);
        });

        setTimeout(() => expenseItem.querySelector('.edit-description').focus(), 100);
    }

    async saveExpenseEdit(saveBtn) {
        const expenseId = saveBtn.dataset.expenseId;
        const expenseItem = saveBtn.closest('.expense-item');

        const amount = parseFloat(expenseItem.querySelector('.edit-amount').value.replace(',', '.'));
        const category = expenseItem.querySelector('.edit-category').value;
        const description = expenseItem.querySelector('.edit-description').value.trim();

        if (!amount || amount <= 0) { window.showToast('Please enter a valid amount', 'error'); return; }
        if (!category) { window.showToast('Please select a category', 'error'); return; }
        if (!description) { window.showToast('Please enter a description', 'error'); return; }

        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, category, description })
            });
            if (!response.ok) throw new Error('Failed to update expense');
            window.showToast('Expense updated successfully', 'success');
            this.loadExpenses();
        } catch (error) {
            console.error('Error updating expense:', error);
            window.showToast('Failed to update expense', 'error');
        }
    }

    cancelExpenseEdit(cancelBtn) {
        this.cancelEditingItem(cancelBtn.closest('.expense-item'));
    }

    cancelEditingItem(expenseItem) {
        expenseItem.classList.remove('editing');
        if (expenseItem.dataset.originalContent) {
            expenseItem.innerHTML = expenseItem.dataset.originalContent;
            delete expenseItem.dataset.originalContent;
        } else {
            this.loadExpenses();
        }
    }

    async deleteExpense(expenseId) {
        if (!confirm('Are you sure you want to delete this expense?')) return;
        try {
            const response = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete expense');
            window.showToast('Expense deleted successfully', 'success');
            this.loadExpenses();
        } catch (error) {
            console.error('Error deleting expense:', error);
            window.showToast('Failed to delete expense', 'error');
        }
    }

    renderPagination() {
        const nav = this.querySelector('#paginationNav');
        if (!nav) return;
        const totalPages = Math.ceil(this.total / this.perPage);
        if (totalPages <= 1) { nav.innerHTML = ''; return; }

        nav.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <button class="page-btn" data-page="prev" ${this.page === 1 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined" style="font-size: 0.875rem;">chevron_left</span>
                </button>
                <span class="page-info">${this.page} / ${totalPages}</span>
                <button class="page-btn" data-page="next" ${this.page === totalPages ? 'disabled' : ''}>
                    <span class="material-symbols-outlined" style="font-size: 0.875rem;">chevron_right</span>
                </button>
            </div>
        `;

        nav.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.page === 'prev' && this.page > 1) this.loadExpenses(this.page - 1);
                else if (btn.dataset.page === 'next' && this.page < totalPages) this.loadExpenses(this.page + 1);
            });
        });
    }
}

customElements.define('expense-list', ExpenseList);
