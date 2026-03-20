import { BaseComponent, EventManager } from './event-manager.js';
import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';
import { ApiService } from './api-service.js';

class RecurringList extends BaseComponent {
    constructor() {
        super();
        this.recurringExpenses = [];
    }

    connectedCallback() {
        this.render();
        this.loadRecurringExpenses();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.listenToGlobalEvent('recurringadded', () => this.loadRecurringExpenses());
        this.listenToGlobalEvent('recurringupdated', () => this.loadRecurringExpenses());
        this.listenToGlobalEvent('recurringdeleted', () => this.loadRecurringExpenses());
    }

    async loadRecurringExpenses() {
        try {
            const response = await fetch(CONFIG.API.ENDPOINTS.RECURRING);
            if (!response.ok) throw new Error('Failed to load recurring expenses');
            const data = await response.json();
            this.recurringExpenses = data.recurring_expenses || [];
            this.render();
        } catch (error) {
            console.error('Error loading recurring expenses:', error);
            window.showToast('Failed to load recurring expenses', 'error');
        }
    }

    formatFrequency(recurring) {
        const freq = recurring.frequency;
        const day = recurring.day_of_month;

        if (freq === 'monthly' && day) return `Monthly on day ${day}`;
        if (freq === 'weekly' && day) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            return `Weekly on ${days[day - 1]}`;
        }
        if (freq === 'yearly' && day) {
            const start = new Date(recurring.start_date);
            const monthName = start.toLocaleDateString('default', { month: 'long' });
            return `Yearly on ${monthName} ${day}`;
        }
        return freq.charAt(0).toUpperCase() + freq.slice(1);
    }

    async toggleActive(id, currentStatus) {
        try {
            const response = await fetch(`${CONFIG.API.ENDPOINTS.RECURRING}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !currentStatus })
            });
            if (!response.ok) throw new Error('Failed to update recurring expense');
            window.showToast(`Recurring expense ${!currentStatus ? 'activated' : 'deactivated'}`, 'success');
            this.loadRecurringExpenses();
        } catch (error) {
            console.error('Error toggling recurring expense:', error);
            window.showToast('Failed to update recurring expense', 'error');
        }
    }

    async deleteRecurring(id) {
        if (!confirm('Are you sure you want to delete this recurring expense?')) return;
        try {
            const response = await fetch(`${CONFIG.API.ENDPOINTS.RECURRING}/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete recurring expense');
            window.showToast('Recurring expense deleted', 'success');
            this.loadRecurringExpenses();
        } catch (error) {
            console.error('Error deleting recurring expense:', error);
            window.showToast('Failed to delete recurring expense', 'error');
        }
    }

    editRecurring(recurring) {
        document.dispatchEvent(new CustomEvent('show-recurring-form', {
            detail: { mode: 'edit', recurring }
        }));
    }

    async applyNow() {
        try {
            const response = await fetch(CONFIG.API.ENDPOINTS.RECURRING_APPLY, { method: 'POST' });
            if (!response.ok) throw new Error('Failed to apply recurring expenses');
            const data = await response.json();
            window.showToast(`Applied ${data.applied} recurring expense(s)`, 'success');
            EventManager.emit('expenseadded');
        } catch (error) {
            console.error('Error applying recurring expenses:', error);
            window.showToast('Failed to apply recurring expenses', 'error');
        }
    }

    render() {
        this.innerHTML = `
            <style>
                .recurring-header-card {
                    background: var(--surface-container);
                    border-radius: 1rem;
                    padding: 1rem 1.25rem;
                    margin-bottom: 0.75rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                }
                .recurring-header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.375rem;
                }
                .recurring-header-title {
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 0.9375rem;
                }
                .apply-now-btn {
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.5rem;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--primary);
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    transition: background 0.15s;
                }
                .apply-now-btn:hover {
                    background: rgba(255, 140, 0, 0.2);
                }
                .apply-now-btn .material-symbols-outlined {
                    font-size: 0.875rem;
                }
                .recurring-header-hint {
                    color: var(--outline);
                    font-size: 0.75rem;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .recurring-empty {
                    text-align: center;
                    padding: 3rem 1rem;
                    color: var(--outline);
                }
                .recurring-empty .material-symbols-outlined {
                    font-size: 3rem;
                    display: block;
                    margin-bottom: 0.75rem;
                    color: var(--primary);
                }
                .recurring-empty p {
                    margin: 0.25rem 0;
                }
                .recurring-item {
                    background: var(--surface-container);
                    border-radius: 0.75rem;
                    padding: 1rem 1.25rem;
                    margin-bottom: 0.5rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                    transition: opacity 0.2s;
                }
                .recurring-item.inactive {
                    opacity: 0.45;
                }
                .recurring-item-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 0.5rem;
                }
                .recurring-item-left {
                    flex: 1;
                    min-width: 0;
                }
                .recurring-item-badge-row {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.375rem;
                }
                .recurring-cat-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.6875rem;
                    padding: 0.2rem 0.5rem;
                    border-radius: 9999px;
                    font-weight: 600;
                }
                .recurring-desc {
                    font-weight: 600;
                    color: var(--on-surface);
                    font-size: 0.9375rem;
                }
                .recurring-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-top: 0.375rem;
                    font-size: 0.75rem;
                    color: var(--outline);
                    flex-wrap: wrap;
                }
                .recurring-meta-item {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .recurring-meta-item .material-symbols-outlined {
                    font-size: 0.875rem;
                }
                .recurring-meta-item strong {
                    color: var(--on-surface);
                    font-weight: 700;
                }
                .recurring-last-applied {
                    font-size: 0.6875rem;
                    color: var(--outline);
                    margin-top: 0.25rem;
                }
                .recurring-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    flex-shrink: 0;
                }
                .recurring-action-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--on-surface);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .recurring-action-btn:hover {
                    background: rgba(255, 140, 0, 0.2);
                    color: var(--primary);
                }
                .recurring-action-btn.delete-btn:hover {
                    background: rgba(255, 180, 171, 0.15);
                    color: var(--error);
                }
                .recurring-action-btn .material-symbols-outlined {
                    font-size: 1rem;
                }
                /* Toggle switch */
                .toggle-switch {
                    position: relative;
                    width: 40px;
                    height: 22px;
                }
                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                    position: absolute;
                }
                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: var(--surface-container-highest);
                    border-radius: 11px;
                    transition: background 0.2s;
                }
                .toggle-slider:before {
                    content: '';
                    position: absolute;
                    height: 16px;
                    width: 16px;
                    left: 3px;
                    bottom: 3px;
                    background: var(--outline);
                    border-radius: 50%;
                    transition: all 0.2s;
                }
                .toggle-switch input:checked + .toggle-slider {
                    background: var(--primary-container);
                }
                .toggle-switch input:checked + .toggle-slider:before {
                    transform: translateX(18px);
                    background: var(--on-primary);
                }
            </style>

            <div class="recurring-header-card">
                <div class="recurring-header-top">
                    <span class="recurring-header-title">Active Recurring Expenses</span>
                    <button class="apply-now-btn" id="apply-now-btn">
                        <span class="material-symbols-outlined">bolt</span> Apply Now
                    </button>
                </div>
                <div class="recurring-header-hint">
                    <span class="material-symbols-outlined" style="font-size: 0.875rem;">info</span>
                    Expenses are automatically applied daily at midnight
                </div>
            </div>

            ${this.recurringExpenses.length === 0 ? `
                <div class="recurring-empty">
                    <span class="material-symbols-outlined">repeat</span>
                    <p>No recurring expenses yet</p>
                    <p style="font-size: 0.75rem;">Click the Add button to create your first recurring expense</p>
                </div>
            ` : this.recurringExpenses.map(r => this.renderRecurringItem(r)).join('')}
        `;

        this.attachEventListeners();
    }

    renderRecurringItem(recurring) {
        const categoryData = CategoryHelper.getCategoryData(recurring.category);
        const isActive = recurring.is_active;
        const endDateStr = recurring.end_date ? new Date(recurring.end_date).toLocaleDateString() : 'No end date';

        return `
            <div class="recurring-item ${!isActive ? 'inactive' : ''}">
                <div class="recurring-item-top">
                    <div class="recurring-item-left">
                        <div class="recurring-item-badge-row">
                            <span class="recurring-cat-badge badge category-${recurring.category}">
                                <span class="material-symbols-outlined" style="font-size: 0.75rem;">${categoryData.icon}</span>
                                ${categoryData.label}
                            </span>
                            <span class="recurring-desc">${recurring.description}</span>
                        </div>
                        <div class="recurring-meta">
                            <span class="recurring-meta-item">
                                <span class="material-symbols-outlined">payments</span>
                                <strong>${CurrencyHelper.format(recurring.amount)}</strong>
                            </span>
                            <span class="recurring-meta-item">
                                <span class="material-symbols-outlined">repeat</span>
                                ${this.formatFrequency(recurring)}
                            </span>
                            <span class="recurring-meta-item">
                                <span class="material-symbols-outlined">event</span>
                                ${endDateStr}
                            </span>
                        </div>
                        ${recurring.last_applied_date ? `
                            <div class="recurring-last-applied">
                                Last applied: ${new Date(recurring.last_applied_date).toLocaleDateString()}
                            </div>
                        ` : ''}
                    </div>
                    <div class="recurring-actions">
                        <label class="toggle-switch" title="${isActive ? 'Deactivate' : 'Activate'}">
                            <input type="checkbox" class="toggle-active"
                                ${isActive ? 'checked' : ''}
                                data-id="${recurring.id}"
                                data-active="${isActive}">
                            <span class="toggle-slider"></span>
                        </label>
                        <button class="recurring-action-btn edit-btn" data-id="${recurring.id}" title="Edit">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="recurring-action-btn delete-btn" data-id="${recurring.id}" title="Delete">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const applyBtn = this.querySelector('#apply-now-btn');
        if (applyBtn) applyBtn.addEventListener('click', () => this.applyNow());

        this.querySelectorAll('.toggle-active').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                this.toggleActive(e.target.dataset.id, e.target.dataset.active === 'true');
            });
        });

        this.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                const recurring = this.recurringExpenses.find(r => r.id == id);
                if (recurring) this.editRecurring(recurring);
            });
        });

        this.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.deleteRecurring(e.target.closest('button').dataset.id);
            });
        });
    }
}

customElements.define('recurring-list', RecurringList);
