import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';
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
                    <label for="amount" class="form-label fw-bold">Amount *</label>
                    <div class="input-group input-group-lg">
                        <span class="input-group-text">${CONFIG.CURRENCY.symbol}</span>
                        <input type="text"
                               class="form-control"
                               id="amount"
                               name="amount"
                               pattern="${CONFIG.VALIDATION.AMOUNT_PATTERN}"
                               inputmode="decimal"
                               placeholder="0.00"
                               required>
                    </div>
                </div>

                <div class="mb-3">
                    <label for="category" class="form-label fw-bold">Category *</label>
                    <select class="form-select form-select-lg" id="category" name="category" required>
                        <option value="">Choose a category...</option>
                        ${categoryOptions}
                    </select>
                </div>

                <div class="mb-4">
                    <label for="description" class="form-label fw-bold">Description *</label>
                    <input type="text"
                           class="form-control form-control-lg"
                           id="description"
                           name="description"
                           placeholder="What did you buy?"
                           maxlength="${CONFIG.VALIDATION.DESCRIPTION_MAX_LENGTH}"
                           required>
                </div>

                <div class="d-grid">
                    <button type="submit" class="btn btn-primary btn-lg" id="submitBtn">
                        <span class="btn-text">
                            <i class="bi bi-${this.editMode ? 'check-lg' : 'plus-circle'} me-2"></i>${this.editMode ? 'Update Expense' : 'Add Expense'}
                        </span>
                        <span class="btn-spinner d-none">
                            <div class="spinner-border spinner-border-sm me-2" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            ${this.editMode ? 'Updating...' : 'Adding...'}
                        </span>
                    </button>
                </div>
                ${this.editMode ? `
                <div class="d-grid mt-2">
                    <button type="button" class="btn btn-outline-danger" id="deleteBtn">
                        <i class="bi bi-trash me-2"></i>Delete Expense
                    </button>
                </div>
                ` : ''}
            </form>
        `;
    }

    setupEventListeners() {
        const form = this.querySelector('#addExpenseForm');
        this.addEventListenerWithCleanup(form, 'submit', this.handleSubmit.bind(this));

        // Add input handler for amount field
        const amountInput = this.querySelector('#amount');
        this.addEventListenerWithCleanup(amountInput, 'input', this.handleAmountInput.bind(this));

        // Add delete button listener if in edit mode
        if (this.editMode) {
            const deleteBtn = this.querySelector('#deleteBtn');
            this.addEventListenerWithCleanup(deleteBtn, 'click', this.handleDelete.bind(this));
        }

        // Auto-focus amount field
        amountInput.focus();
    }

    prefillForm() {
        if (this.editData) {
            this.querySelector('#amount').value = this.editData.amount;
            this.querySelector('#category').value = this.editData.category;
            this.querySelector('#description').value = decodeURIComponent(this.editData.description);

            // Update page title for edit mode
            const titleEl = document.getElementById('formTitle');
            const subtitleEl = document.getElementById('formSubtitle');
            if (titleEl) titleEl.textContent = 'Edit Expense';
            if (subtitleEl) subtitleEl.textContent = 'Update your expense details';

            // Update page title
            document.title = 'Edit Expense - Personal Finances';
        }
    }

    handleAmountInput(e) {
        // Only allow numbers, commas, and decimal points
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
                // Update existing expense
                const response = await fetch(`/api/expenses/${this.editExpenseId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error('Failed to update expense');
                result = await response.json();

                window.showToast('Expense updated successfully', 'success');

                // Redirect back to expenses page
                setTimeout(() => {
                    window.location.href = '/static/expenses.html';
                }, 1000);
            } else {
                // Create new expense
                result = await ApiService.createExpense(data);

                console.log('Expense creation result:', result);

                // Validate the result
                if (!result || !result.id) {
                    throw new Error('Invalid response from server');
                }

                // Show success state
                this.showSuccess(result);
            }

            // Emit event for any listening components
            EventManager.emitExpenseAdded(result);

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

            // Redirect back to expenses page
            setTimeout(() => {
                window.location.href = '/static/expenses.html';
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
        // Hide the form card
        document.querySelector('.modern-card.chart-container-modern').classList.add('d-none');

        // Show success card with expense details
        const successCard = document.getElementById('successCard');
        const expenseDetails = document.getElementById('expenseDetails');

        expenseDetails.innerHTML = `
            <div class="card bg-body-secondary">
                <div class="card-body">
                    <div class="row text-start">
                        <div class="col-6"><strong>Amount:</strong></div>
                        <div class="col-6 fw-bold text-primary">${CurrencyHelper.format(expense.amount)}</div>
                        <div class="col-6"><strong>Category:</strong></div>
                        <div class="col-6">
                            <span class="badge category-${expense.category}">
                                <i class="bi bi-${CategoryHelper.getCategoryIcon(expense.category)} me-1"></i>
                                ${CategoryHelper.getCategoryLabel(expense.category)}
                            </span>
                        </div>
                        <div class="col-6"><strong>Description:</strong></div>
                        <div class="col-6">${expense.description}</div>
                        <div class="col-6"><strong>Date:</strong></div>
                        <div class="col-6">${new Date(expense.date).toLocaleDateString()}</div>
                    </div>
                </div>
            </div>
        `;

        successCard.classList.remove('d-none');
        successCard.scrollIntoView({ behavior: 'smooth' });

        this.isSubmitting = false;
    }

    resetForm() {
        // Show the form card again
        document.querySelector('.modern-card.chart-container-modern').classList.remove('d-none');

        // Reset form
        const form = this.querySelector('#addExpenseForm');
        form.reset();

        // Reset button state
        this.setSubmittingState(false);
        this.isSubmitting = false;

        // Focus amount field
        this.querySelector('#amount').focus();
    }
}

customElements.define('add-expense-form', AddExpenseForm);
