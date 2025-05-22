class ExpenseList extends HTMLElement {
    constructor() {
        super();
        this.expenses = [];
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.currentWeek = 'all';
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
                        <span id="totalAmount" class="fw-bold text-primary">€0.00</span>
                    </div>
                </div>
                <div id="expensesListSection" class="collapse show">
                    <div class="card-body p-0">
                        <div id="expensesList" class="list-group list-group-flush"></div>
                        <div id="emptyState" class="text-center py-4 text-muted" style="display: none;">
                            <i class="bi bi-receipt fs-1 mb-2 d-block"></i>
                            <p class="mb-0">No expenses found for this period</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Delete Confirmation Modal -->
            <div class="modal fade" id="deleteModal" tabindex="-1" aria-labelledby="deleteModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="deleteModalLabel">Confirm Delete</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            Are you sure you want to delete this expense?
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const deleteModal = new bootstrap.Modal(this.querySelector('#deleteModal'));
        const confirmDeleteBtn = this.querySelector('#confirmDeleteBtn');

        // Use event delegation for the dynamically created delete button
        this.addEventListener('click', (e) => {
            if (e.target.closest('#deleteLastBtn')) {
                deleteModal.show();
            }
        });

        confirmDeleteBtn.addEventListener('click', async () => {
            await this.deleteLastExpense();
            deleteModal.hide();
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

    async loadExpenses() {
        try {
            console.log(`Loading expenses for ${this.currentMonth}/${this.currentYear}`);
            const response = await fetch(`/api/expenses?month=${this.currentMonth}&year=${this.currentYear}`);
            if (!response.ok) {
                console.error('Server response:', await response.text());
                throw new Error('Failed to fetch expenses');
            }
            
            const data = await response.json();
            console.log('Loaded expenses:', data);
            this.expenses = data.expenses;
            this.renderExpenses();
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
                item.className = 'list-group-item px-3 py-3';
                item.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-1">
                                <span class="badge category-${expense.category} me-2">
                                    ${this.formatCategory(expense.category)}
                                </span>
                                <small class="text-muted">${this.formatDate(expense.date)}</small>
                                ${isFirst ? '<span class="badge bg-light text-dark ms-2"><i class="bi bi-clock"></i> Latest</span>' : ''}
                            </div>
                            <div class="fw-medium">${expense.description}</div>
                        </div>
                        <div class="text-end ms-3 d-flex align-items-center gap-2">
                            <span class="fw-bold fs-6">€${expense.amount.toFixed(2)}</span>
                            ${isFirst ? `
                                <button class="btn btn-outline-danger btn-sm" 
                                        id="deleteLastBtn"
                                        title="Delete this expense (quick fix)">
                                    <i class="bi bi-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
                expensesList.appendChild(item);
            });
        } else {
            expensesList.style.display = 'none';
            emptyState.style.display = 'block';
        }

        this.querySelector('#totalAmount').textContent = `€${total.toFixed(2)}`;
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
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    async deleteLastExpense() {
        const lastExpense = this.expenses[0];
        if (!lastExpense) return;

        try {
            const response = await fetch(`/api/expenses/${lastExpense.id}`, {
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
}

customElements.define('expense-list', ExpenseList); 