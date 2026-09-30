import { CONFIG, CategoryHelper, CurrencyHelper, Utils } from './config.js';
import { ApiService, ErrorHandler } from './api-service.js';
import { BaseComponent, EventManager } from './event-manager.js';

class AddExpenseForm extends BaseComponent {
    constructor() {
        super();
        this.isSubmitting = false;
        this.editMode = false;
        this.editExpenseId = null;
        this.editData = null;
        this.selectedCategory = 'food_drink';
        this.magicParsedData = null;
    }

    connectedCallback() {
        this.parseUrlParameters();
        this.render();
        this.setupEventListeners();
        if (this.editMode) {
            this.prefillForm();
        } else {
            const today = new Date().toISOString().split('T')[0];
            const dateInput = this.querySelector('#date');
            if (dateInput) dateInput.value = today;
            this.selectCategory('food_drink');
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
                date: urlParams.get('date')
            };
        }
    }

    render() {
        const categories = CategoryHelper.getAllCategories();
        const categoryOptions = categories
            .map(cat => `<option value="${cat}">${CategoryHelper.getCategoryLabel(cat)}</option>`)
            .join('');

        const categoryChipsHtml = categories.map(cat => {
            const data = CategoryHelper.getCategoryData(cat);
            return `
                <button type="button"
                        class="category-chip-btn ${cat === this.selectedCategory ? 'active' : ''}"
                        data-category="${cat}"
                        style="--active-cat-color: ${data.color};">
                    <span class="material-symbols-outlined cat-icon" style="color: ${data.color};">${data.icon}</span>
                    <span class="cat-label">${data.label}</span>
                </button>
            `;
        }).join('');

        this.innerHTML = `
            ${!this.editMode ? `
            <!-- Smart Magic Quick-Add Bar -->
            <div class="quick-magic-card">
                <div class="quick-magic-header">
                    <span class="text-label-sm d-flex align-items-center gap-1" style="color: var(--primary); font-weight: 700;">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">bolt</span>
                        Smart Natural Entry
                    </span>
                    <span class="text-muted" style="font-size: 0.75rem;">Type & Press Enter</span>
                </div>
                <div class="quick-magic-input-group">
                    <span class="material-symbols-outlined quick-magic-icon">auto_awesome</span>
                    <input type="text"
                           id="magicInput"
                           class="quick-magic-input"
                           placeholder="e.g. 14.50 lunch with team, or 45 mercadona"
                           autocomplete="off">
                    <button type="button" id="magicSubmitBtn" class="quick-magic-send-btn" title="Quick Log">
                        <span class="material-symbols-outlined" style="font-size: 1.125rem;">send</span>
                    </button>
                </div>
                <div id="magicPreviewChips" class="quick-preview-chips d-none">
                    <!-- Populated in real-time as user types -->
                </div>
            </div>
            ` : ''}

            <!-- Tactile Entry Form -->
            <form id="addExpenseForm" novalidate>
                <!-- Amount Field -->
                <div class="mb-3">
                    <label for="amount" class="form-label text-label-sm" style="color: var(--on-surface-variant);">
                        Amount *
                    </label>
                    <div class="input-group input-group-lg">
                        <span class="input-group-text" style="font-family: 'Manrope', sans-serif; font-size: 1.5rem; font-weight: 800; color: var(--primary);">
                            ${CONFIG.CURRENCY.symbol}
                        </span>
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

                <!-- 1-Tap Category Grid & Select Sync -->
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="form-label text-label-sm mb-0" style="color: var(--on-surface-variant);">
                            Category *
                        </label>
                        <span class="text-muted" style="font-size: 0.75rem;">1-tap select</span>
                    </div>
                    <div class="category-chips-grid" id="categoryChips">
                        ${categoryChipsHtml}
                    </div>
                    <!-- Select kept in DOM for backwards compatibility and screen readers -->
                    <select class="form-select d-none" id="category" name="category" required>
                        <option value="">Choose a category...</option>
                        ${categoryOptions}
                    </select>
                </div>

                <!-- Date & Quick Date Chips -->
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label for="date" class="form-label text-label-sm mb-0" style="color: var(--on-surface-variant);">
                            Date *
                        </label>
                        <div class="quick-date-chips mb-0">
                            <button type="button" class="quick-date-chip active" data-date="today">Today</button>
                            <button type="button" class="quick-date-chip" data-date="yesterday">Yesterday</button>
                        </div>
                    </div>
                    <input type="date"
                           class="form-control"
                           id="date"
                           name="date"
                           required>
                </div>

                <!-- Description Field -->
                <div class="mb-4">
                    <label for="description" class="form-label text-label-sm" style="color: var(--on-surface-variant);">
                        Description *
                    </label>
                    <input type="text"
                           class="form-control"
                           id="description"
                           name="description"
                           placeholder="What was this expense for?"
                           maxlength="${CONFIG.VALIDATION.DESCRIPTION_MAX_LENGTH}"
                           required>
                </div>

                <!-- Submit Button -->
                <div class="d-grid">
                    <button type="submit" class="btn btn-gradient" id="submitBtn" style="height: 56px; font-size: 1rem; font-weight: 700;">
                        <span class="btn-text d-flex align-items-center justify-content-center gap-2">
                            <span class="material-symbols-outlined">${this.editMode ? 'check' : 'add_circle'}</span>
                            ${this.editMode ? 'Update Expense' : 'Log Expense'}
                        </span>
                        <span class="btn-spinner d-none d-flex align-items-center justify-content-center gap-2">
                            <span class="spinner-border spinner-border-sm"></span>
                            ${this.editMode ? 'Updating...' : 'Saving...'}
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

        // Submit button click triggers form submit cleanly
        const submitBtn = this.querySelector('#submitBtn');
        if (submitBtn) {
            this.addEventListenerWithCleanup(submitBtn, 'click', (e) => {
                if (submitBtn.type !== 'submit') {
                    e.preventDefault();
                    this.handleSubmit(e);
                }
            });
        }

        // Magic input listeners
        const magicInput = this.querySelector('#magicInput');
        const magicBtn = this.querySelector('#magicSubmitBtn');
        if (magicInput) {
            this.addEventListenerWithCleanup(magicInput, 'input', () => this.handleMagicInput(magicInput.value));
            this.addEventListenerWithCleanup(magicInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleMagicSubmit();
                }
            });
        }
        if (magicBtn) {
            this.addEventListenerWithCleanup(magicBtn, 'click', () => this.handleMagicSubmit());
        }

        // Amount input formatting
        const amountInput = this.querySelector('#amount');
        this.addEventListenerWithCleanup(amountInput, 'input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
        });

        // Category chips selection
        const chipContainer = this.querySelector('#categoryChips');
        if (chipContainer) {
            this.addEventListenerWithCleanup(chipContainer, 'click', (e) => {
                const btn = e.target.closest('.category-chip-btn');
                if (btn) {
                    const cat = btn.getAttribute('data-category');
                    this.selectCategory(cat);
                }
            });
        }

        // Category select change syncs back to chips
        const categorySelect = this.querySelector('#category');
        if (categorySelect) {
            this.addEventListenerWithCleanup(categorySelect, 'change', (e) => {
                this.selectCategory(e.target.value, false);
            });
        }

        // Quick date chips
        const dateChips = this.querySelectorAll('.quick-date-chip');
        const dateInput = this.querySelector('#date');
        dateChips.forEach(chip => {
            this.addEventListenerWithCleanup(chip, 'click', () => {
                dateChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const mode = chip.getAttribute('data-date');
                const d = new Date();
                if (mode === 'yesterday') {
                    d.setDate(d.getDate() - 1);
                }
                dateInput.value = d.toISOString().split('T')[0];
            });
        });

        if (this.editMode) {
            const deleteBtn = this.querySelector('#deleteBtn');
            if (deleteBtn) {
                this.addEventListenerWithCleanup(deleteBtn, 'click', () => this.handleDelete());
            }
        }

        // Legacy compatibility button in add-expense.html success card
        const addAnotherBtn = document.getElementById('addAnotherBtn');
        if (addAnotherBtn) {
            this.addEventListenerWithCleanup(addAnotherBtn, 'click', () => {
                const card = document.getElementById('successCard');
                if (card) card.classList.add('d-none');
                const chartContainer = document.querySelector('.modern-card.chart-container-modern');
                if (chartContainer) chartContainer.classList.remove('d-none');
                this.resetForm();
                this.scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Focus initial field
        if (!this.editMode) {
            if (magicInput) {
                magicInput.focus();
            } else if (amountInput) {
                amountInput.focus();
            }
        }
    }

    selectCategory(catKey, updateSelect = true) {
        this.selectedCategory = catKey;
        const chips = this.querySelectorAll('.category-chip-btn');
        chips.forEach(chip => {
            if (chip.getAttribute('data-category') === catKey) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });

        if (updateSelect) {
            const categorySelect = this.querySelector('#category');
            if (categorySelect) categorySelect.value = catKey;
        }
    }

    handleMagicInput(rawText) {
        const previewContainer = this.querySelector('#magicPreviewChips');
        if (!previewContainer) return;

        const text = rawText.trim();
        if (!text) {
            previewContainer.classList.add('d-none');
            previewContainer.innerHTML = '';
            this.magicParsedData = null;
            return;
        }

        // Fast client-side regex parsing
        const amountMatch = text.match(/(?:[€$£]\s*)?(\b\d+(?:[.,]\d{1,2})?\b)(?:\s*(?:[€$£]|eur|euros?))?/i);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

        let working = text;
        if (amountMatch) {
            working = working.replace(amountMatch[0], ' ');
        }

        let isYesterday = /\b(yesterday|ayer)\b/i.test(working);
        working = working.replace(/\b(yesterday|ayer|today|hoy)\b/gi, ' ').trim();

        const detectedCategory = CategoryHelper.matchCategoryFromText(text);
        const desc = working || (detectedCategory !== 'other' ? CategoryHelper.getCategoryLabel(detectedCategory) : 'Expense');
        const catData = CategoryHelper.getCategoryData(detectedCategory);

        this.magicParsedData = {
            amount: amount,
            category: detectedCategory,
            description: desc.charAt(0).toUpperCase() + desc.slice(1),
            date: isYesterday
                ? new Date(Date.now() - 86400000).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0]
        };

        previewContainer.classList.remove('d-none');
        previewContainer.innerHTML = `
            ${amount !== null ? `
            <span class="preview-chip amount">
                <span class="material-symbols-outlined" style="font-size: 0.875rem;">payments</span>
                ${CurrencyHelper.format(amount)}
            </span>` : `
            <span class="preview-chip" style="opacity: 0.6;">
                <span class="material-symbols-outlined" style="font-size: 0.875rem;">help</span>
                Enter amount
            </span>`}

            <span class="preview-chip" style="color: ${catData.color}; border-color: ${catData.color}40;">
                <span class="material-symbols-outlined" style="font-size: 0.875rem;">${catData.icon}</span>
                ${catData.label}
            </span>

            <span class="preview-chip">
                <span class="material-symbols-outlined" style="font-size: 0.875rem;">description</span>
                ${Utils.escapeHTML(this.magicParsedData.description)}
            </span>

            <span class="preview-chip">
                <span class="material-symbols-outlined" style="font-size: 0.875rem;">calendar_today</span>
                ${isYesterday ? 'Yesterday' : 'Today'}
            </span>
        `;
    }

    async handleMagicSubmit() {
        const magicInput = this.querySelector('#magicInput');
        if (!magicInput || !magicInput.value.trim()) return;

        const text = magicInput.value.trim();
        if (this.isSubmitting) return;

        this.isSubmitting = true;
        const magicBtn = this.querySelector('#magicSubmitBtn');
        if (magicBtn) magicBtn.disabled = true;

        try {
            const result = await ApiService.quickAddExpense({ text: text });
            if (!result || !result.id) throw new Error('Invalid response from server');

            window.showToast(`Logged €${result.amount.toFixed(2)} for ${result.description}`, 'success');
            magicInput.value = '';
            this.handleMagicInput('');

            try {
                EventManager.emitExpenseAdded(result);
            } catch (e) {
                console.warn('Could not emit event:', e);
            }

            this.resetForm();
            magicInput.focus();
        } catch (error) {
            console.error('Magic quick-add error:', error);
            // If amount missing in text, prefill manual form for quick completion
            if (this.magicParsedData && this.magicParsedData.amount === null) {
                window.showToast('Please specify the amount in the form below', 'info');
                this.querySelector('#description').value = this.magicParsedData.description;
                this.selectCategory(this.magicParsedData.category);
                this.querySelector('#amount').focus();
            } else {
                ErrorHandler.handle(error, 'AddExpenseForm.handleMagicSubmit');
            }
        } finally {
            this.isSubmitting = false;
            if (magicBtn) magicBtn.disabled = false;
        }
    }

    prefillForm() {
        if (this.editData) {
            const amountInput = this.querySelector('#amount');
            const descInput = this.querySelector('#description');
            const dateInput = this.querySelector('#date');

            if (amountInput) amountInput.value = this.editData.amount;
            if (descInput) descInput.value = decodeURIComponent(this.editData.description);
            if (this.editData.category) this.selectCategory(this.editData.category);

            if (this.editData.date && this.editData.date !== 'undefined' && this.editData.date !== 'null') {
                const d = new Date(this.editData.date);
                if (!isNaN(d) && dateInput) {
                    dateInput.value = d.toISOString().split('T')[0];
                }
            }

            const titleEl = document.getElementById('formTitle');
            const subtitleEl = document.getElementById('formSubtitle');
            if (titleEl) titleEl.textContent = 'Edit Expense';
            if (subtitleEl) subtitleEl.textContent = 'Update your expense details';
            document.title = 'Edit Expense - Vault';
        }
    }

    async handleSubmit(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (this.isSubmitting) return;

        const amountInput = this.querySelector('#amount');
        const descInput = this.querySelector('#description');
        const dateInput = this.querySelector('#date');
        const categorySelect = this.querySelector('#category');

        const amountStr = amountInput ? amountInput.value.trim() : '';
        const category = this.selectedCategory || (categorySelect ? categorySelect.value : '');
        const description = descInput ? descInput.value.trim() : '';
        const dateVal = dateInput ? dateInput.value : '';

        if (!amountStr) {
            window.showToast('Please enter an amount', 'error');
            if (amountInput) amountInput.focus();
            return;
        }
        if (!category) {
            window.showToast('Please select a category', 'error');
            return;
        }
        if (!description) {
            window.showToast('Please enter a description', 'error');
            if (descInput) descInput.focus();
            return;
        }

        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        this.isSubmitting = true;
        this.setSubmittingState(true);

        const data = {
            amount: CurrencyHelper.parseAmount(amountStr),
            category: category,
            description: description,
            date: dateVal
        };

        try {
            let result;
            if (this.editMode) {
                result = await ApiService.updateExpense(this.editExpenseId, data);
                window.showToast('Expense updated successfully', 'success');
                setTimeout(() => {
                    window.location.href = '/expenses';
                }, 800);
            } else {
                result = await ApiService.createExpense(data);
                if (!result || !result.id) throw new Error('Invalid response from server');

                window.showToast(`Logged ${CurrencyHelper.format(result.amount)} (${CategoryHelper.getCategoryLabel(result.category)})`, 'success');

                try {
                    EventManager.emitExpenseAdded(result);
                } catch (err) {
                    console.warn('Could not emit expenseadded:', err);
                }

                this.resetForm();

                // Check for test suite success card on /static/add-expense.html
                const successCard = document.getElementById('successCard');
                if (successCard) {
                    this.showSuccessCard(result);
                } else {
                    if (amountInput) amountInput.focus();
                }
            }
        } catch (error) {
            console.error('Submit error:', error);
            ErrorHandler.handle(error, 'AddExpenseForm.handleSubmit');
        } finally {
            this.setSubmittingState(false);
            this.isSubmitting = false;
        }
    }

    async handleDelete() {
        if (!confirm('Are you sure you want to delete this expense?')) return;
        try {
            await ApiService.deleteExpense(this.editExpenseId);
            window.showToast('Expense deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = '/expenses';
            }, 800);
        } catch (error) {
            console.error('Delete error:', error);
            window.showToast('Failed to delete expense', 'error');
        }
    }

    setSubmittingState(isSubmitting) {
        const submitBtn = this.querySelector('#submitBtn');
        if (!submitBtn) return;
        const btnText = submitBtn.querySelector('.btn-text');
        const btnSpinner = submitBtn.querySelector('.btn-spinner');

        if (isSubmitting) {
            submitBtn.disabled = true;
            if (btnText) btnText.classList.add('d-none');
            if (btnSpinner) btnSpinner.classList.remove('d-none');
        } else {
            submitBtn.disabled = false;
            if (btnText) btnText.classList.remove('d-none');
            if (btnSpinner) btnSpinner.classList.add('d-none');
        }
    }

    showSuccessCard(expense) {
        const successCard = document.getElementById('successCard');
        const expenseDetails = document.getElementById('expenseDetails');
        if (successCard && expenseDetails) {
            const chartContainer = document.querySelector('.modern-card.chart-container-modern');
            if (chartContainer) chartContainer.classList.add('d-none');

            expenseDetails.innerHTML = `
                <div class="p-3 mb-3" style="background: var(--surface-container-high); border-radius: 0.75rem; border: 1px solid var(--outline-variant);">
                    <div class="row g-2 text-start">
                        <div class="col-6 text-muted font-label">Amount:</div>
                        <div class="col-6 fw-bold text-end" style="color: var(--primary); font-family: 'Manrope', sans-serif;">${CurrencyHelper.format(expense.amount)}</div>
                        <div class="col-6 text-muted font-label">Category:</div>
                        <div class="col-6 text-end">${CategoryHelper.getCategoryLabel(expense.category)}</div>
                        <div class="col-6 text-muted font-label">Description:</div>
                        <div class="col-6 text-end text-truncate">${Utils.escapeHTML(expense.description)}</div>
                    </div>
                </div>
            `;
            successCard.classList.remove('d-none');
        }
    }

    resetForm() {
        const amountInput = this.querySelector('#amount');
        const descInput = this.querySelector('#description');
        const magicInput = this.querySelector('#magicInput');
        const dateInput = this.querySelector('#date');

        if (amountInput) amountInput.value = '';
        if (descInput) descInput.value = '';
        if (magicInput) magicInput.value = '';
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        const dateChips = this.querySelectorAll('.quick-date-chip');
        dateChips.forEach(chip => {
            if (chip.getAttribute('data-date') === 'today') {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });

        const previewContainer = this.querySelector('#magicPreviewChips');
        if (previewContainer) {
            previewContainer.classList.add('d-none');
            previewContainer.innerHTML = '';
        }
        this.magicParsedData = null;
    }
}

customElements.define('add-expense-form', AddExpenseForm);
