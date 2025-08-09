import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';
import { EventManager } from './event-manager.js';

class CategoryChart extends HTMLElement {
    constructor() {
        super();
        this.chart = null;
        this.isInitialized = false;
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.currentWeek = 'all';
        // Categories and colors loaded from config
        this.categoryColors = {};
    }

    async connectedCallback() {
        this.render();
        this.setupEventListeners();

        // Wait for Chart.js to load before any updates
        try {
            await this.loadChartJS();
            this.isInitialized = true;
            await this.updateChart();
        } catch (error) {
            console.error('Error during initial chart setup:', error);
            // Don't show error toast during initial load
        }
    }

    async loadChartJS() {
        return new Promise((resolve, reject) => {
            // If Chart.js is already loaded, resolve immediately
            if (window.Chart) {
                console.log('Chart.js already loaded');
                resolve();
                return;
            }

            // If we're already loading Chart.js, wait for it
            if (window._chartJSLoading) {
                console.log('Waiting for Chart.js to load...');
                document.addEventListener('chartJSLoaded', () => resolve(), { once: true });
                return;
            }

            // Start loading Chart.js
            window._chartJSLoading = true;
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

            script.onload = () => {
                console.log('Chart.js loaded successfully');
                window._chartJSLoading = false;
                document.dispatchEvent(new Event('chartJSLoaded'));
                resolve();
            };

            script.onerror = (error) => {
                console.error('Failed to load Chart.js:', error);
                window._chartJSLoading = false;
                reject(new Error('Failed to load Chart.js'));
            };

            document.head.appendChild(script);
        });
    }

    setupEventListeners() {
        // Close button for category details
        this.querySelector('#categoryDetails .btn-close').addEventListener('click', () => {
            const categoryDetails = this.querySelector('#categoryDetails');
            bootstrap.Collapse.getOrCreateInstance(categoryDetails).hide();
        });

        // Listen for expense updates - only on document
        document.addEventListener('expenseadded', () => {
            if (this.isInitialized) {
                this.updateChart().catch(error => {
                    console.error('Error updating chart after expense added:', error);
                });
            }
        });

        // Listen for date changes
        document.addEventListener('datechange', (e) => {
            this.currentMonth = e.detail.month;
            this.currentYear = e.detail.year;
            this.currentWeek = e.detail.week;
            if (this.isInitialized) {
                this.updateChart().catch(error => {
                    console.error('Error updating chart after date change:', error);
                });
            } else {
                this.initializeChart().catch(error => {
                    console.error('Error initializing chart after date change:', error);
                });
            }
        });
    }

    formatAmount(amount) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    formatDate(date) {
        const expenseDate = new Date(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Check if it's today or yesterday
        if (expenseDate.toDateString() === today.toDateString()) {
            return `Today, ${expenseDate.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (expenseDate.toDateString() === yesterday.toDateString()) {
            return `Yesterday, ${expenseDate.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            // Format as day, month date with time
            return expenseDate.toLocaleDateString('default', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    formatDateCompact(date) {
        // Compact version for category details
        const expenseDate = new Date(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (expenseDate.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (expenseDate.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return expenseDate.toLocaleDateString('default', {
                month: 'short',
                day: 'numeric'
            });
        }
    }

    formatCategory(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getCategoryColor(category) {
        return CategoryHelper.getCategoryColor(category);
    }

    async updateChart() {
        if (!this.isInitialized) {
            console.log('Chart not initialized, skipping update');
            return;
        }

        try {
            const response = await fetch(`/api/expenses?month=${this.currentMonth}&year=${this.currentYear}`);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response:', errorText);
                throw new Error('Failed to fetch expenses');
            }

            const { expenses } = await response.json();

            // Filter expenses by week if needed
            const filteredExpenses = this.currentWeek === 'all' ? expenses : expenses.filter(expense => {
                const date = new Date(expense.date);
                const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                const firstDayOfWeek = firstDay.getDay();
                const dayOffset = date.getDate() + firstDayOfWeek - 1;
                const weekNumber = Math.ceil(dayOffset / 7);
                const weekKey = `week${weekNumber}`;
                return weekKey === this.currentWeek;
            });

            await this.renderChart(filteredExpenses);
        } catch (error) {
            console.error('Error updating chart:', error);
            // Only show toast for errors after initialization
            if (this.isInitialized && document.readyState === 'complete') {
                window.showToast('Failed to update chart', 'error');
            }
        }
    }

    async renderChart(expenses) {
        if (!this.isInitialized || !window.Chart) {
            console.error('Chart not properly initialized');
            return;
        }

        // If no expenses, show empty state
        if (!expenses || expenses.length === 0) {
            this.querySelector('#chartTotal').textContent = this.formatAmount(0);
            this.querySelector('#chartCenterTotal .fw-bold').textContent = this.formatAmount(0);
            this.querySelector('#chartLegend').innerHTML = '<div class="text-muted">No expenses for this period</div>';

            // Clear existing chart
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            return;
        }

        try {
            // Calculate total
            const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

            // Update totals display
            this.querySelector('#chartTotal').textContent = this.formatAmount(total);
            this.querySelector('#chartCenterTotal .fw-bold').textContent = this.formatAmount(total);

            // Group expenses by category
            const categoryTotals = expenses.reduce((acc, exp) => {
                const category = exp.category;
                acc[category] = (acc[category] || 0) + parseFloat(exp.amount);
                return acc;
            }, {});

            console.log('Category totals:', categoryTotals);

            // Sort categories by amount
            const sortedCategories = Object.entries(categoryTotals)
                .sort(([,a], [,b]) => b - a);

            console.log('Sorted categories:', sortedCategories);

            // Store categories for click handling
            this.currentCategories = sortedCategories;

            // Prepare chart data with debug logging
            const colors = sortedCategories.map(([category]) => {
                const color = this.getCategoryColor(category);
                console.log(`Category: ${category}, Color: ${color}`);
                return color;
            });

            const data = {
                labels: sortedCategories.map(([category]) => this.formatCategory(category)),
                datasets: [{
                    data: sortedCategories.map(([,amount]) => amount),
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 15
                }]
            };

            console.log('Chart data:', data);

            // Update or create chart
            if (this.chart) {
                this.chart.data = data;
                this.chart.update('none'); // Use 'none' for immediate update
            } else {
                const canvas = this.querySelector('#categoryChart');
                if (!canvas) {
                    console.error('Canvas element not found');
                    return;
                }
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.error('Failed to get canvas context');
                    return;
                }
                console.log('Creating new chart');
                this.chart = new Chart(ctx, {
                    type: 'doughnut',
                    data: data,
                    options: {
                        cutout: '65%',
                        radius: '90%',
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                titleColor: '#374151',
                                bodyColor: '#374151',
                                borderColor: '#e5e7eb',
                                borderWidth: 1,
                                cornerRadius: 8,
                                padding: 12,
                                displayColors: true,
                                callbacks: {
                                    label: (context) => {
                                        const value = context.raw;
                                        const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                        const percentage = Math.round((value / total) * 100);
                                        return `${context.label}: ${this.formatAmount(value)} (${percentage}%)`;
                                    }
                                }
                            }
                        },
                        responsive: true,
                        maintainAspectRatio: true,
                        animation: {
                            animateRotate: true,
                            animateScale: true,
                            duration: 800,
                            easing: 'easeOutQuart'
                        },
                        interaction: {
                            intersect: false,
                            mode: 'nearest'
                        },
                        elements: {
                            arc: {
                                borderWidth: 3,
                                borderColor: 'rgba(255, 255, 255, 0.8)',
                                hoverBorderWidth: 4,
                                hoverBorderColor: '#ffffff'
                            }
                        },
                        onClick: (e, elements) => {
                            if (elements && elements.length > 0) {
                                const category = this.currentCategories[elements[0].index][0];
                                this.showCategoryDetails(category, expenses);
                            }
                        }
                    }
                });
            }

            // Update legend
            const legendContainer = this.querySelector('#chartLegend');
            legendContainer.innerHTML = sortedCategories.map(([category, amount]) => {
                const color = this.getCategoryColor(category);
                console.log(`Legend - Category: ${category}, Color: ${color}`);
                return `
                    <div class="expense-card p-3 legend-item"
                         data-category="${category}"
                         style="cursor: pointer; border-left: 4px solid ${color};">
                        <div class="d-flex align-items-center justify-content-between">
                            <div class="d-flex align-items-center">
                                <div class="d-inline-flex align-items-center justify-content-center me-3"
                                     style="width: 40px; height: 40px; background: ${color}15; border-radius: 50%;">
                                    <i class="bi bi-${CategoryHelper.getCategoryIcon(category)}" style="color: ${color};"></i>
                                </div>
                                <div>
                                    <div class="fw-medium">${this.formatCategory(category)}</div>
                                    <small class="text-muted">${Math.round((amount/sortedCategories.reduce((sum, [,amt]) => sum + amt, 0))*100)}% of total</small>
                                </div>
                            </div>
                            <strong class="fs-5" style="color: ${color};">${this.formatAmount(amount)}</strong>
                        </div>
                    </div>
                `;
            }).join('');

            // Add legend click handlers
            legendContainer.querySelectorAll('.legend-item').forEach(item => {
                item.addEventListener('click', () => {
                    const category = item.dataset.category;
                    this.showCategoryDetails(category, expenses);
                });
            });
        } catch (error) {
            console.error('Error rendering chart:', error);
            if (this.isInitialized) {
                window.showToast('Failed to render chart', 'error');
            }
        }
    }

    showCategoryDetails(category, expenses) {
        const categoryExpenses = expenses.filter(exp => exp.category === category);
        const total = categoryExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

        // Update title and total
        this.querySelector('#categoryDetailsTitle').textContent = this.formatCategory(category);
        this.querySelector('#categoryTotal').textContent = this.formatAmount(total);
        this.querySelector('#categoryTotalMobile').textContent = this.formatAmount(total);

        // Handle empty state
        if (categoryExpenses.length === 0) {
            // Desktop empty state
            this.querySelector('#categoryExpensesList').innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5">
                        <div class="text-muted">
                            <i class="bi bi-inbox fs-1 mb-2 d-block"></i>
                            <p class="mb-0">No expenses found for this category</p>
                        </div>
                    </td>
                </tr>
            `;

            // Mobile empty state
            this.querySelector('#categoryExpensesListMobile').innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1 mb-2 d-block"></i>
                    <p class="mb-0">No expenses found for this category</p>
                </div>
            `;

            // Show the section
            const categoryDetails = this.querySelector('#categoryDetails');
            bootstrap.Collapse.getOrCreateInstance(categoryDetails).show();
            return;
        }

        // Sort expenses by date (newest first)
        const sortedExpenses = categoryExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Update Desktop table
        this.querySelector('#categoryExpensesList').innerHTML = sortedExpenses
            .map((exp, index) => `
                <tr class="expense-row" data-expense-id="${exp.id}" style="cursor: pointer;" title="Click to edit this expense">
                    <td class="date-cell py-3">
                        <div class="d-flex align-items-center">
                            <span class="badge category-${exp.category} category-expense-badge me-2" title="${CategoryHelper.getCategoryLabel(exp.category)}">
                                <i class="bi bi-${CategoryHelper.getCategoryIcon(exp.category)}"></i>
                            </span>
                            <div>
                                <div class="fw-medium">${this.formatDateCompact(exp.date)}</div>
                                <small class="text-muted">${new Date(exp.date).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}</small>
                            </div>
                        </div>
                    </td>
                    <td class="description-cell py-3">
                        <div class="fw-medium">${exp.description}</div>
                        <small class="text-muted">ID: ${exp.id}</small>
                    </td>
                    <td class="amount-cell amount py-3">
                        <div class="text-end">
                            <div class="fw-bold fs-6">${this.formatAmount(exp.amount)}</div>
                        </div>
                    </td>
                    <td class="text-center py-3">
                        <div class="d-flex flex-column align-items-center">
                            <small class="text-muted mb-1">
                                <i class="bi bi-pencil-square" title="Click to edit"></i>
                            </small>
                            <small class="text-muted" style="font-size: 0.7rem;">Edit</small>
                        </div>
                    </td>
                </tr>
            `).join('');

        // Update Mobile cards
        this.querySelector('#categoryExpensesListMobile').innerHTML = sortedExpenses
            .map((exp, index) => `
                <div class="card mb-3 expense-card" data-expense-id="${exp.id}" style="cursor: pointer;" title="Tap to edit this expense">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div class="d-flex align-items-center">
                                <span class="badge category-${exp.category} me-2" style="font-size: 0.75rem;">
                                    <i class="bi bi-${CategoryHelper.getCategoryIcon(exp.category)}"></i>
                                </span>
                                <div>
                                    <div class="fw-medium">${this.formatDateCompact(exp.date)}</div>
                                    <small class="text-muted">${new Date(exp.date).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}</small>
                                </div>
                            </div>
                            <div class="text-end">
                                <div class="fw-bold fs-5">${this.formatAmount(exp.amount)}</div>
                                <small class="text-muted">
                                    <i class="bi bi-pencil-square me-1"></i>Tap to edit
                                </small>
                            </div>
                        </div>
                        <div class="mt-2">
                            <div class="fw-medium">${exp.description}</div>
                            <small class="text-muted">ID: ${exp.id}</small>
                        </div>
                    </div>
                </div>
            `).join('');

        // Add click handlers for editing expenses (Desktop)
        this.querySelector('#categoryExpensesList').addEventListener('click', (e) => {
            const row = e.target.closest('.expense-row');
            if (row && !row.classList.contains('editing')) {
                this.editExpense(row, categoryExpenses);
            }
        });

        // Add click handlers for editing expenses (Mobile)
        this.querySelector('#categoryExpensesListMobile').addEventListener('click', (e) => {
            const card = e.target.closest('.expense-card');
            if (card && !card.classList.contains('editing')) {
                this.editExpenseMobile(card, categoryExpenses);
            }
        });

        // Show the section
        const categoryDetails = this.querySelector('#categoryDetails');
        bootstrap.Collapse.getOrCreateInstance(categoryDetails).show();
    }

    editExpense(row, categoryExpenses) {
        if (row.classList.contains('editing')) return;

        // Close any currently editing expense first
        const currentlyEditing = this.querySelector('.expense-row.editing');
        if (currentlyEditing && currentlyEditing !== row) {
            this.cancelEditingRow(currentlyEditing);
        }

        const expenseId = row.dataset.expenseId;
        const expense = categoryExpenses.find(e => e.id == expenseId);
        if (!expense) return;

        // Store original content before editing
        row.dataset.originalContent = row.innerHTML;

        // Add editing class for visual feedback
        row.classList.add('editing');
        row.style.backgroundColor = 'var(--bs-light)';

        // Get current values
        const amount = expense.amount;
        const category = expense.category;
        const description = expense.description;

        // Create edit form
        row.innerHTML = `
            <td colspan="4" class="p-3">
                <div class="edit-form">
                    <div class="row g-3">
                        <div class="col-sm-4">
                            <label class="form-label small fw-bold">Amount</label>
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">${CONFIG.CURRENCY.symbol}</span>
                                <input type="text"
                                       class="form-control edit-amount"
                                       value="${amount}"
                                       pattern="[0-9]*[.,]?[0-9]*"
                                       inputmode="decimal">
                            </div>
                        </div>
                        <div class="col-sm-4">
                            <label class="form-label small fw-bold">Category</label>
                            <select class="form-select form-select-sm edit-category">
                                ${CategoryHelper.getAllCategories().map(cat => `
                                    <option value="${cat}" ${cat === category ? 'selected' : ''}>
                                        ${CategoryHelper.getCategoryLabel(cat)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="col-sm-4">
                            <label class="form-label small fw-bold">Description</label>
                            <input type="text"
                                   class="form-control form-control-sm edit-description"
                                   value="${description}"
                                   maxlength="${CONFIG.VALIDATION.DESCRIPTION_MAX_LENGTH}">
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-3">
                        <button class="btn btn-success btn-sm save-expense-btn" data-expense-id="${expenseId}">
                            <i class="bi bi-check-lg"></i> Save
                        </button>
                        <button class="btn btn-secondary btn-sm cancel-expense-btn" data-expense-id="${expenseId}">
                            <i class="bi bi-x-lg"></i> Cancel
                        </button>
                        <button class="btn btn-outline-danger btn-sm ms-auto delete-expense-btn" data-expense-id="${expenseId}">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </td>
        `;

        // Add event listeners for buttons
        const saveBtn = row.querySelector('.save-expense-btn');
        const cancelBtn = row.querySelector('.cancel-expense-btn');
        const deleteBtn = row.querySelector('.delete-expense-btn');

        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveExpenseEdit(saveBtn);
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancelExpenseEdit(cancelBtn);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteExpense(expenseId);
        });

        // Focus on description field
        setTimeout(() => {
            row.querySelector('.edit-description').focus();
        }, 100);
    }

    editExpenseMobile(card, categoryExpenses) {
        if (card.classList.contains('editing')) return;

        // Close any currently editing expense first
        const currentlyEditing = this.querySelector('.expense-card.editing');
        if (currentlyEditing && currentlyEditing !== card) {
            this.cancelEditingCard(currentlyEditing);
        }

        const expenseId = card.dataset.expenseId;
        const expense = categoryExpenses.find(e => e.id == expenseId);
        if (!expense) return;

        // Store original content before editing
        card.dataset.originalContent = card.innerHTML;

        // Add editing class for visual feedback
        card.classList.add('editing');
        card.style.border = '2px solid var(--bs-primary)';

        // Get current values
        const amount = expense.amount;
        const category = expense.category;
        const description = expense.description;

        // Create mobile edit form
        card.innerHTML = `
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0 text-primary">
                        <i class="bi bi-pencil-square me-2"></i>Edit Expense
                    </h6>
                    <small class="text-muted">ID: ${expenseId}</small>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Amount</label>
                    <div class="input-group">
                        <span class="input-group-text">${CONFIG.CURRENCY.symbol}</span>
                        <input type="text"
                               class="form-control edit-amount"
                               value="${amount}"
                               pattern="[0-9]*[.,]?[0-9]*"
                               inputmode="decimal">
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Category</label>
                    <select class="form-select edit-category">
                        ${CategoryHelper.getAllCategories().map(cat => `
                            <option value="${cat}" ${cat === category ? 'selected' : ''}>
                                ${CategoryHelper.getCategoryLabel(cat)}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Description</label>
                    <input type="text"
                           class="form-control edit-description"
                           value="${description}"
                           maxlength="${CONFIG.VALIDATION.DESCRIPTION_MAX_LENGTH}">
                </div>

                <div class="d-grid gap-2">
                    <button class="btn btn-success save-expense-btn" data-expense-id="${expenseId}">
                        <i class="bi bi-check-lg me-2"></i>Save Changes
                    </button>
                    <div class="row g-2">
                        <div class="col">
                            <button class="btn btn-secondary w-100 cancel-expense-btn" data-expense-id="${expenseId}">
                                <i class="bi bi-x-lg me-2"></i>Cancel
                            </button>
                        </div>
                        <div class="col">
                            <button class="btn btn-outline-danger w-100 delete-expense-btn" data-expense-id="${expenseId}">
                                <i class="bi bi-trash me-2"></i>Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners for buttons
        const saveBtn = card.querySelector('.save-expense-btn');
        const cancelBtn = card.querySelector('.cancel-expense-btn');
        const deleteBtn = card.querySelector('.delete-expense-btn');

        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveExpenseEditMobile(saveBtn);
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancelExpenseEditMobile(cancelBtn);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteExpense(expenseId);
        });

        // Focus on description field
        setTimeout(() => {
            card.querySelector('.edit-description').focus();
        }, 100);
    }

    async saveExpenseEdit(saveBtn) {
        const expenseId = saveBtn.dataset.expenseId;
        const row = saveBtn.closest('.expense-row');

        const amount = CurrencyHelper.parseAmount(row.querySelector('.edit-amount').value);
        const category = row.querySelector('.edit-category').value;
        const description = row.querySelector('.edit-description').value.trim();

        // Validation
        if (!amount || amount <= 0) {
            window.showToast('Please enter a valid amount', 'error');
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

        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount,
                    category,
                    description
                })
            });

            if (!response.ok) throw new Error('Failed to update expense');

            window.showToast('Expense updated successfully', 'success');

            // Refresh the chart and category details
            await this.updateChart();

            // Emit event for other components
            EventManager.emitExpenseAdded();
        } catch (error) {
            console.error('Error updating expense:', error);
            window.showToast('Failed to update expense', 'error');
        }
    }

    cancelExpenseEdit(cancelBtn) {
        const row = cancelBtn.closest('.expense-row');
        this.cancelEditingRow(row);
    }

    cancelEditingRow(row) {
        // Remove editing state
        row.classList.remove('editing');
        row.style.backgroundColor = '';

        // Restore original content if available
        if (row.dataset.originalContent) {
            row.innerHTML = row.dataset.originalContent;
            delete row.dataset.originalContent;
        }
    }

    async deleteExpense(expenseId) {
        if (!confirm('Are you sure you want to delete this expense?')) {
            return;
        }

        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete expense');

            window.showToast('Expense deleted successfully', 'success');

            // Refresh the chart
            await this.updateChart();

            // Emit event for other components
            EventManager.emitExpenseAdded();
        } catch (error) {
            console.error('Error deleting expense:', error);
            window.showToast('Failed to delete expense', 'error');
        }
    }

    async saveExpenseEditMobile(saveBtn) {
        const expenseId = saveBtn.dataset.expenseId;
        const card = saveBtn.closest('.expense-card');

        const amount = CurrencyHelper.parseAmount(card.querySelector('.edit-amount').value);
        const category = card.querySelector('.edit-category').value;
        const description = card.querySelector('.edit-description').value.trim();

        // Validation
        if (!amount || amount <= 0) {
            window.showToast('Please enter a valid amount', 'error');
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

        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount,
                    category,
                    description
                })
            });

            if (!response.ok) throw new Error('Failed to update expense');

            window.showToast('Expense updated successfully', 'success');

            // Refresh the chart and category details
            await this.updateChart();

            // Emit event for other components
            EventManager.emitExpenseAdded();
        } catch (error) {
            console.error('Error updating expense:', error);
            window.showToast('Failed to update expense', 'error');
        }
    }

    cancelExpenseEditMobile(cancelBtn) {
        const card = cancelBtn.closest('.expense-card');
        this.cancelEditingCard(card);
    }

    cancelEditingCard(card) {
        // Remove editing state
        card.classList.remove('editing');
        card.style.border = '';

        // Restore original content if available
        if (card.dataset.originalContent) {
            card.innerHTML = card.dataset.originalContent;
            delete card.dataset.originalContent;
        }
    }

    render() {
        this.innerHTML = `
            <div class="chart-container-modern">
                <div class="text-center mb-4">
                    <div class="d-inline-flex align-items-center justify-content-center mb-3" style="width: 60px; height: 60px; background: var(--primary-gradient); border-radius: 50%;">
                        <i class="bi bi-pie-chart text-white fs-3"></i>
                    </div>
                    <h4 class="chart-title-modern mb-0">Expense Distribution</h4>
                    <p class="text-muted">Analyze your spending patterns</p>
                </div>
                <div id="chartSection">
                    <div class="row align-items-center">
                        <div class="col-md-6 position-relative">
                            <canvas id="categoryChart" style="max-height: 280px;"></canvas>
                            <div id="chartCenterTotal" class="position-absolute top-50 start-50 translate-middle text-center">
                                <div class="fs-6 text-muted mb-1">Total</div>
                                <div class="fs-4 fw-bold"></div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div id="chartLegend" class="d-flex flex-column gap-3 ps-md-4 mt-4 mt-md-0"></div>
                        </div>
                    </div>
                </div>
                    <!-- Category Details Section -->
                    <div id="categoryDetails" class="collapse">
                        <div class="border-top pt-4 mt-4">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="mb-0 text-primary">
                                    <i class="bi bi-list-ul me-2"></i><span id="categoryDetailsTitle">Category Details</span>
                                </h5>
                                <button type="button" class="btn-close" aria-label="Close"></button>
                            </div>
                        </div>
                        <!-- Desktop Table View -->
                        <div class="table-responsive d-none d-md-block">
                            <table class="table table-hover mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th width="35%">
                                            <div class="d-flex align-items-center">
                                                <i class="bi bi-calendar3 me-2"></i>Date & Category
                                            </div>
                                        </th>
                                        <th width="35%">
                                            <div class="d-flex align-items-center">
                                                <i class="bi bi-card-text me-2"></i>Description
                                            </div>
                                        </th>
                                        <th width="20%" class="text-end">
                                            <div class="d-flex align-items-center justify-content-end">
                                                <i class="bi bi-currency-euro me-2"></i>Amount
                                            </div>
                                        </th>
                                        <th width="10%" class="text-center">
                                            <i class="bi bi-pencil-square text-muted" title="Click any row to edit"></i>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody id="categoryExpensesList"></tbody>
                                <tfoot class="table-light">
                                    <tr>
                                        <td colspan="3"><strong>Category Total</strong></td>
                                        <td class="amount" id="categoryTotal">€0.00</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <!-- Mobile Card View -->
                        <div class="d-md-none" id="categoryExpensesListMobile"></div>

                        <!-- Mobile Total -->
                        <div class="d-md-none mt-3 p-3 bg-body-secondary rounded">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="fw-bold">Category Total</span>
                                <span class="fw-bold fs-5 text-primary" id="categoryTotalMobile">€0.00</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .color-dot {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                }
                #chartCenterTotal {
                    pointer-events: none;
                    z-index: 1;
                }
                .expense-row {
                    transition: all 0.2s ease;
                }
                .expense-row:hover {
                    background-color: rgba(var(--bs-primary-rgb), 0.05) !important;
                    transform: translateX(2px);
                }
                .expense-row.editing {
                    background-color: rgba(var(--bs-warning-rgb), 0.1) !important;
                    border-left: 3px solid var(--bs-warning);
                }
                .category-expense-badge {
                    font-size: 0.7rem;
                    padding: 0.25rem 0.4rem;
                }
                .table th {
                    border-top: none;
                    font-weight: 600;
                    font-size: 0.85rem;
                    color: var(--bs-gray-700);
                }
                .table tbody tr:first-child td {
                    border-top: 2px solid var(--bs-primary);
                }
                .expense-card {
                    transition: all 0.2s ease;
                    border-left: 4px solid transparent;
                }
                .expense-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    border-left-color: var(--bs-primary);
                }
                .expense-card.editing {
                    border-left-color: var(--bs-primary);
                    box-shadow: 0 4px 12px rgba(var(--bs-primary-rgb), 0.2);
                }
                @media (max-width: 768px) {
                    .expense-card .card-body {
                        padding: 1rem;
                    }
                    .expense-card .btn {
                        padding: 0.5rem 1rem;
                        font-size: 0.9rem;
                    }
                    .expense-card .form-control,
                    .expense-card .form-select {
                        font-size: 1rem;
                        padding: 0.75rem;
                    }
                }
            </style>
        `;
    }
}

customElements.define('category-chart', CategoryChart);
