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
                <div class="card-header bg-white py-3">
                    <h5 class="mb-0">
                        <button class="btn btn-link text-decoration-none text-dark p-0 w-100 text-start d-flex justify-content-between align-items-center" 
                                type="button" 
                                data-bs-toggle="collapse" 
                                data-bs-target="#expensesListSection">
                            <span><i class="bi bi-list-ul me-2"></i>Recent Expenses</span>
                            <i class="bi bi-chevron-down"></i>
                        </button>
                    </h5>
                </div>
                <div id="expensesListSection" class="collapse show">
                    <div class="card-header bg-white border-top">
                        <div class="d-flex justify-content-between align-items-center">
                            <div></div>
                            <button id="deleteLastBtn" 
                                    class="btn btn-outline-danger btn-sm" 
                                    disabled>
                                <i class="bi bi-trash me-1"></i>Delete Last
                            </button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th class="amount">Amount</th>
                                </tr>
                            </thead>
                            <tbody id="expensesList"></tbody>
                            <tfoot class="table-light">
                                <tr>
                                    <td colspan="3" class="text-end"><strong>Total:</strong></td>
                                    <td class="amount"><strong id="totalAmount">€0.00</strong></td>
                                </tr>
                            </tfoot>
                        </table>
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
                            Are you sure you want to delete the last expense?
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
        const deleteLastBtn = this.querySelector('#deleteLastBtn');
        const deleteModal = new bootstrap.Modal(this.querySelector('#deleteModal'));
        const confirmDeleteBtn = this.querySelector('#confirmDeleteBtn');

        deleteLastBtn.addEventListener('click', () => {
            deleteModal.show();
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
        const tbody = this.querySelector('#expensesList');
        const deleteLastBtn = this.querySelector('#deleteLastBtn');
        tbody.innerHTML = '';
        
        let total = 0;
        let hasExpenses = false;

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

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${this.formatDate(date)}</td>
                    <td>
                        <span class="badge category-${expense.category}">
                            ${this.formatCategory(expense.category)}
                        </span>
                    </td>
                    <td>${expense.description}</td>
                    <td class="amount">€${expense.amount.toFixed(2)}</td>
                `;
                tbody.appendChild(row);
            }
        });

        this.querySelector('#totalAmount').textContent = `€${total.toFixed(2)}`;
        deleteLastBtn.disabled = !hasExpenses;
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