import { BaseComponent, EventManager } from './event-manager.js';
import { CONFIG, CategoryHelper } from './config.js';

class RecurringForm extends BaseComponent {
    constructor() {
        super();
        this.modal = null;
        this.mode = 'create'; // 'create' or 'edit'
        this.recurringData = null;
    }

    connectedCallback() {
        console.log('RecurringForm component connected');
        this.createModal();
        this.setupEventListeners();
    }

    setupEventListeners() {
        console.log('Setting up RecurringForm event listeners');
        this.listenToGlobalEvent('show-recurring-form', (event) => {
            console.log('show-recurring-form event received', event.detail);
            this.mode = event.detail.mode || 'create';
            this.recurringData = event.detail.recurring || null;
            this.showModal();
        });
    }

    showModal() {
        console.log('showModal called');
        const modalElement = document.getElementById('recurring-modal');
        if (!modalElement) {
            console.error('Modal element not found!');
            return;
        }

        if (!this.modal) {
            console.log('Creating Bootstrap modal');
            this.modal = new bootstrap.Modal(modalElement);
        }

        // Populate form if editing
        if (this.mode === 'edit' && this.recurringData) {
            this.populateForm(this.recurringData);
        } else {
            this.resetForm();
        }

        // Update modal title
        const modalTitle = document.getElementById('recurring-modal-title');
        modalTitle.textContent = this.mode === 'edit' ? 'Edit Recurring Expense' : 'Add Recurring Expense';

        console.log('Showing modal');
        this.modal.show();

        // Set focus to first input after modal is shown
        modalElement.addEventListener('shown.bs.modal', () => {
            const firstInput = document.getElementById('recurring-amount');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }, { once: true });
    }

    populateForm(data) {
        document.getElementById('recurring-amount').value = data.amount;
        document.getElementById('recurring-category').value = data.category;
        document.getElementById('recurring-description').value = data.description;
        document.getElementById('recurring-frequency').value = data.frequency;
        document.getElementById('recurring-day').value = data.day_of_month || '';

        // Format dates for input
        if (data.start_date) {
            const startDate = new Date(data.start_date);
            document.getElementById('recurring-start-date').value = startDate.toISOString().split('T')[0];
        }

        if (data.end_date) {
            const endDate = new Date(data.end_date);
            document.getElementById('recurring-end-date').value = endDate.toISOString().split('T')[0];
        } else {
            document.getElementById('recurring-end-date').value = '';
        }

        this.updateDayFieldLabel(data.frequency);
    }

    resetForm() {
        document.getElementById('recurring-form').reset();

        // Set default start date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('recurring-start-date').value = today;

        this.updateDayFieldLabel('monthly');
    }

    updateDayFieldLabel(frequency) {
        const dayField = document.getElementById('recurring-day');
        const dayLabel = document.querySelector('label[for="recurring-day"]');

        if (frequency === 'monthly') {
            dayLabel.textContent = 'Day of Month (1-31)';
            dayField.placeholder = 'e.g., 1 for 1st of month';
            dayField.min = '1';
            dayField.max = '31';
        } else if (frequency === 'weekly') {
            dayLabel.textContent = 'Day of Week (1=Mon, 7=Sun)';
            dayField.placeholder = 'e.g., 1 for Monday';
            dayField.min = '1';
            dayField.max = '7';
        } else if (frequency === 'yearly') {
            dayLabel.textContent = 'Day of Month';
            dayField.placeholder = 'e.g., 15';
            dayField.min = '1';
            dayField.max = '31';
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        const formData = {
            amount: parseFloat(document.getElementById('recurring-amount').value),
            category: document.getElementById('recurring-category').value,
            description: document.getElementById('recurring-description').value,
            frequency: document.getElementById('recurring-frequency').value,
            day_of_month: parseInt(document.getElementById('recurring-day').value) || null,
            start_date: document.getElementById('recurring-start-date').value,
            end_date: document.getElementById('recurring-end-date').value || null
        };

        try {
            let url = CONFIG.API.ENDPOINTS.RECURRING;
            let method = 'POST';

            if (this.mode === 'edit' && this.recurringData) {
                url = `${CONFIG.API.ENDPOINTS.RECURRING}/${this.recurringData.id}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save recurring expense');
            }

            const successMessage = this.mode === 'edit'
                ? 'Recurring expense updated'
                : 'Recurring expense added';

            EventManager.emitToastEvent('success', successMessage);

            // Emit event to refresh list
            const eventName = this.mode === 'edit' ? 'recurringupdated' : 'recurringadded';
            EventManager.emit(eventName);

            this.modal.hide();
            this.resetForm();

        } catch (error) {
            console.error('Error saving recurring expense:', error);
            EventManager.emitToastEvent('error', error.message);
        }
    }

    createModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('recurring-modal');
        if (existingModal) existingModal.remove();

        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal fade';
        modalDiv.id = 'recurring-modal';
        modalDiv.tabIndex = -1;
        modalDiv.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="recurring-modal-title">Add Recurring Expense</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="recurring-form">
                                <div class="mb-3">
                                    <label for="recurring-amount" class="form-label">Amount</label>
                                    <input
                                        type="number"
                                        class="form-control"
                                        id="recurring-amount"
                                        step="0.01"
                                        required
                                    >
                                </div>

                                <div class="mb-3">
                                    <label for="recurring-category" class="form-label">Category</label>
                                    <select class="form-select" id="recurring-category" required>
                                        ${CategoryHelper.getAllCategories().map(key => {
                                            const cat = CategoryHelper.getCategoryData(key);
                                            return `<option value="${key}">${cat.label}</option>`;
                                        }).join('')}
                                    </select>
                                </div>

                                <div class="mb-3">
                                    <label for="recurring-description" class="form-label">Description</label>
                                    <input
                                        type="text"
                                        class="form-control"
                                        id="recurring-description"
                                        maxlength="50"
                                        required
                                    >
                                </div>

                                <div class="mb-3">
                                    <label for="recurring-frequency" class="form-label">Frequency</label>
                                    <select class="form-select" id="recurring-frequency" required>
                                        <option value="monthly">Monthly</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="yearly">Yearly</option>
                                    </select>
                                </div>

                                <div class="mb-3">
                                    <label for="recurring-day" class="form-label">Day of Month (1-31)</label>
                                    <input
                                        type="number"
                                        class="form-control"
                                        id="recurring-day"
                                        min="1"
                                        max="31"
                                        placeholder="e.g., 1 for 1st of month"
                                    >
                                </div>

                                <div class="mb-3">
                                    <label for="recurring-start-date" class="form-label">Start Date</label>
                                    <input
                                        type="date"
                                        class="form-control"
                                        id="recurring-start-date"
                                        required
                                    >
                                </div>

                                <div class="mb-3">
                                    <label for="recurring-end-date" class="form-label">End Date (Optional)</label>
                                    <input
                                        type="date"
                                        class="form-control"
                                        id="recurring-end-date"
                                    >
                                    <div class="form-text">Leave empty for no end date</div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="recurring-submit-btn">
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Append to document body
        document.body.appendChild(modalDiv);

        // Attach form submission
        const submitBtn = modalDiv.querySelector('#recurring-submit-btn');
        const form = modalDiv.querySelector('#recurring-form');

        submitBtn.addEventListener('click', (e) => this.handleSubmit(e));
        form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Update day field label when frequency changes
        modalDiv.querySelector('#recurring-frequency').addEventListener('change', (e) => {
            this.updateDayFieldLabel(e.target.value);
        });
    }
}

customElements.define('recurring-form', RecurringForm);
