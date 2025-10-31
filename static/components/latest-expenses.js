import { CONFIG, CategoryHelper, CurrencyHelper, DateHelper } from './config.js';

class LatestExpenses extends HTMLElement {
    constructor() {
        super();
        this.limit = parseInt(this.getAttribute('limit')) || 10;
        this.period = this.getAttribute('period') || 'all'; // 'all', 'week', 'today'
    }

    connectedCallback() {
        this.render();
        this.loadExpenses();
    }

    render() {
        this.innerHTML = `
            <div class="modern-card chart-container-modern">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="d-flex align-items-center">
                        <div class="d-inline-flex align-items-center justify-content-center me-2"
                             style="width: 36px; height: 36px; background: var(--primary-gradient); border-radius: 50%;">
                            <i class="bi bi-clock-history text-white"></i>
                        </div>
                        <h5 class="chart-title-modern mb-0">Latest Expenses</h5>
                    </div>
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-outline-primary ${this.period === 'today' ? 'active' : ''}" data-period="today">
                            Today
                        </button>
                        <button type="button" class="btn btn-outline-primary ${this.period === 'week' ? 'active' : ''}" data-period="week">
                            This Week
                        </button>
                        <button type="button" class="btn btn-outline-primary ${this.period === 'all' ? 'active' : ''}" data-period="all">
                            All
                        </button>
                    </div>
                </div>

                <div id="latestExpensesList" class="expenses-list">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .expenses-list {
                    max-height: 500px;
                    overflow-y: auto;
                    border-radius: 0.5rem;
                }

                .expense-item {
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    transition: all 0.2s ease;
                    cursor: pointer;
                }

                .expense-item:last-child {
                    border-bottom: none;
                }

                .expense-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                    transform: translateX(4px);
                }

                .expense-amount {
                    font-size: 1rem;
                    font-weight: 600;
                }

                .expense-description {
                    font-size: 0.9rem;
                    margin-bottom: 0.25rem;
                }

                .expense-date {
                    font-size: 0.75rem;
                    opacity: 0.7;
                }

                @media (max-width: 768px) {
                    .btn-group-sm > .btn {
                        padding: 0.25rem 0.5rem;
                        font-size: 0.75rem;
                    }

                    .expense-item {
                        padding: 0.6rem 0.8rem;
                    }

                    .expense-amount {
                        font-size: 0.9rem;
                    }

                    .expense-description {
                        font-size: 0.85rem;
                    }
                }
            </style>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const buttons = this.querySelectorAll('[data-period]');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.period = e.target.dataset.period;
                buttons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.loadExpenses();
            });
        });
    }

    async loadExpenses() {
        const listContainer = this.querySelector('#latestExpensesList');
        listContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;

        try {
            // Get current month and year
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            const response = await fetch(`/api/expenses?month=${currentMonth}&year=${currentYear}`);
            if (!response.ok) throw new Error('Failed to fetch expenses');

            const { expenses } = await response.json();

            // Filter by period
            let filteredExpenses = expenses;

            if (this.period === 'today') {
                const today = new Date().toDateString();
                filteredExpenses = expenses.filter(exp =>
                    new Date(exp.date).toDateString() === today
                );
            } else if (this.period === 'week') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                filteredExpenses = expenses.filter(exp =>
                    new Date(exp.date) >= weekAgo
                );
            }

            // Sort by date (newest first) and limit
            const sortedExpenses = filteredExpenses
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, this.limit);

            this.renderExpenses(sortedExpenses);
        } catch (error) {
            console.error('Error loading latest expenses:', error);
            listContainer.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 mb-2 d-block"></i>
                    <p>Failed to load expenses</p>
                </div>
            `;
        }
    }

    renderExpenses(expenses) {
        const listContainer = this.querySelector('#latestExpensesList');

        if (!expenses || expenses.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1 mb-2 d-block"></i>
                    <p>No expenses found for this period</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = expenses.map(expense => {
            const categoryColor = CategoryHelper.getCategoryColor(expense.category);
            const categoryIcon = CategoryHelper.getCategoryIcon(expense.category);
            const categoryLabel = CategoryHelper.getCategoryLabel(expense.category);

            return `
                <div class="expense-item d-flex align-items-center justify-content-between"
                     data-expense-id="${expense.id}"
                     title="Click to edit expense">
                    <div class="d-flex align-items-center flex-grow-1">
                        <div class="d-inline-flex align-items-center justify-content-center me-3"
                             style="width: 40px; height: 40px; background: ${categoryColor}20; border-radius: 50%;">
                            <i class="bi bi-${categoryIcon}" style="color: ${categoryColor}; font-size: 1.1rem;"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="expense-description text-light">${expense.description}</div>
                            <div class="expense-date text-muted">
                                <span class="badge badge-sm category-${expense.category} me-1" style="font-size: 0.65rem;">
                                    ${categoryLabel}
                                </span>
                                ${this.formatExpenseDate(expense.date)}
                            </div>
                        </div>
                    </div>
                    <div class="expense-amount text-end" style="color: ${categoryColor};">
                        ${CurrencyHelper.format(expense.amount)}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers to edit expenses
        listContainer.querySelectorAll('.expense-item').forEach(item => {
            item.addEventListener('click', () => {
                const expenseId = item.dataset.expenseId;
                const expense = expenses.find(e => e.id == expenseId);
                if (expense) {
                    this.editExpense(expense);
                }
            });
        });
    }

    formatExpenseDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const expenseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (expenseDate.getTime() === today.getTime()) {
            return `Today at ${date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (expenseDate.getTime() === yesterday.getTime()) {
            return `Yesterday at ${date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            return date.toLocaleDateString('default', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    editExpense(expense) {
        const editUrl = `/static/add-expense.html?edit=${expense.id}&amount=${expense.amount}&category=${expense.category}&description=${encodeURIComponent(expense.description)}`;
        window.location.href = editUrl;
    }
}

customElements.define('latest-expenses', LatestExpenses);
