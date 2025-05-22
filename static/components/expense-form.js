class ExpenseForm extends HTMLElement {
    constructor() {
        super();
        this.categories = [
            'super', 'xofa', 'food_drink', 'save_inv', 'recurrent',
            'clothing', 'personal', 'taxes', 'transport', 'health', 'other'
        ];
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    render() {
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
                                        <span class="input-group-text">€</span>
                                        <input type="text" 
                                               class="form-control" 
                                               id="amount" 
                                               name="amount" 
                                               pattern="[0-9]*[.,]?[0-9]*"
                                               inputmode="decimal"
                                               placeholder="0.00"
                                               required>
                                    </div>
                                </div>
                                <div class="col-sm-6">
                                    <label for="category" class="form-label">Category</label>
                                    <select class="form-select" id="category" name="category" required>
                                        <option value="">Select category...</option>
                                        ${this.categories.map(cat => `
                                            <option value="${cat}">${this.formatCategory(cat)}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div class="col-12">
                                    <label for="description" class="form-label">Description</label>
                                    <input type="text" 
                                           class="form-control" 
                                           id="description" 
                                           name="description" 
                                           maxlength="50" 
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

    formatCategory(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    setupEventListeners() {
        const form = this.querySelector('#expenseForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = {
                amount: parseFloat(formData.get('amount').replace(',', '.')),
                category: formData.get('category'),
                description: formData.get('description')
            };

            try {
                const response = await fetch('/api/expenses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    throw new Error('Failed to add expense');
                }

                form.reset();
                window.showToast('Expense added successfully', 'success');
                
                // Only dispatch to document to avoid double events
                const expenseAddedEvent = new CustomEvent('expenseadded', {
                    bubbles: true,
                    composed: true,
                    detail: { success: true }
                });
                document.dispatchEvent(expenseAddedEvent);
            } catch (error) {
                window.showToast('Failed to add expense', 'error');
                console.error('Error:', error);
            }
        });

        // Add input handler for amount field to handle commas
        const amountInput = this.querySelector('#amount');
        amountInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
        });
    }
}

customElements.define('expense-form', ExpenseForm); 