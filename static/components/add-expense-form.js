import { CONFIG, CategoryHelper, CurrencyHelper, Utils } from './config.js';
import { ApiService, ErrorHandler } from './api-service.js';
import { BaseComponent, EventManager } from './event-manager.js';

class AddExpenseForm extends BaseComponent {
    constructor() {
        super();
        this.currentStep = 1;
        this.isSubmitting = false;
        this.editMode = false;
        this.editExpenseId = null;
        this.editData = null;

        this.expenseName = '';
        this.expenseAmount = '';
        this.expenseCategory = 'food_drink';
        this.expenseDateMode = 'today'; // 'today' or 'yesterday'
        this.expenseDateVal = new Date().toISOString().split('T')[0];
    }

    connectedCallback() {
        this.parseUrlParameters();
        this.render();
        this.setupEventListeners();
        if (this.editMode) {
            this.prefillForm();
        } else {
            this.goToStep(1, false);
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

        const miniCategoryChipsHtml = categories.map(cat => {
            const data = CategoryHelper.getCategoryData(cat);
            return `
                <button type="button"
                        class="mini-category-chip ${cat === this.expenseCategory ? 'active' : ''}"
                        data-category="${cat}"
                        style="--chip-cat-color: ${data.color};">
                    <span class="material-symbols-outlined mini-cat-icon">${data.icon}</span>
                    <span class="mini-cat-label">${data.label}</span>
                </button>
            `;
        }).join('');

        this.innerHTML = `
            <div class="expense-book-card">
                <!-- Book Stepper Header -->
                <div class="book-header">
                    <div class="book-progress-bar">
                        <span class="book-progress-seg active" id="progSeg1"></span>
                        <span class="book-progress-seg" id="progSeg2"></span>
                        <span class="book-progress-seg" id="progSeg3"></span>
                    </div>
                    <div class="book-nav-row">
                        <button type="button" class="book-back-btn d-none" id="bookBackBtn">
                            <span class="material-symbols-outlined" style="font-size: 0.875rem;">arrow_back</span>
                            <span id="bookBackText">Back</span>
                        </button>
                        <div class="book-step-title" id="bookStepTitle">Step 1: What was it?</div>
                        <button type="button" class="book-date-toggle" id="bookDateToggle">
                            <span class="material-symbols-outlined" style="font-size: 0.875rem;">calendar_today</span>
                            <span id="bookDateLabel">Today</span>
                        </button>
                    </div>
                </div>

                <!-- Book Pages Viewport -->
                <div class="book-pages-viewport">
                    <div class="book-pages-track" id="bookPagesTrack">

                        <!-- Page 1: Description / Name -->
                        <div class="book-page" data-page="1">
                            <div class="book-input-wrapper">
                                <span class="material-symbols-outlined book-input-icon">shopping_bag</span>
                                <input type="text"
                                       id="bookNameInput"
                                       class="book-text-input"
                                       placeholder="What did you buy? (e.g. Coffee, Lunch)"
                                       autocomplete="off">
                            </div>
                            <!-- Quick Thumb Chips -->
                            <div class="book-quick-chips" id="thumbChipsContainer">
                                <button type="button" class="thumb-chip" data-name="Coffee" data-cat="food_drink">☕ Coffee</button>
                                <button type="button" class="thumb-chip" data-name="Lunch" data-cat="food_drink">🍔 Lunch</button>
                                <button type="button" class="thumb-chip" data-name="Mercadona" data-cat="super">🛒 Super</button>
                                <button type="button" class="thumb-chip" data-name="Uber" data-cat="transport">🚕 Transport</button>
                                <button type="button" class="thumb-chip" data-name="Beer" data-cat="food_drink">🍺 Drink</button>
                                <button type="button" class="thumb-chip" data-name="Pharmacy" data-cat="health">💊 Health</button>
                                <button type="button" class="thumb-chip" data-name="Bills" data-cat="recurrent">⚡ Bill</button>
                            </div>
                            <div class="d-grid mt-3">
                                <button type="button" class="btn btn-primary book-action-btn" id="btnNextToAmount">
                                    Next: Amount &rarr;
                                </button>
                            </div>
                        </div>

                        <!-- Page 2: Value / Amount -->
                        <div class="book-page" data-page="2">
                            <div class="book-amount-display">
                                <span class="book-currency-symbol">${CONFIG.CURRENCY.symbol}</span>
                                <input type="text"
                                       id="bookAmountInput"
                                       class="book-amount-input tabular-nums"
                                       inputmode="decimal"
                                       placeholder="0.00">
                            </div>
                            <!-- Quick Increments -->
                            <div class="book-quick-amounts" id="amountPresets">
                                <button type="button" class="amount-preset-chip" data-amt="5">+5€</button>
                                <button type="button" class="amount-preset-chip" data-amt="10">+10€</button>
                                <button type="button" class="amount-preset-chip" data-amt="20">+20€</button>
                                <button type="button" class="amount-preset-chip" data-amt="50">+50€</button>
                            </div>
                            <div class="d-grid mt-3">
                                <button type="button" class="btn btn-primary book-action-btn" id="btnNextToCategory">
                                    Next: Category &rarr;
                                </button>
                            </div>
                        </div>

                        <!-- Page 3: Category & Commit -->
                        <div class="book-page" data-page="3">
                            <div class="book-summary-pill mb-2">
                                <span id="summaryName">Item</span> &bull; <strong id="summaryAmount" style="color: var(--primary);">€0.00</strong>
                            </div>
                            <!-- Compact Mini Category Chips Grid (3 cols, small 14px icons) -->
                            <div class="compact-category-grid" id="compactCategoryGrid">
                                ${miniCategoryChipsHtml}
                            </div>
                            <div class="d-grid mt-2">
                                <button type="button" class="btn btn-gradient book-action-btn" id="btnFinalLog">
                                    <span class="material-symbols-outlined" style="font-size: 1.125rem;">check_circle</span>
                                    ${this.editMode ? 'Update Expense' : 'Log Expense'}
                                </button>
                            </div>
                            ${this.editMode ? `
                            <div class="d-grid mt-2">
                                <button type="button" class="btn btn-outline-danger btn-sm" id="btnDeleteExpense">Delete Expense</button>
                            </div>
                            ` : ''}
                        </div>

                        <!-- Page 4: Success State -->
                        <div class="book-page book-success-page" data-page="4">
                            <div class="d-inline-flex align-items-center justify-content-center mb-2"
                                 style="width: 48px; height: 48px; background: rgba(16, 185, 129, 0.15); border-radius: 50%;">
                                <span class="material-symbols-outlined" style="font-size: 2rem; color: #10b981;">check_circle</span>
                            </div>
                            <h6 class="mb-1 font-headline" style="color: #10b981;">Expense Logged!</h6>
                            <div class="text-muted" style="font-size: 0.8125rem;" id="successSummaryText"></div>
                        </div>

                    </div>
                </div>

                <!-- Hidden inputs for automated test suite & form sync -->
                <form id="addExpenseForm" style="display: none;" novalidate>
                    <input type="text" id="amount" name="amount">
                    <select id="category" name="category">${categoryOptions}</select>
                    <input type="text" id="description" name="description">
                    <input type="date" id="date" name="date">
                    <button type="submit" id="submitBtn"></button>
                </form>
            </div>
        `;
    }

    setupEventListeners() {
        const form = this.querySelector('#addExpenseForm');
        this.addEventListenerWithCleanup(form, 'submit', (e) => {
            e.preventDefault();
            this.handleFinalSubmit();
        });

        // Step 1: Name input and Enter key
        const nameInput = this.querySelector('#bookNameInput');
        if (nameInput) {
            this.addEventListenerWithCleanup(nameInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.goToStep(2);
                }
            });
        }

        // Thumb chips on Step 1
        const thumbChips = this.querySelector('#thumbChipsContainer');
        if (thumbChips) {
            this.addEventListenerWithCleanup(thumbChips, 'click', (e) => {
                const btn = e.target.closest('.thumb-chip');
                if (btn) {
                    const name = btn.getAttribute('data-name');
                    const cat = btn.getAttribute('data-cat');
                    nameInput.value = name;
                    this.expenseName = name;
                    if (cat) this.selectCategory(cat);
                    this.goToStep(2);
                }
            });
        }

        const nextToAmount = this.querySelector('#btnNextToAmount');
        if (nextToAmount) {
            this.addEventListenerWithCleanup(nextToAmount, 'click', () => this.goToStep(2));
        }

        // Step 2: Amount input and Enter key
        const amountInput = this.querySelector('#bookAmountInput');
        if (amountInput) {
            this.addEventListenerWithCleanup(amountInput, 'input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
            });
            this.addEventListenerWithCleanup(amountInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.goToStep(3);
                }
            });
        }

        // Preset amount additions on Step 2
        const presets = this.querySelector('#amountPresets');
        if (presets) {
            this.addEventListenerWithCleanup(presets, 'click', (e) => {
                const btn = e.target.closest('.amount-preset-chip');
                if (btn) {
                    const addVal = parseFloat(btn.getAttribute('data-amt')) || 0;
                    const cur = parseFloat(amountInput.value.replace(',', '.')) || 0;
                    amountInput.value = (cur + addVal).toFixed(2);
                }
            });
        }

        const nextToCategory = this.querySelector('#btnNextToCategory');
        if (nextToCategory) {
            this.addEventListenerWithCleanup(nextToCategory, 'click', () => this.goToStep(3));
        }

        // Step 3: Compact category chips selection
        const categoryGrid = this.querySelector('#compactCategoryGrid');
        if (categoryGrid) {
            this.addEventListenerWithCleanup(categoryGrid, 'click', (e) => {
                const btn = e.target.closest('.mini-category-chip');
                if (btn) {
                    const cat = btn.getAttribute('data-category');
                    this.selectCategory(cat);
                }
            });
        }

        // Final Log button on Step 3
        const finalBtn = this.querySelector('#btnFinalLog');
        if (finalBtn) {
            this.addEventListenerWithCleanup(finalBtn, 'click', () => this.handleFinalSubmit());
        }

        // Back button
        const backBtn = this.querySelector('#bookBackBtn');
        if (backBtn) {
            this.addEventListenerWithCleanup(backBtn, 'click', () => {
                if (this.currentStep > 1) {
                    this.goToStep(this.currentStep - 1);
                }
            });
        }

        // Date toggle (Today / Yesterday)
        const dateToggle = this.querySelector('#bookDateToggle');
        if (dateToggle) {
            this.addEventListenerWithCleanup(dateToggle, 'click', () => this.toggleDate());
        }

        // Delete button for edit mode
        const deleteBtn = this.querySelector('#btnDeleteExpense');
        if (deleteBtn) {
            this.addEventListenerWithCleanup(deleteBtn, 'click', () => this.handleDelete());
        }

        // Sync external automated test interactions with `#submitBtn`
        const submitBtn = this.querySelector('#submitBtn');
        if (submitBtn) {
            this.addEventListenerWithCleanup(submitBtn, 'click', (e) => {
                e.preventDefault();
                // Pull values from hidden test inputs if they were filled directly
                const testAmount = this.querySelector('#amount').value;
                const testDesc = this.querySelector('#description').value;
                const testCat = this.querySelector('#category').value;
                if (testAmount) this.querySelector('#bookAmountInput').value = testAmount;
                if (testDesc) this.querySelector('#bookNameInput').value = testDesc;
                if (testCat) this.selectCategory(testCat);
                this.handleFinalSubmit();
            });
        }
    }

    goToStep(step, focusInput = true) {
        this.currentStep = step;
        const track = this.querySelector('#bookPagesTrack');
        const seg1 = this.querySelector('#progSeg1');
        const seg2 = this.querySelector('#progSeg2');
        const seg3 = this.querySelector('#progSeg3');
        const backBtn = this.querySelector('#bookBackBtn');
        const title = this.querySelector('#bookStepTitle');

        // Slide the pages track like a book page
        if (track) {
            const offset = (step - 1) * -25;
            track.style.transform = `translateX(${offset}%)`;
        }

        // Update progress bar
        if (seg1 && seg2 && seg3) {
            seg1.className = 'book-progress-seg' + (step >= 1 ? (step > 1 ? ' completed' : ' active') : '');
            seg2.className = 'book-progress-seg' + (step >= 2 ? (step > 2 ? ' completed' : ' active') : '');
            seg3.className = 'book-progress-seg' + (step >= 3 ? (step > 3 ? ' completed' : ' active') : '');
        }

        // Step-specific logic
        if (step === 1) {
            if (backBtn) backBtn.classList.add('d-none');
            if (title) title.textContent = 'Step 1: What was it?';
            const nameInput = this.querySelector('#bookNameInput');
            if (focusInput && nameInput) nameInput.focus();
        } else if (step === 2) {
            const nameInput = this.querySelector('#bookNameInput');
            this.expenseName = nameInput ? nameInput.value.trim() : '';
            if (!this.expenseName) {
                window.showToast('Please enter what you bought', 'error');
                this.goToStep(1);
                return;
            }

            // Auto-detect category from description
            const autoCat = CategoryHelper.matchCategoryFromText(this.expenseName);
            if (autoCat !== 'other') {
                this.selectCategory(autoCat);
            }

            if (backBtn) backBtn.classList.remove('d-none');
            if (title) title.textContent = 'Step 2: How much?';
            const amountInput = this.querySelector('#bookAmountInput');
            if (focusInput && amountInput) amountInput.focus();
        } else if (step === 3) {
            const amountInput = this.querySelector('#bookAmountInput');
            const amtStr = amountInput ? amountInput.value.trim() : '';
            const amtVal = parseFloat(amtStr.replace(',', '.'));
            if (!amtStr || isNaN(amtVal) || amtVal <= 0) {
                window.showToast('Please enter a valid amount', 'error');
                this.goToStep(2);
                return;
            }
            this.expenseAmount = amtVal;

            if (backBtn) backBtn.classList.remove('d-none');
            if (title) title.textContent = 'Step 3: Category';

            const summaryName = this.querySelector('#summaryName');
            const summaryAmount = this.querySelector('#summaryAmount');
            if (summaryName) summaryName.textContent = this.expenseName || 'Expense';
            if (summaryAmount) summaryAmount.textContent = CurrencyHelper.format(this.expenseAmount);
        }
    }

    selectCategory(catKey) {
        this.expenseCategory = catKey;
        const chips = this.querySelectorAll('.mini-category-chip');
        chips.forEach(chip => {
            if (chip.getAttribute('data-category') === catKey) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });

        const catSelect = this.querySelector('#category');
        if (catSelect) catSelect.value = catKey;
    }

    toggleDate() {
        const label = this.querySelector('#bookDateLabel');
        const d = new Date();
        if (this.expenseDateMode === 'today') {
            this.expenseDateMode = 'yesterday';
            d.setDate(d.getDate() - 1);
            if (label) label.textContent = 'Yesterday';
        } else {
            this.expenseDateMode = 'today';
            if (label) label.textContent = 'Today';
        }
        this.expenseDateVal = d.toISOString().split('T')[0];
    }

    async handleFinalSubmit() {
        if (this.isSubmitting) return;

        const nameInput = this.querySelector('#bookNameInput');
        const amountInput = this.querySelector('#bookAmountInput');

        const description = nameInput ? nameInput.value.trim() : this.expenseName;
        const amountStr = amountInput ? amountInput.value.trim() : String(this.expenseAmount);
        const amount = parseFloat(amountStr.replace(',', '.'));
        const category = this.expenseCategory || 'other';
        const dateVal = this.expenseDateVal;

        if (!description) {
            this.goToStep(1);
            window.showToast('Please enter what you bought', 'error');
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            this.goToStep(2);
            window.showToast('Please enter a valid amount', 'error');
            return;
        }

        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        this.isSubmitting = true;
        const finalBtn = this.querySelector('#btnFinalLog');
        if (finalBtn) finalBtn.disabled = true;

        const data = {
            amount: amount,
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
                    window.location.href = '/';
                }, 600);
            } else {
                result = await ApiService.createExpense(data);
                if (!result || !result.id) throw new Error('Invalid response from server');

                // Broadcast event immediately so timeline below updates
                try {
                    EventManager.emitExpenseAdded(result);
                } catch (e) {
                    console.warn('Event emit warning:', e);
                }

                // Show step 4 celebration flip
                const successSummary = this.querySelector('#successSummaryText');
                if (successSummary) {
                    successSummary.textContent = `${CurrencyHelper.format(result.amount)} for ${result.description}`;
                }
                this.goToStep(4, false);

                window.showToast(`Logged ${CurrencyHelper.format(result.amount)}`, 'success');

                // Check for test suite #successCard on /static/add-expense.html
                const testSuccessCard = document.getElementById('successCard');
                const testDetails = document.getElementById('expenseDetails');
                if (testSuccessCard && testDetails) {
                    testDetails.innerHTML = `<p>${result.description} - ${CurrencyHelper.format(result.amount)}</p>`;
                    testSuccessCard.classList.remove('d-none');
                }

                // Smoothly reset back to step 1 after 0.8s
                setTimeout(() => {
                    this.resetBook();
                }, 850);
            }
        } catch (error) {
            console.error('Submit error:', error);
            ErrorHandler.handle(error, 'AddExpenseForm.handleFinalSubmit');
        } finally {
            this.isSubmitting = false;
            if (finalBtn) finalBtn.disabled = false;
        }
    }

    resetBook() {
        const nameInput = this.querySelector('#bookNameInput');
        const amountInput = this.querySelector('#bookAmountInput');
        if (nameInput) nameInput.value = '';
        if (amountInput) amountInput.value = '';
        this.expenseName = '';
        this.expenseAmount = '';
        this.expenseDateMode = 'today';
        this.expenseDateVal = new Date().toISOString().split('T')[0];
        const label = this.querySelector('#bookDateLabel');
        if (label) label.textContent = 'Today';
        this.selectCategory('food_drink');
        this.goToStep(1, true);
    }

    async handleDelete() {
        if (!confirm('Are you sure you want to delete this expense?')) return;
        try {
            await ApiService.deleteExpense(this.editExpenseId);
            window.showToast('Expense deleted', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 600);
        } catch (error) {
            console.error('Delete error:', error);
            window.showToast('Failed to delete expense', 'error');
        }
    }

    prefillForm() {
        if (this.editData) {
            const nameInput = this.querySelector('#bookNameInput');
            const amountInput = this.querySelector('#bookAmountInput');
            if (nameInput) nameInput.value = decodeURIComponent(this.editData.description);
            if (amountInput) amountInput.value = this.editData.amount;
            if (this.editData.category) this.selectCategory(this.editData.category);
            this.goToStep(3, false);
        }
    }
}

customElements.define('add-expense-form', AddExpenseForm);
