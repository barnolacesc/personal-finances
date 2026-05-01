import { BaseComponent } from './event-manager.js';
import { CONFIG, CurrencyHelper, CategoryHelper , Utils} from './config.js';

class UnclassifiedList extends BaseComponent {
    connectedCallback() {
        this.render();
        this.loadExpenses();
    }

    render() {
        this.innerHTML = `
            <style>
                .unclassified-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1rem;
                }
                .unclassified-title {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 1rem;
                }
                .pending-badge {
                    font-size: 0.6875rem;
                    padding: 0.125rem 0.5rem;
                    border-radius: 9999px;
                    background: var(--primary-container);
                    color: var(--on-primary);
                    font-weight: 700;
                }
                .bank-link {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    background: var(--surface-container-highest);
                    color: var(--on-surface);
                    text-decoration: none;
                    font-size: 0.75rem;
                    font-weight: 600;
                    transition: background 0.15s;
                }
                .bank-link:hover {
                    background: rgba(255, 140, 0, 0.2);
                    color: var(--primary);
                }
                .unclassified-hint {
                    color: var(--outline);
                    font-size: 0.8125rem;
                    margin-bottom: 1rem;
                    line-height: 1.5;
                }
                .unclassified-card {
                    background: var(--surface-container);
                    border-radius: 0.75rem;
                    padding: 1rem 1.25rem;
                    margin-bottom: 0.625rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                    border-left: 4px solid var(--primary-container);
                    transition: border-left-color 0.2s;
                }
                .unclassified-card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 0.75rem;
                }
                .unclassified-merchant {
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 0.9375rem;
                }
                .unclassified-date {
                    color: var(--outline);
                    font-size: 0.75rem;
                    margin-top: 0.125rem;
                }
                .unclassified-amount {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    font-size: 1.125rem;
                    color: var(--on-surface);
                }
                .unclassified-form {
                    display: grid;
                    grid-template-columns: 1fr 1fr auto;
                    gap: 0.5rem;
                    align-items: end;
                }
                @media (max-width: 480px) {
                    .unclassified-form {
                        grid-template-columns: 1fr;
                    }
                }
                .unclassified-form label {
                    font-size: 0.625rem;
                    font-weight: 700;
                    color: var(--outline);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 0.125rem;
                    display: block;
                }
                .unclassified-form select,
                .unclassified-form input {
                    width: 100%;
                    padding: 0.5rem 0.625rem;
                    border: none;
                    border-bottom: 2px solid var(--outline-variant);
                    background: transparent;
                    color: var(--on-surface);
                    font-size: 0.8125rem;
                    font-family: 'Inter', sans-serif;
                    border-radius: 0;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .unclassified-form select:focus,
                .unclassified-form input:focus {
                    border-bottom-color: var(--primary);
                }
                .unclassified-form select option {
                    background: var(--surface-container);
                    color: var(--on-surface);
                }
                .save-btn {
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    background: var(--primary-container);
                    color: var(--on-primary);
                    border: none;
                    font-weight: 700;
                    font-size: 0.8125rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    transition: opacity 0.15s;
                    white-space: nowrap;
                }
                .save-btn:hover { opacity: 0.9; }
                .mapping-check {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    margin-top: 0.625rem;
                    cursor: pointer;
                }
                .mapping-check input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                    accent-color: var(--primary-container);
                    cursor: pointer;
                }
                .mapping-check label {
                    font-size: 0.75rem;
                    color: var(--outline);
                    cursor: pointer;
                }
                .empty-state {
                    text-align: center;
                    padding: 3rem 1rem;
                    color: var(--outline);
                }
                .empty-state .material-symbols-outlined {
                    font-size: 3rem;
                    color: var(--primary);
                    display: block;
                    margin-bottom: 0.75rem;
                }
                .empty-state p {
                    font-size: 0.875rem;
                    font-weight: 500;
                }
            </style>
            <div>
                <div class="unclassified-header">
                    <div class="unclassified-title">
                        <span class="material-symbols-outlined" style="color: var(--primary);">category</span>
                        Unclassified
                        <span class="pending-badge" id="pendingCount"></span>
                    </div>
                    <a href="/bank" class="bank-link">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">account_balance</span>
                        Bank Status
                    </a>
                </div>
                <p class="unclassified-hint">
                    Transactions imported from your bank that need classification.
                    Add merchant mappings on the Bank page to auto-classify future ones.
                </p>
                <div id="expenseRows"></div>
            </div>
        `;
    }

    async loadExpenses() {
        try {
            const res = await fetch('/api/expenses/unclassified');
            const data = await res.json();
            const expenses = data.expenses || [];
            const badge = this.querySelector('#pendingCount');
            if (badge) badge.textContent = expenses.length > 0 ? `${expenses.length} pending` : '';
            this._renderRows(expenses);
        } catch (e) {
            console.error('loadExpenses error', e);
            this.querySelector('#expenseRows').textContent = 'Error loading expenses.';
        }
    }

    _renderRows(expenses) {
        const container = this.querySelector('#expenseRows');
        if (expenses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">check_circle</span>
                    <p>All bank transactions are classified</p>
                </div>
            `;
            return;
        }

        const categoryOptions = Object.entries(CONFIG.CATEGORIES)
            .map(([key, cat]) => `<option value="${key}">${cat.label}</option>`)
            .join('');

        container.innerHTML = expenses.map(expense => `
            <div class="unclassified-card" data-expense-id="${expense.id}">
                <div class="unclassified-card-top">
                    <div>
                        <div class="unclassified-merchant">${expense.merchant || expense.description}</div>
                        <div class="unclassified-date">
                            ${new Date(expense.date).toLocaleDateString()}
                            ${expense.merchant && expense.description !== expense.merchant ? ' · ' + expense.description : ''}
                        </div>
                    </div>
                    <div class="unclassified-amount">${CurrencyHelper.format(expense.amount)}</div>
                </div>
                <div class="unclassified-form">
                    <div>
                        <label>Category</label>
                        <select class="category-select">
                            <option value="">Select category…</option>
                            ${categoryOptions}
                        </select>
                    </div>
                    <div>
                        <label>Description</label>
                        <input type="text" class="description-input"
                            placeholder="Description" value="${expense.merchant || expense.description || ''}">
                    </div>
                    <button class="save-btn">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">check</span>
                        Confirm
                    </button>
                </div>
                <div class="mapping-check">
                    <input type="checkbox" id="saveMapping-${expense.id}" class="save-mapping-check">
                    <label for="saveMapping-${expense.id}">Save as merchant mapping</label>
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
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        try {
        const expenseId = card.dataset.expenseId;
        const category = card.querySelector('.category-select').value;
        const description = card.querySelector('.description-input').value.trim();
        const saveMapping = card.querySelector('.save-mapping-check').checked;

        if (!category) { window.showToast('Please select a category', 'error'); return; }
        if (!description) { window.showToast('Please enter a description', 'error'); return; }

        try {
            const listRes = await fetch('/api/expenses/unclassified');
            const listData = await listRes.json();
            const expense = listData.expenses.find(e => String(e.id) === String(expenseId));
            if (!expense) throw new Error('Expense not found');

            const res = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: expense.amount, category, description }),
            });
            if (!res.ok) throw new Error(await res.text());

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

            window.showToast('Saved', 'success');
            card.remove();

            const remaining = this.querySelector('#expenseRows').querySelectorAll('[data-expense-id]');
            const badge = this.querySelector('#pendingCount');
            if (remaining.length === 0) {
                if (badge) badge.textContent = '';
                this.querySelector('#expenseRows').innerHTML = `
                    <div class="empty-state">
                        <span class="material-symbols-outlined">check_circle</span>
                        <p>All bank transactions are classified</p>
                    </div>
                `;
            } else {
                if (badge) badge.textContent = `${remaining.length} pending`;
            }
        } catch (e) {
            window.showToast('Error: ' + e.message, 'error');
        }
    }
}

customElements.define('unclassified-list', UnclassifiedList);
