import { BaseComponent } from './event-manager.js';
import { CONFIG, CurrencyHelper, DateHelper } from './config.js';

class UnclassifiedList extends BaseComponent {
    connectedCallback() {
        this.render();
        this.loadExpenses();
    }

    render() {
        this.innerHTML = `
            <div>
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <h6 class="fw-bold mb-0">
                        <i class="bi bi-question-circle me-2"></i>Unclassified Expenses
                    </h6>
                    <a href="/bank" class="btn btn-sm btn-outline-secondary">
                        <i class="bi bi-bank me-1"></i>Bank Status
                    </a>
                </div>
                <p class="text-muted small">
                    These transactions were imported from your bank but couldn't be mapped to a category.
                    Classify them below, or add a merchant mapping on the Bank Status page to auto-classify future transactions.
                </p>
                <div id="expenseRows"></div>
            </div>
        `;
    }

    async loadExpenses() {
        try {
            const res = await fetch('/api/expenses/unclassified');
            const data = await res.json();
            this._renderRows(data.expenses || []);
        } catch (e) {
            console.error('loadExpenses error', e);
            this.querySelector('#expenseRows').textContent = 'Error loading expenses.';
        }
    }

    _renderRows(expenses) {
        const container = this.querySelector('#expenseRows');
        if (expenses.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-check-circle fs-3 d-block mb-2"></i>
                    All bank transactions are classified.
                </div>
            `;
            return;
        }

        const categoryOptions = Object.entries(CONFIG.CATEGORIES)
            .map(([key, cat]) => `<option value="${key}">${cat.label}</option>`)
            .join('');

        container.innerHTML = expenses.map(expense => `
            <div class="card mb-2" data-expense-id="${expense.id}">
                <div class="card-body py-2 px-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <div class="fw-semibold">${expense.merchant || expense.description}</div>
                            <div class="text-muted small">
                                ${new Date(expense.date).toLocaleDateString()}
                                ${expense.merchant && expense.description !== expense.merchant
                                    ? '· ' + expense.description
                                    : ''}
                            </div>
                        </div>
                        <div class="fw-bold">${CurrencyHelper.format(expense.amount)}</div>
                    </div>
                    <div class="row g-2">
                        <div class="col-12 col-sm-5">
                            <select class="form-select form-select-sm category-select">
                                <option value="">Select category…</option>
                                ${categoryOptions}
                            </select>
                        </div>
                        <div class="col-12 col-sm-5">
                            <input type="text" class="form-control form-control-sm description-input"
                                placeholder="Description" value="${expense.merchant || expense.description || ''}">
                        </div>
                        <div class="col-12 col-sm-2 d-flex gap-1">
                            <button class="btn btn-sm btn-primary flex-fill save-btn">
                                Save
                            </button>
                        </div>
                    </div>
                    <div class="form-check mt-2">
                        <input class="form-check-input save-mapping-check" type="checkbox" id="saveMapping-${expense.id}">
                        <label class="form-check-label small text-muted" for="saveMapping-${expense.id}">
                            Save as merchant mapping
                        </label>
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.save-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.currentTarget.closest('[data-expense-id]');
                this._saveExpense(card);
            });
        });
    }

    async _saveExpense(card) {
        const expenseId = card.dataset.expenseId;
        const category = card.querySelector('.category-select').value;
        const description = card.querySelector('.description-input').value.trim();
        const saveMapping = card.querySelector('.save-mapping-check').checked;

        if (!category) {
            window.showToast && window.showToast('Please select a category', 'error');
            return;
        }
        if (!description) {
            window.showToast && window.showToast('Please enter a description', 'error');
            return;
        }

        // Load current expense data for amount
        const expenseRes = await fetch(`/api/expenses?page=1&per_page=1000`).catch(() => null);

        try {
            // Get current expense to preserve amount
            const listRes = await fetch('/api/expenses/unclassified');
            const listData = await listRes.json();
            const expense = listData.expenses.find(e => String(e.id) === String(expenseId));
            if (!expense) throw new Error('Expense not found');

            const res = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: expense.amount,
                    category,
                    description,
                }),
            });
            if (!res.ok) throw new Error(await res.text());

            // Optionally save merchant mapping
            if (saveMapping && expense.merchant) {
                await fetch('/api/merchants', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pattern: expense.merchant.toUpperCase(),
                        category,
                        description,
                    }),
                });
            }

            window.showToast && window.showToast('Saved', 'success');
            card.remove();

            const remaining = this.querySelector('#expenseRows').querySelectorAll('[data-expense-id]');
            if (remaining.length === 0) {
                this.querySelector('#expenseRows').innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="bi bi-check-circle fs-3 d-block mb-2"></i>
                        All bank transactions are classified.
                    </div>
                `;
            }
        } catch (e) {
            window.showToast && window.showToast('Error: ' + e.message, 'error');
        }
    }
}

customElements.define('unclassified-list', UnclassifiedList);
