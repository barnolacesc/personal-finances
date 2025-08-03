import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';

class ExpenseList extends HTMLElement {
    constructor() {
        super();
        this.expenses = [];
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.currentWeek = 'all';
        // Load categories from config
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
            <div class="card shadow-sm mb-4">
                <div class="card-header py-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">
                            <button class="btn btn-link text-decoration-none p-0 text-start d-flex align-items-center"
                                    type="button"
                                    data-bs-toggle="collapse"
                                    data-bs-target="#expensesListSection">
                                <i class="bi bi-list-ul me-2"></i>Recent Expenses
                                <i class="bi bi-chevron-down ms-2"></i>
                            </button>
                        </h5>
                        <span id="totalAmount" class="fw-bold text-primary">${CurrencyHelper.format(0)}</span>
                    </div>
                </div>
                <div id="expensesListSection" class="collapse show">
                    <div class="card-body p-0">
                        <div id="expensesList" class="list-group list-group-flush"></div>
                        <div id="emptyState" class="text-center py-4 text-muted" style="display: none;">
                            <i class="bi bi-receipt fs-1 mb-2 d-block"></i>
                            <p class="mb-0">No expenses found for this period</p>
                        </div>
                        <div class="d-flex justify-content-between align-items-center px-3 py-2">
                            <nav id="paginationNav" class="d-flex align-items-center"></nav>
                            <backup-button></backup-button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Listen for date changes from navigation component
        document.addEventListener('datechange', (e) => {
            const { month, year, week } = e.detail;
            this.currentMonth = month;
            this.currentYear = year;
            this.currentWeek = week;
            this.page = 1; // Reset to first page when date changes
            this.loadExpenses();
        });

        // Listen for clicks on expense items for editing
        this.addEventListener('click', (e) => {
            const expenseItem = e.target.closest('.expense-item');
            const saveBtn = e.target.closest('.save-expense-btn');
            const cancelBtn = e.target.closest('.cancel-expense-btn');

            if (expenseItem && !expenseItem.classList.contains('editing') && !saveBtn && !cancelBtn) {
                // Enter edit mode
                this.editExpense(expenseItem);
            } else if (saveBtn) {
                // Save changes
                this.saveExpenseEdit(saveBtn);
            } else if (cancelBtn) {
                // Cancel editing
                this.cancelExpenseEdit(cancelBtn);
            }
        });

        // Listen for date changes from date-navigation component
        document.addEventListener('datechange', (e) => {
            console.log('Received date change:', e.detail);
            this.currentMonth = e.detail.month;
            this.currentYear = e.detail.year;
            this.currentWeek = e.detail.week;
            this.loadExpenses();
        });

        // Listen for new expenses being added
        this.addEventListener('expenseadded', () => {
            this.loadExpenses();
        });

        document.addEventListener('expenseadded', () => {
            this.loadExpenses();
        });
    }

    async loadExpenses(page = this.page) {
        try {
            this.page = page;
            const response = await fetch(`/api/expenses?month=${this.currentMonth}&year=${this.currentYear}&page=${this.page}&per_page=${this.perPage}`);
            if (!response.ok) {
                console.error('Server response:', await response.text());
                throw new Error('Failed to fetch expenses');
            }
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
        let hasExpenses = false;
        let filteredExpenses = [];

        this.expenses.forEach(expense => {
            const date = new Date(expense.date);
            // Get the first day of the month
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            // Get the day of the week of the first day (0-6, where 0 is Sunday)
            const firstDayOfWeek = firstDay.getDay();
            // Calculate the day offset considering the first week might be partial
            const dayOffset = date.getDate() + firstDayOfWeek - 1;
            // Calculate the week number (1-based)
            const weekNumber = Math.ceil(dayOffset / 7);
            const weekKey = `week${weekNumber}`;

            if (this.currentWeek === 'all' || this.currentWeek === weekKey) {
                hasExpenses = true;
                total += expense.amount;
                filteredExpenses.push({ ...expense, date });
            }
        });

        if (hasExpenses) {
            emptyState.style.display = 'none';
            expensesList.style.display = 'block';

            filteredExpenses.forEach((expense, index) => {
                const isFirst = index === 0; // Most recent expense
                const item = document.createElement('div');
                item.className = 'list-group-item expense-item px-3 py-3';
                item.style.cursor = 'pointer';
                item.dataset.expenseId = expense.id;
                item.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-1">
                                <span class="badge category-${expense.category} me-2">
                                    ${this.formatCategory(expense.category)}
                                </span>
                                <small class="text-muted">${this.formatDate(expense.date)}</small>
                                ${isFirst ? '<span class="badge bg-body-secondary text-body ms-2"><i class="bi bi-clock"></i> Latest</span>' : ''}
                            </div>
                            <div class="fw-medium expense-description">${expense.description}</div>
                        </div>
                        <div class="text-end ms-3 d-flex align-items-center gap-2">
                            <span class="fw-bold fs-6 expense-amount">${CurrencyHelper.format(expense.amount)}</span>
                            <small class="text-muted">
                                <i class="bi bi-pencil-square"></i>
                            </small>
                        </div>
                    </div>
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
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatCategory(category) {
        return CategoryHelper.getCategoryLabel(category);
    }

    editExpense(expenseItem) {
        if (expenseItem.classList.contains('editing')) return;

        // Close any currently editing expense first
        const currentlyEditing = this.querySelector('.expense-item.editing');
        if (currentlyEditing && currentlyEditing !== expenseItem) {
            this.cancelEditingItem(currentlyEditing);
        }

        const expenseId = expenseItem.dataset.expenseId;
        const expense = this.expenses.find(e => e.id == expenseId);
        if (!expense) return;

        // Store original content before editing
        expenseItem.dataset.originalContent = expenseItem.innerHTML;

        // Add editing class for visual feedback
        expenseItem.classList.add('editing');
        // Don't set inline styles, let CSS handle the theming
        expenseItem.style.border = '2px solid #007bff';

        // Get current values
        const amount = expense.amount;
        const category = expense.category;
        const description = expense.description;

        // Create edit form
        expenseItem.innerHTML = `
            <div class="edit-form">
                <div class="row g-3">
                    <div class="col-sm-4">
                        <label class="form-label small fw-bold">Amount</label>
                        <div class="input-group input-group-sm">
                            <span class="input-group-text">${CONFIG.CURRENCY.symbol}</span>
                            <input type="text"
                                   class="form-control edit-amount"
                                   value="${amount}"
                                   pattern="[0-9]*[.,]?[0-9]*"
                                   inputmode="decimal">
                        </div>
                    </div>
                    <div class="col-sm-4">
                        <label class="form-label small fw-bold">Category</label>
                        <select class="form-select form-select-sm edit-category">
                            ${this.categories.map(cat => `
                                <option value="${cat}" ${cat === category ? 'selected' : ''}>
                                    ${this.formatCategory(cat)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="col-sm-4">
                        <label class="form-label small fw-bold">Description</label>
                        <input type="text"
                               class="form-control form-control-sm edit-description"
                               value="${description}"
                               maxlength="50">
                    </div>
                </div>
                <div class="d-flex gap-2 mt-3">
                    <button class="btn btn-success btn-sm save-expense-btn" data-expense-id="${expenseId}">
                        <i class="bi bi-check-lg"></i> Save
                    </button>
                    <button class="btn btn-secondary btn-sm cancel-expense-btn" data-expense-id="${expenseId}">
                        <i class="bi bi-x-lg"></i> Cancel
                    </button>
                    <button class="btn btn-outline-danger btn-sm ms-auto delete-expense-btn" data-expense-id="${expenseId}">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;

        // Add event listener for delete button
        const deleteBtn = expenseItem.querySelector('.delete-expense-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteExpense(expenseId);
        });

        // Focus on description field
        setTimeout(() => {
            expenseItem.querySelector('.edit-description').focus();
        }, 100);
    }

    async saveExpenseEdit(saveBtn) {
        const expenseId = saveBtn.dataset.expenseId;
        const expenseItem = saveBtn.closest('.expense-item');

        const amount = parseFloat(expenseItem.querySelector('.edit-amount').value.replace(',', '.'));
        const category = expenseItem.querySelector('.edit-category').value;
        const description = expenseItem.querySelector('.edit-description').value.trim();

        // Validation
        if (!amount || amount <= 0) {
            window.showToast('Please enter a valid amount', 'error');
            return;
        }
        if (!category) {
            window.showToast('Please select a category', 'error');
            return;
        }
        if (!description) {
            window.showToast('Please enter a description', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount,
                    category,
                    description
                })
            });

            if (!response.ok) throw new Error('Failed to update expense');

            window.showToast('Expense updated successfully', 'success');
            this.loadExpenses(); // Reload to get fresh data
        } catch (error) {
            console.error('Error updating expense:', error);
            window.showToast('Failed to update expense', 'error');
        }
    }

    cancelExpenseEdit(cancelBtn) {
        const expenseItem = cancelBtn.closest('.expense-item');
        this.cancelEditingItem(expenseItem);
    }

    cancelEditingItem(expenseItem) {
        // Remove editing state
        expenseItem.classList.remove('editing');
        expenseItem.style.border = '';

        // Restore original content if available
        if (expenseItem.dataset.originalContent) {
            expenseItem.innerHTML = expenseItem.dataset.originalContent;
            delete expenseItem.dataset.originalContent;
        } else {
            // Fallback: reload expenses if original content not available
            this.loadExpenses();
        }
    }

    async deleteExpense(expenseId) {
        if (!confirm('Are you sure you want to delete this expense?')) {
            return;
        }

        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'DELETE'
            });

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
        if (totalPages <= 1) {
            nav.innerHTML = '';
            return;
        }
        // Use a span with d-none d-sm-inline for full text, d-inline d-sm-none for compact
        nav.innerHTML = `
            <ul class="pagination mb-0">
                <li class="page-item${this.page === 1 ? ' disabled' : ''}">
                    <button class="page-link" data-page="prev">Previous</button>
                </li>
                <li class="page-item disabled">
                    <span class="page-link">
                        <span class="d-none d-sm-inline">Page ${this.page} of ${totalPages}</span>
                        <span class="d-inline d-sm-none">${this.page}/${totalPages}</span>
                    </span>
                </li>
                <li class="page-item${this.page === totalPages ? ' disabled' : ''}">
                    <button class="page-link" data-page="next">Next</button>
                </li>
            </ul>
        `;
        nav.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.dataset.page === 'prev' && this.page > 1) {
                    this.loadExpenses(this.page - 1);
                } else if (btn.dataset.page === 'next' && this.page < totalPages) {
                    this.loadExpenses(this.page + 1);
                }
            });
        });
    }
}

customElements.define('expense-list', ExpenseList);
