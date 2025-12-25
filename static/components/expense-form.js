import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';
import { ApiService, ErrorHandler } from './api-service.js';
import { BaseComponent, EventManager } from './event-manager.js';

class ExpenseForm extends BaseComponent {
    constructor() {
        super();
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        const categoryOptions = CategoryHelper.getAllCategories()
            .map(cat => `<option value="${cat}">${CategoryHelper.getCategoryLabel(cat)}</option>`)
            .join('');

        this.innerHTML = `
            <div class="card shadow-sm mb-4">
                <div class="card-header py-3">
                    <h5 class="mb-0">
                        <button class="btn btn-link text-decoration-none p-0 w-100 text-start d-flex justify-content-between align-items-center"
                                type="button"
                                data-bs-toggle="collapse"
                                data-bs-target="#expenseFormSection">
                            <span><i class="bi bi-plus-circle me-2"></i>Add New Expense</span>
                            <i class="bi bi-chevron-down"></i>
                        </button>
                    </h5>
                </div>
                <div id="expenseFormSection" class="collapse show">
                    <div class="card-body">
                        <form id="expenseForm">
                            <div class="row g-3">
                                <div class="col-sm-6">
                                    <label for="amount" class="form-label">Amount</label>
                                    <div class="input-group">
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
                                <div class="col-sm-6">
                                    <label for="category" class="form-label">Category</label>
                                    <select class="form-select" id="category" name="category" required>
                                        <option value="">Select category...</option>
                                        ${categoryOptions}
                                    </select>
                                </div>
                                <div class="col-12">
                                    <label for="description" class="form-label">Description</label>
                                    <input type="text"
                                           class="form-control"
                                           id="description"
                                           name="description"
                                           maxlength="${CONFIG.VALIDATION.DESCRIPTION_MAX_LENGTH}"
                                           required>
                                </div>
                                <div class="col-12">
                                    <button type="submit" class="btn btn-primary w-100">
                                        <i class="bi bi-plus-circle me-2"></i>Add Expense
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const form = this.querySelector('#expenseForm');
        this.addEventListenerWithCleanup(form, 'submit', this.handleSubmit.bind(this));

        // Add input handler for amount field to handle commas
        const amountInput = this.querySelector('#amount');
        this.addEventListenerWithCleanup(amountInput, 'input', this.handleAmountInput.bind(this));
    }

    handleAmountInput(e) {
        // Only allow numbers, commas, and decimal points
        e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
    }

    async handleSubmit(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const data = {
            amount: CurrencyHelper.parseAmount(formData.get('amount')),
            category: formData.get('category'),
            description: formData.get('description')
        };

        try {
            const result = await ApiService.createExpense(data);

            e.target.reset();
            window.showToast('Expense added successfully', 'success');

            // Emit event using the new event system
            EventManager.emitExpenseAdded(result);
        } catch (error) {
            ErrorHandler.handle(error, 'ExpenseForm.handleSubmit');
        }
    }
}

customElements.define('expense-form', ExpenseForm);
