import { CONFIG, CategoryHelper, CurrencyHelper, DateHelper } from './config.js';

class LatestExpenses extends HTMLElement {
    constructor() {
        super();
        this.currentPage = 1;
        this.perPage = 6; // 6 items per page for clean mobile display
        this.period = this.getAttribute('period') || 'all'; // 'all', 'week', 'today'
        this.allExpenses = []; // Store all fetched expenses
        this.totalExpenses = 0;
    }

    connectedCallback() {
        this.render();
        this.loadAllExpenses();
    }

    render() {
        this.innerHTML = `
            <div class="modern-card chart-container-modern">
                <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
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
                            Week
                        </button>
                        <button type="button" class="btn btn-outline-primary ${this.period === 'all' ? 'active' : ''}" data-period="all">
                            Month
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

                <!-- Pagination Controls -->
                <div id="paginationControls" class="d-none mt-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <button id="prevPageBtn" class="btn btn-sm btn-outline-primary" disabled>
                            <i class="bi bi-chevron-left"></i> Previous
                        </button>
                        <span class="text-muted small" id="pageInfo">Page 1</span>
                        <button id="nextPageBtn" class="btn btn-sm btn-outline-primary" disabled>
                            Next <i class="bi bi-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .expenses-list {
                    min-height: 300px;
                    border-radius: 0.5rem;
                }

                .expense-item {
                    padding: 0.875rem 1rem;
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
                    color: var(--bs-light);
                }

                .expense-date {
                    font-size: 0.75rem;
                    opacity: 0.7;
                }

                .expense-category-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                @media (max-width: 768px) {
                    .btn-group-sm > .btn {
                        padding: 0.25rem 0.5rem;
                        font-size: 0.75rem;
                    }

                    .expense-item {
                        padding: 0.75rem 0.8rem;
                    }

                    .expense-amount {
                        font-size: 0.9rem;
                    }

                    .expense-description {
                        font-size: 0.85rem;
                    }

                    .expense-category-icon {
                        width: 36px;
                        height: 36px;
                    }
                }
            </style>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Period filter buttons
        const buttons = this.querySelectorAll('[data-period]');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.period = e.target.dataset.period;
                this.currentPage = 1; // Reset to first page
                buttons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                // Reload expenses when period changes to fetch appropriate data
                this.loadAllExpenses();
            });
        });

        // Pagination buttons
        const prevBtn = this.querySelector('#prevPageBtn');
        const nextBtn = this.querySelector('#nextPageBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.filterAndDisplayExpenses();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.getFilteredExpenses().length / this.perPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.filterAndDisplayExpenses();
                }
            });
        }
    }

    async loadAllExpenses() {
        const listContainer = this.querySelector('#latestExpensesList');
        listContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted mt-2 small">Loading expenses...</p>
            </div>
        `;

        try {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            // Only fetch what's needed based on period
            let monthsToFetch = [];

            if (this.period === 'today' || this.period === 'week') {
                // For today/week, fetch current month and previous month (in case week spans months)
                monthsToFetch.push({ year: currentYear, month: currentMonth });

                // Add previous month
                const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
                const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
                monthsToFetch.push({ year: prevYear, month: prevMonth });
            } else {
                // For 'all', fetch current month only (not all history!)
                monthsToFetch.push({ year: currentYear, month: currentMonth });
            }

            // Fetch expenses from selected months
            const allExpensesPromises = monthsToFetch.map(async ({ year, month }) => {
                const response = await fetch(`/api/expenses?month=${month}&year=${year}`);
                if (!response.ok) return [];
                const { expenses } = await response.json();
                return expenses;
            });

            // Wait for all requests to complete
            const expensesArrays = await Promise.all(allExpensesPromises);

            // Flatten and sort by date (newest first)
            this.allExpenses = expensesArrays
                .flat()
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            this.totalExpenses = this.allExpenses.length;

            // Display filtered expenses
            this.filterAndDisplayExpenses();
        } catch (error) {
            console.error('Error loading expenses:', error);
            listContainer.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 mb-2 d-block"></i>
                    <p class="mb-1">Failed to load expenses</p>
                    <small class="text-muted">${error.message}</small>
                </div>
            `;
        }
    }

    getFilteredExpenses() {
        let filtered = [...this.allExpenses];

        if (this.period === 'today') {
            const today = new Date().toDateString();
            filtered = filtered.filter(exp =>
                new Date(exp.date).toDateString() === today
            );
        } else if (this.period === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            filtered = filtered.filter(exp =>
                new Date(exp.date) >= weekAgo
            );
        }
        // 'all' period returns all expenses (already sorted)

        return filtered;
    }

    filterAndDisplayExpenses() {
        const filteredExpenses = this.getFilteredExpenses();
        const totalPages = Math.ceil(filteredExpenses.length / this.perPage);

        // Get expenses for current page
        const startIndex = (this.currentPage - 1) * this.perPage;
        const endIndex = startIndex + this.perPage;
        const pageExpenses = filteredExpenses.slice(startIndex, endIndex);

        this.renderExpenses(pageExpenses, filteredExpenses.length);
        this.updatePaginationControls(totalPages, filteredExpenses.length);
    }

    renderExpenses(expenses, totalCount) {
        const listContainer = this.querySelector('#latestExpensesList');

        if (!expenses || expenses.length === 0) {
            const periodLabel = this.period === 'today' ? 'today' :
                               this.period === 'week' ? 'this week' : 'this month';

            listContainer.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1 mb-2 d-block"></i>
                    <p class="mb-0">No expenses ${periodLabel}</p>
                    ${this.period !== 'all' ? '<small>Try selecting "Month" to see all expenses this month</small>' : ''}
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
                    <div class="d-flex align-items-center flex-grow-1 me-3">
                        <div class="expense-category-icon me-3"
                             style="background: ${categoryColor}20;">
                            <i class="bi bi-${categoryIcon}" style="color: ${categoryColor}; font-size: 1.1rem;"></i>
                        </div>
                        <div class="flex-grow-1 min-width-0">
                            <div class="expense-description text-truncate">${expense.description}</div>
                            <div class="expense-date text-muted d-flex align-items-center gap-2">
                                <span class="badge badge-sm category-${expense.category}" style="font-size: 0.65rem;">
                                    ${categoryLabel}
                                </span>
                                <span>${this.formatExpenseDate(expense.date)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="expense-amount text-end text-nowrap" style="color: ${categoryColor};">
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

    updatePaginationControls(totalPages, totalCount) {
        const paginationDiv = this.querySelector('#paginationControls');
        const prevBtn = this.querySelector('#prevPageBtn');
        const nextBtn = this.querySelector('#nextPageBtn');
        const pageInfo = this.querySelector('#pageInfo');

        if (totalPages <= 1) {
            paginationDiv.classList.add('d-none');
            return;
        }

        paginationDiv.classList.remove('d-none');

        // Update button states
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;

        // Update page info
        const startItem = (this.currentPage - 1) * this.perPage + 1;
        const endItem = Math.min(this.currentPage * this.perPage, totalCount);
        pageInfo.textContent = `${startItem}-${endItem} of ${totalCount}`;
    }

    formatExpenseDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const expenseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (expenseDate.getTime() === today.getTime()) {
            return `Today, ${date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (expenseDate.getTime() === yesterday.getTime()) {
            return `Yesterday, ${date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
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
