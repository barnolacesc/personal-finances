import { CONFIG, CategoryHelper, CurrencyHelper , Utils} from './config.js';
import { ApiService, ErrorHandler } from './api-service.js';
import { BaseComponent, EventManager } from './event-manager.js';

class AddExpenseForm extends BaseComponent {
    constructor() {
        super();
        this.isSubmitting = false;
        this.editMode = false;
        this.editExpenseId = null;
        this.editData = null;
    }

    connectedCallback() {
        this.parseUrlParameters();
        this.render();
        this.setupEventListeners();
        if (this.editMode) {
            this.prefillForm();
        }
    }

    parseUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('edit')) {
            this.editMode = true;
            this.editExpenseId = urlParams.get('edit');
            this.editData = {
                amount: urlParams.get('amount'),
                category: urlParams.get('category'),
                description: urlParams.get('description')
            };
        }
    }

    render() {
        const categoryOptions = CategoryHelper.getAllCategories()
            .map(cat => `<option value="${cat}">${CategoryHelper.getCategoryLabel(cat)}</option>`)
            .join('');

        this.innerHTML = `
            <form id="addExpenseForm">
                <div class="mb-3">
                    <label for="amount" class="form-label">Amount *</label>
                    <div class="input-group input-group-lg">
                        <span class="input-group-text">${CONFIG.CURRENCY.symbol}</span>
                        <input type="text"
                               class="form-control"
                               id="amount"
                               name="amount"
                               pattern="${CONFIG.VALIDATION.AMOUNT_PATTERN}"
                               inputmode="decimal"
                               placeholder="0.00"
                               style="font-family: 'Manrope', sans-serif; font-size: 2rem; font-weight: 800;"
                               required>
                    </div>
                </div>

                <div class="mb-3">
                    <label for="category" class="form-label">Category *</label>
                    <select class="form-select" id="category" name="category" required>
                        <option value="">Choose a category...</option>
                        ${categoryOptions}
                    </select>
                </div>

                <div class="mb-4">
                    <label for="description" class="form-label">Description *</label>
                    <input type="text"
                           class="form-control"
                           id="description"
                           name="description"
                           placeholder="What did you buy?"
                           maxlength="${CONFIG.VALIDATION.DESCRIPTION_MAX_LENGTH}"
                           required>
                </div>

                <div class="d-grid">
                    <button type="submit" class="btn btn-gradient" id="submitBtn" style="height: 56px; font-size: 1rem; font-weight: 700;">
                        <span class="btn-text d-flex align-items-center justify-content-center gap-2">
                            <span class="material-symbols-outlined">${this.editMode ? 'check' : 'add_circle'}</span>
                            ${this.editMode ? 'Update Expense' : 'Add Expense'}
                        </span>
                        <span class="btn-spinner d-none d-flex align-items-center justify-content-center gap-2">
                            <span class="spinner-border spinner-border-sm"></span>
                            ${this.editMode ? 'Updating...' : 'Adding...'}
                        </span>
                    </button>
                </div>
                ${this.editMode ? `
                <div class="d-grid mt-2">
                    <button type="button" class="btn btn-outline-danger" id="deleteBtn">
                        <span class="material-symbols-outlined me-2" style="font-size: 1.125rem;">delete</span>Delete Expense
                    </button>
                </div>
                ` : ''}
            </form>
        `;
    }

    setupEventListeners() {
        const form = this.querySelector('#addExpenseForm');
        this.addEventListenerWithCleanup(form, 'submit', this.handleSubmit.bind(this));

        const amountInput = this.querySelector('#amount');
        this.addEventListenerWithCleanup(amountInput, 'input', this.handleAmountInput.bind(this));

        if (this.editMode) {
            const deleteBtn = this.querySelector('#deleteBtn');
            this.addEventListenerWithCleanup(deleteBtn, 'click', this.handleDelete.bind(this));
        }

        amountInput.focus();
    }

    prefillForm() {
        if (this.editData) {
            this.querySelector('#amount').value = this.editData.amount;
            this.querySelector('#category').value = this.editData.category;
            this.querySelector('#description').value = decodeURIComponent(this.editData.description);

            const titleEl = document.getElementById('formTitle');
            const subtitleEl = document.getElementById('formSubtitle');
            if (titleEl) titleEl.textContent = 'Edit Expense';
            if (subtitleEl) subtitleEl.textContent = 'Update your expense details';

            document.title = 'Edit Expense - Vault';
        }
    }

    handleAmountInput(e) {
        e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.isSubmitting) return;

        this.isSubmitting = true;
        this.setSubmittingState(true);

        const formData = new FormData(e.target);
        const data = {
            amount: CurrencyHelper.parseAmount(formData.get('amount')),
            category: formData.get('category'),
            description: formData.get('description')
        };

        try {
            let result;
            if (this.editMode) {
                const response = await fetch(`/api/expenses/${this.editExpenseId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error('Failed to update expense');
                result = await response.json();

                window.showToast('Expense updated successfully', 'success');

                setTimeout(() => {
                    window.location.href = '/expenses';
                }, 1000);
            } else {
                result = await ApiService.createExpense(data);

                if (!result || !result.id) {
                    throw new Error('Invalid response from server');
                }

                this.showSuccess(result);
            }

            try {
                EventManager.emitExpenseAdded(result);
            } catch (e) {
                console.warn('Could not emit expense added event:', e);
            }

        } catch (error) {
            console.error('Add/Edit expense error:', error);
            ErrorHandler.handle(error, 'AddExpenseForm.handleSubmit');
            this.setSubmittingState(false);
            this.isSubmitting = false;
        }
    }

    async handleDelete() {
        if (!confirm('Are you sure you want to delete this expense?')) {
            return;
        }

        try {
            const response = await fetch(`/api/expenses/${this.editExpenseId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete expense');

            window.showToast('Expense deleted successfully', 'success');

            setTimeout(() => {
                window.location.href = '/expenses';
            }, 1000);

        } catch (error) {
            console.error('Delete expense error:', error);
            window.showToast('Failed to delete expense', 'error');
        }
    }

    setSubmittingState(isSubmitting) {
        const submitBtn = this.querySelector('#submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnSpinner = submitBtn.querySelector('.btn-spinner');

        if (isSubmitting) {
            submitBtn.disabled = true;
            btnText.classList.add('d-none');
            btnSpinner.classList.remove('d-none');
        } else {
            submitBtn.disabled = false;
            btnText.classList.remove('d-none');
            btnSpinner.classList.add('d-none');
        }
    }

    showSuccess(expense) {
        const chartContainer = document.querySelector('.modern-card.chart-container-modern');
        if (chartContainer) {
            chartContainer.classList.add('d-none');
        }

        const successCard = document.getElementById('successCard');
        const expenseDetails = document.getElementById('expenseDetails');

        if (!successCard || !expenseDetails) {
            console.error('Success card elements not found');
            window.location.href = '/expenses';
            return;
        }

        expenseDetails.innerHTML = `
            <div class="card-vault" style="text-align: left;">
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Amount</span>
                    <span class="fw-bold" style="color: var(--primary);">${CurrencyHelper.format(expense.amount)}</span>
                </div>
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Category</span>
                    <span class="badge category-${expense.category}">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">${CategoryHelper.getCategoryIcon(expense.category)}</span>
                        ${CategoryHelper.getCategoryLabel(expense.category)}
                    </span>
                </div>
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Description</span>
                    <span>${Utils.escapeHTML(expense.description)}</span>
                </div>
                <div class="d-flex justify-content-between">
                    <span class="text-muted">Date</span>
                    <span>${new Date(expense.date).toLocaleDateString()}</span>
                </div>
            </div>
        `;

        successCard.classList.remove('d-none');
        successCard.scrollIntoView({ behavior: 'smooth' });

        this.isSubmitting = false;
    }

    resetForm() {
        const chartContainer = document.querySelector('.modern-card.chart-container-modern');
        if (chartContainer) {
            chartContainer.classList.remove('d-none');
        }

        const form = this.querySelector('#addExpenseForm');
        form.reset();

        this.setSubmittingState(false);
        this.isSubmitting = false;

        this.querySelector('#amount').focus();
    }
}

customElements.define('add-expense-form', AddExpenseForm);
