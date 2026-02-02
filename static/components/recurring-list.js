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
        // Listen for recurring expense added/updated/deleted events
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

        if (freq === 'monthly' && day) {
            return `Monthly on day ${day}`;
        } else if (freq === 'weekly' && day) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            return `Weekly on ${days[day - 1]}`;
        } else if (freq === 'yearly' && day) {
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
            const response = await fetch(`${CONFIG.API.ENDPOINTS.RECURRING}/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete recurring expense');

            window.showToast('Recurring expense deleted', 'success');
            this.loadRecurringExpenses();
        } catch (error) {
            console.error('Error deleting recurring expense:', error);
            window.showToast('Failed to delete recurring expense', 'error');
        }
    }

    editRecurring(recurring) {
        const event = new CustomEvent('show-recurring-form', {
            detail: { mode: 'edit', recurring }
        });
        document.dispatchEvent(event);
    }

    async applyNow() {
        try {
            const response = await fetch(CONFIG.API.ENDPOINTS.RECURRING_APPLY, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Failed to apply recurring expenses');

            const data = await response.json();
            window.showToast(`Applied ${data.applied} recurring expense(s)`, 'success');

            // Refresh the expense list if we're on the expenses page
            EventManager.emit('expenseadded');
        } catch (error) {
            console.error('Error applying recurring expenses:', error);
            window.showToast('Failed to apply recurring expenses', 'error');
        }
    }

    render() {
        this.innerHTML = `
            <div class="card shadow-sm mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h5 class="card-title mb-0">Active Recurring Expenses</h5>
                        <button class="btn btn-sm btn-outline-primary" id="apply-now-btn">
                            <i class="bi bi-lightning-charge"></i> Apply Now
                        </button>
                    </div>
                    <p class="text-muted small mb-0">
                        <i class="bi bi-info-circle"></i> Expenses are automatically applied daily at midnight
                    </p>
                </div>
            </div>

            ${this.recurringExpenses.length === 0 ? `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-arrow-repeat" style="font-size: 3rem;"></i>
                    <p class="mt-3">No recurring expenses yet</p>
                    <p class="small">Click the Add button to create your first recurring expense</p>
                </div>
            ` : `
                <div class="list-group">
                    ${this.recurringExpenses.map(recurring => this.renderRecurringItem(recurring)).join('')}
                </div>
            `}
        `;

        // Attach event listeners
        this.attachEventListeners();
    }

    renderRecurringItem(recurring) {
        const categoryData = CategoryHelper.getCategoryData(recurring.category);
        const isActive = recurring.is_active;
        const hasEndDate = recurring.end_date !== null;
        const endDateStr = hasEndDate ? new Date(recurring.end_date).toLocaleDateString() : 'No end date';

        return `
            <div class="list-group-item ${!isActive ? 'opacity-50' : ''}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-2">
                            <span class="badge category-${recurring.category} me-2">
                                <i class="bi bi-${categoryData.icon}"></i>
                                ${categoryData.label}
                            </span>
                            <h6 class="mb-0">${recurring.description}</h6>
                        </div>
                        <div class="d-flex align-items-center gap-3 text-muted small">
                            <span>
                                <i class="bi bi-cash"></i>
                                <strong>${CurrencyHelper.format(recurring.amount)}</strong>
                            </span>
                            <span>
                                <i class="bi bi-arrow-repeat"></i>
                                ${this.formatFrequency(recurring)}
                            </span>
                            <span>
                                <i class="bi bi-calendar"></i>
                                ${endDateStr}
                            </span>
                        </div>
                        ${recurring.last_applied_date ? `
                            <div class="text-muted small mt-1">
                                Last applied: ${new Date(recurring.last_applied_date).toLocaleDateString()}
                            </div>
                        ` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <div class="form-check form-switch">
                            <input
                                class="form-check-input toggle-active"
                                type="checkbox"
                                ${isActive ? 'checked' : ''}
                                data-id="${recurring.id}"
                                data-active="${isActive}"
                                title="${isActive ? 'Deactivate' : 'Activate'}"
                            >
                        </div>
                        <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${recurring.id}">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${recurring.id}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Apply now button
        const applyBtn = this.querySelector('#apply-now-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyNow());
        }

        // Toggle switches
        this.querySelectorAll('.toggle-active').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const currentStatus = e.target.dataset.active === 'true';
                this.toggleActive(id, currentStatus);
            });
        });

        // Edit buttons
        this.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                const recurring = this.recurringExpenses.find(r => r.id == id);
                if (recurring) this.editRecurring(recurring);
            });
        });

        // Delete buttons
        this.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.deleteRecurring(id);
            });
        });
    }
}

customElements.define('recurring-list', RecurringList);
