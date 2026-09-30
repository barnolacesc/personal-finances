import { CONFIG, CategoryHelper, CurrencyHelper, TransactionTypeHelper, Utils } from './config.js';
import { ApiService, ErrorHandler } from './api-service.js';
import { BaseComponent, EventManager } from './event-manager.js';

class AddExpenseForm extends BaseComponent {
    constructor() {
        super();
        this.isSubmitting = false;
        this.editMode = false;
        this.editExpenseId = null;
        this.editData = null;
        this.selectedType = 'expense';
    }

    connectedCallback() {
        this.parseUrlParameters();
        this.render();
        this.setupEventListeners();
        if (this.editMode) {
            this.prefillForm();
        } else {
            // Set today's date by default for new expenses
            const today = new Date().toISOString().split('T')[0];
            this.querySelector('#date').value = today;
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
                description: urlParams.get('description'),
                date: urlParams.get('date'),
                type: urlParams.get('type') || 'expense'
            };
            this.selectedType = this.editData.type;
        }
    }

    render() {
        const categoryOptions = CategoryHelper.getAllCategories()
            .map(cat => `<option value="${cat}">${CategoryHelper.getCategoryLabel(cat)}</option>`)
            .join('');

        const typeLabel = TransactionTypeHelper.getTypeLabel(this.selectedType);
        const actionLabel = this.editMode ? `Update ${typeLabel}` : `Add ${typeLabel}`;

        this.innerHTML = `
            <form id="addExpenseForm" novalidate>
                <div class="mb-3">
                    <label class="form-label">Transaction Type</label>
                    <div class="transaction-type-selector">
                        <button type="button" class="type-btn ${this.selectedType === 'expense' ? 'active' : ''}" data-type="expense">
                            <span class="material-symbols-outlined">payments</span>
                            <span>Expense</span>
                        </button>
                        <button type="button" class="type-btn ${this.selectedType === 'income' ? 'active' : ''}" data-type="income">
                            <span class="material-symbols-outlined">savings</span>
                            <span>Income</span>
                        </button>
                        <button type="button" class="type-btn ${this.selectedType === 'reimbursement' ? 'active' : ''}" data-type="reimbursement">
                            <span class="material-symbols-outlined">assignment_return</span>
                            <span>Reimbursement</span>
                        </button>
                    </div>
                    <input type="hidden" id="transactionType" name="type" value="${this.selectedType}">
                </div>

                <div class="mb-3">
                    <label for="amount" class="form-label">Amount *</label>
                    <div class="input-group input-group-lg">
                        <span class="input-group-text">${CONFIG.CURRENCY.symbol}</span>
                        <input type="text"
                               class="form-control"
                               id="amount"
                               name="amount"
                               inputmode="decimal"
                               placeholder="0.00"
                               style="font-family: 'Manrope', sans-serif; font-size: 2rem; font-weight: 800; font-variant-numeric: tabular-nums;"
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

                <div class="mb-3">
                    <label for="date" class="form-label">Date *</label>
                    <input type="date"
                           class="form-control"
                           id="date"
                           name="date"
                           required>
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
                    <button type="button" class="btn btn-gradient" id="submitBtn" style="height: 56px; font-size: 1rem; font-weight: 700;">
                        <span class="btn-text d-flex align-items-center justify-content-center gap-2">
                            <span class="material-symbols-outlined">${this.editMode ? 'check' : 'add_circle'}</span>
                            ${actionLabel}
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
        this.addEventListenerWithCleanup(form, 'submit', (e) => {
            e.preventDefault();
            this.handleSubmit(e);
        });

        const submitBtn = this.querySelector('#submitBtn');
        this.addEventListenerWithCleanup(submitBtn, 'click', (e) => {
            e.preventDefault();
            // Create a fake event object to pass to handleSubmit since we bypassed the form
            const fakeEvent = {
                preventDefault: () => {},
                target: form
            };
            this.handleSubmit(fakeEvent);
        });

        const typeBtns = this.querySelectorAll('.type-btn');
        const typeInput = this.querySelector('#transactionType');
        typeBtns.forEach(btn => {
            this.addEventListenerWithCleanup(btn, 'click', () => {
                typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedType = btn.dataset.type;
                typeInput.value = this.selectedType;
                this.updateTypeUI(this.selectedType);
            });
        });

        const amountInput = this.querySelector('#amount');
        this.addEventListenerWithCleanup(amountInput, 'input', this.handleAmountInput.bind(this));

        if (this.editMode) {
            const deleteBtn = this.querySelector('#deleteBtn');
            this.addEventListenerWithCleanup(deleteBtn, 'click', this.handleDelete.bind(this));
        }

        // Lives in the success card, a sibling of this component in
        // add-expense.html, not inside it.
        const addAnotherBtn = document.getElementById('addAnotherBtn');
        if (addAnotherBtn) {
            this.addEventListenerWithCleanup(addAnotherBtn, 'click', () => {
                document.getElementById('successCard').classList.add('d-none');
                this.resetForm();
                this.scrollIntoView({ behavior: 'smooth' });
            });
        }

        amountInput.focus();
    }

    updateTypeUI(type) {
        const submitTextEl = this.querySelector('#submitBtn .btn-text');
        const descInput = this.querySelector('#description');
        const typeLabel = TransactionTypeHelper.getTypeLabel(type);
        if (submitTextEl) {
            const actionText = this.editMode ? `Update ${typeLabel}` : `Add ${typeLabel}`;
            submitTextEl.innerHTML = `
                <span class="material-symbols-outlined">${this.editMode ? 'check' : 'add_circle'}</span>
                ${actionText}
            `;
        }
        if (descInput) {
            if (type === 'income') {
                descInput.placeholder = 'e.g. Monthly salary, bonus, dividend';
            } else if (type === 'reimbursement') {
                descInput.placeholder = 'What was reimbursed? (e.g. race registration)';
            } else {
                descInput.placeholder = 'What did you buy?';
            }
        }
        const titleEl = document.getElementById('formTitle');
        const subtitleEl = document.getElementById('formSubtitle');
        if (titleEl && !this.editMode) {
            titleEl.textContent = `Add New ${typeLabel}`;
        }
        if (subtitleEl && !this.editMode) {
            subtitleEl.textContent = type === 'income' ? 'Track incoming funds' : type === 'reimbursement' ? 'Record a reimbursement' : 'Track your spending easily';
        }
    }

    prefillForm() {
        if (this.editData) {
            this.querySelector('#amount').value = this.editData.amount;
            this.querySelector('#category').value = this.editData.category;
            this.querySelector('#description').value = decodeURIComponent(this.editData.description);

            if (this.editData.type) {
                this.selectedType = this.editData.type;
                const typeInput = this.querySelector('#transactionType');
                if (typeInput) typeInput.value = this.selectedType;
                const typeBtns = this.querySelectorAll('.type-btn');
                typeBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.type === this.selectedType);
                });
                this.updateTypeUI(this.selectedType);
            }

            if (this.editData.date && this.editData.date !== 'undefined' && this.editData.date !== 'null') {
                // Parse the date to YYYY-MM-DD for the date input
                const d = new Date(this.editData.date);
                if (!isNaN(d)) {
                    this.querySelector('#date').value = d.toISOString().split('T')[0];
                }
            }

            const titleEl = document.getElementById('formTitle');
            const subtitleEl = document.getElementById('formSubtitle');
            const typeLabel = TransactionTypeHelper.getTypeLabel(this.selectedType);
            if (titleEl) titleEl.textContent = `Edit ${typeLabel}`;
            if (subtitleEl) subtitleEl.textContent = `Update your ${typeLabel.toLowerCase()} details`;

            document.title = `Edit ${typeLabel} - Vault`;
        }
    }

    handleAmountInput(e) {
        e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
    }

    async handleSubmit(e) {
        e.preventDefault();
        console.log('handleSubmit fired!');

        if (this.isSubmitting) return;

        const formData = new FormData(e.target);
        const amountStr = formData.get('amount');
        const category = formData.get('category');
        const description = formData.get('description');
        const dateVal = formData.get('date');

        if (!amountStr) {
            window.showToast('Please enter an amount', 'error');
            return;
        }
        if (!category) {
            window.showToast('Please select a category', 'error');
            return;
        }
        if (!description) {
            window.showToast('Please enter a description', 'error');
            return;
        }

        // Dismiss the mobile keyboard now, not after the request resolves.
        // Left focused, some mobile browsers keep the on-screen keyboard up
        // through the success-card transition, which can shift/hide the
        // fixed bottom nav underneath it and eat the next tap.
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        this.isSubmitting = true;
        this.setSubmittingState(true);

        const type = formData.get('type') || this.selectedType || 'expense';
        const data = {
            amount: CurrencyHelper.parseAmount(amountStr),
            category: category,
            description: description,
            date: dateVal,
            type: type
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

                window.showToast('Updated successfully', 'success');

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

        const txnType = expense.type || 'expense';

        expenseDetails.innerHTML = `
            <div class="card-vault" style="text-align: left;">
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Type</span>
                    <span class="badge type-badge type-${txnType}">
                        <span class="material-symbols-outlined" style="font-size: 0.875rem;">${TransactionTypeHelper.getTypeIcon(txnType)}</span>
                        ${TransactionTypeHelper.getTypeLabel(txnType)}
                    </span>
                </div>
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Amount</span>
                    <span class="fw-bold tabular-nums" style="color: var(--primary);">${CurrencyHelper.format(expense.amount)}</span>
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

        // The date input's default is set via JS in connectedCallback(), not
        // an HTML value attribute, so form.reset() clears it instead of
        // restoring today's date.
        const today = new Date().toISOString().split('T')[0];
        this.querySelector('#date').value = today;

        this.setSubmittingState(false);
        this.isSubmitting = false;

        this.querySelector('#amount').focus();
    }
}

customElements.define('add-expense-form', AddExpenseForm);
