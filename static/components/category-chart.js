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
        console.log('CategoryChart connected');
        this.render();

        // Wait for the DOM to be fully rendered
        await new Promise(resolve => setTimeout(resolve, 100));

        this.setupEventListeners();

        // Chart.js is already loaded in HTML, so initialize directly
        console.log('Chart.js available:', !!window.Chart);
        this.isInitialized = true;
        await this.updateChart();
    }


    setupEventListeners() {
        // Close button for category details
        this.querySelector('#categoryDetails .btn-close').addEventListener('click', () => {
            const categoryDetails = this.querySelector('#categoryDetails');
            bootstrap.Collapse.getOrCreateInstance(categoryDetails).hide();

            // Clear chart highlighting when closing details
            if (this.chart) {
                this.chart.setActiveElements([]);
                this.chart.update('none');
                this.activeCategory = null;
                this.activeCategoryIndex = null;
            }
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
                this.updateChart().catch(error => {
                    console.error('Error updating chart after date change:', error);
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
        console.log('updateChart called, initialized:', this.isInitialized);
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
            console.log('Fetched expenses:', expenses.length);

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
        console.log('renderChart called with', expenses.length, 'expenses');
        if (!this.isInitialized || !window.Chart) {
            console.error('Chart not properly initialized, initialized:', this.isInitialized, 'Chart available:', !!window.Chart);
            return;
        }

        // If no expenses, show empty state
        if (!expenses || expenses.length === 0) {
            const totalEl = this.querySelector('#chartTotal');
            const centerTotalEl = this.querySelector('#chartCenterTotal .fw-bold');
            const legendEl = this.querySelector('#chartLegend');

            if (totalEl) totalEl.textContent = this.formatAmount(0);
            if (centerTotalEl) centerTotalEl.textContent = this.formatAmount(0);
            if (legendEl) legendEl.innerHTML = '<div class="text-muted">No expenses for this period</div>';

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
            const totalEl = this.querySelector('#chartTotal');
            const centerTotalEl = this.querySelector('#chartCenterTotal .fw-bold');

            if (totalEl) totalEl.textContent = this.formatAmount(total);
            if (centerTotalEl) centerTotalEl.textContent = this.formatAmount(total);

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
                                enabled: true,
                                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                                titleColor: '#ffffff',
                                bodyColor: '#ffffff',
                                borderColor: 'rgba(255, 255, 255, 0.2)',
                                borderWidth: 2,
                                cornerRadius: 8,
                                padding: 16,
                                displayColors: true,
                                boxPadding: 6,
                                usePointStyle: true,
                                position: 'average',
                                yAlign: 'bottom',
                                xAlign: 'center',
                                caretSize: 8,
                                caretPadding: 10,
                                titleFont: {
                                    size: 14,
                                    weight: 'bold'
                                },
                                bodyFont: {
                                    size: 13
                                },
                                callbacks: {
                                    title: (context) => {
                                        return context[0].label;
                                    },
                                    label: (context) => {
                                        const value = context.raw;
                                        const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                        const percentage = Math.round((value / total) * 100);
                                        return `${this.formatAmount(value)} (${percentage}%)`;
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

            // Update desktop legend
            const legendContainer = this.querySelector('#chartLegend');
            legendContainer.innerHTML = sortedCategories.map(([category, amount]) => {
                const color = this.getCategoryColor(category);
                return `
                    <div class="legend-item d-flex align-items-center justify-content-between py-2 px-3 rounded"
                         data-category="${category}"
                         style="cursor: pointer; background: var(--bg-secondary); transition: all 0.2s ease;">
                        <div class="d-flex align-items-center">
                            <div class="me-3" style="width: 12px; height: 12px; background: ${color}; border-radius: 50%;"></div>
                            <span style="color: var(--text-primary);">${this.formatCategory(category)}</span>
                        </div>
                        <strong style="color: var(--text-primary);">${this.formatAmount(amount)}</strong>
                    </div>
                `;
            }).join('');

            // Update mobile legend - compact horizontal chips
            const mobileLegendContainer = this.querySelector('#chartLegendMobile');
            mobileLegendContainer.innerHTML = sortedCategories.map(([category, amount]) => {
                const color = this.getCategoryColor(category);
                return `
                    <div class="legend-item-mobile badge text-light px-2 py-1 mobile-legend-chip"
                         data-category="${category}"
                         style="cursor: pointer; background: ${color}; font-size: 0.75rem; transition: all 0.2s ease;">
                        ${this.formatCategory(category)} ${this.formatAmount(amount)}
                    </div>
                `;
            }).join('');

            // Add legend click handlers - desktop
            legendContainer.querySelectorAll('.legend-item').forEach((item, index) => {
                item.addEventListener('click', () => {
                    const category = item.dataset.category;

                    // Trigger chart interaction to highlight the segment
                    if (this.chart) {
                        const categoryIndex = sortedCategories.findIndex(([cat]) => cat === category);
                        if (categoryIndex !== -1) {
                            // Store the active category for persistent highlighting
                            this.activeCategory = category;
                            this.activeCategoryIndex = categoryIndex;

                            this.chart.setActiveElements([{
                                datasetIndex: 0,
                                index: categoryIndex
                            }]);
                            this.chart.update('none');
                        }
                    }

                    this.showCategoryDetails(category, expenses);
                });
            });

            // Add legend click handlers - mobile
            mobileLegendContainer.querySelectorAll('.legend-item-mobile').forEach((item, index) => {
                item.addEventListener('click', () => {
                    const category = item.dataset.category;

                    // Trigger chart interaction to highlight the segment
                    if (this.chart) {
                        // Find the index of this category in the sorted categories
                        const categoryIndex = sortedCategories.findIndex(([cat]) => cat === category);
                        if (categoryIndex !== -1) {
                            // Store the active category for persistent highlighting
                            this.activeCategory = category;
                            this.activeCategoryIndex = categoryIndex;

                            this.chart.setActiveElements([{
                                datasetIndex: 0,
                                index: categoryIndex
                            }]);
                            this.chart.update('none');
                        }
                    }

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

        // Update Mobile cards - compact table-like design
        this.querySelector('#categoryExpensesListMobile').innerHTML = sortedExpenses
            .map((exp, index) => `
                <div class="mobile-expense-row d-flex align-items-center py-2 px-3 border-bottom expense-card"
                     data-expense-id="${exp.id}" style="cursor: pointer; border-color: rgba(255,255,255,0.1);" title="Tap to edit">
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center">
                                <span class="badge category-${exp.category} me-2" style="font-size: 0.7rem; padding: 0.2rem 0.4rem;">
                                    <i class="bi bi-${CategoryHelper.getCategoryIcon(exp.category)}"></i>
                                </span>
                                <div>
                                    <div class="fw-medium text-light" style="font-size: 0.9rem;">${exp.description}</div>
                                    <small class="text-muted" style="font-size: 0.75rem;">${this.formatDateCompact(exp.date)}</small>
                                </div>
                            </div>
                            <div class="text-end">
                                <div class="fw-bold text-light" style="font-size: 0.95rem;">${this.formatAmount(exp.amount)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');

        // Add click handlers for editing expenses (Desktop)
        this.querySelector('#categoryExpensesList').addEventListener('click', (e) => {
            const row = e.target.closest('.expense-row');
            if (row) {
                const expenseId = row.dataset.expenseId;
                const expense = categoryExpenses.find(e => e.id == expenseId);
                if (expense) {
                    this.editExpense(expense);
                }
            }
        });

        // Add click handlers for editing expenses (Mobile)
        this.querySelector('#categoryExpensesListMobile').addEventListener('click', (e) => {
            const row = e.target.closest('.expense-card');
            if (row) {
                const expenseId = row.dataset.expenseId;
                const expense = categoryExpenses.find(e => e.id == expenseId);
                if (expense) {
                    this.editExpense(expense);
                }
            }
        });

        // Show the section
        const categoryDetails = this.querySelector('#categoryDetails');
        bootstrap.Collapse.getOrCreateInstance(categoryDetails).show();
    }

    editExpense(expense) {
        // Navigate to add-expense page with edit parameters
        const editUrl = `/static/add-expense.html?edit=${expense.id}&amount=${expense.amount}&category=${expense.category}&description=${encodeURIComponent(expense.description)}`;
        window.location.href = editUrl;
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

    render() {
        this.innerHTML = `
            <div class="chart-container-modern modern-card">
                <div class="card border-0" style="background: var(--bg-card);">
                    <div class="card-header d-flex justify-content-between align-items-center border-0 bg-transparent">
                        <div class="d-flex align-items-center" style="color: var(--text-primary);">
                            <i class="bi bi-pie-chart me-2"></i>
                            <span>Expense Distribution</span>
                        </div>
                        <div class="fs-5 fw-bold" style="color: var(--primary-color);" id="chartTotal">€0.00</div>
                    </div>
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-md-6 position-relative">
                                <canvas id="categoryChart" style="max-height: 280px;"></canvas>
                                <div id="chartCenterTotal" class="position-absolute top-50 start-50 translate-middle text-center">
                                    <div class="fs-6 mb-1" style="color: var(--text-secondary);">Total</div>
                                    <div class="fs-4 fw-bold" style="color: var(--text-primary);"></div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div id="chartLegend" class="d-flex flex-column gap-2 ps-md-3 mt-3 mt-md-0 d-none d-md-flex"></div>
                            </div>
                        </div>
                        <!-- Mobile compact legend -->
                        <div id="chartLegendMobile" class="d-md-none mt-3 d-flex flex-wrap gap-2"></div>
                        </div>
                    </div>
                </div>
                <!-- Category Details Section -->
                <div id="categoryDetails" class="collapse">
                    <div class="card border-0 mt-3 modern-card" style="background: var(--bg-card);">
                        <div class="card-header d-flex justify-content-between align-items-center border-0 bg-transparent">
                            <div class="d-flex align-items-center" style="color: var(--text-primary);">
                                <span id="categoryDetailsTitle">Category Details</span>
                            </div>
                            <button type="button" class="btn-close" aria-label="Close"></button>
                        </div>
                        <div class="card-body">
                        <!-- Desktop Table View -->
                        <div class="table-responsive d-none d-md-block">
                            <table class="table table-hover mb-0" style="--bs-table-bg: var(--bg-card); color: var(--text-primary);">
                                <thead>
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
                                <tfoot style="background: var(--bg-secondary);">
                                    <tr>
                                        <td colspan="3"><strong style="color: var(--text-primary);">Category Total</strong></td>
                                        <td class="amount" id="categoryTotal" style="color: var(--primary-color);">€0.00</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <!-- Mobile Card View -->
                        <div class="d-md-none" id="categoryExpensesListMobile"></div>

                        <!-- Mobile Total -->
                        <div class="d-md-none mt-3 p-3 rounded" style="background: rgba(255,255,255,0.05);">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="fw-bold">Category Total</span>
                                <span class="fw-bold fs-5 text-primary" id="categoryTotalMobile">€0.00</span>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .legend-item:hover {
                    background: rgba(255,255,255,0.1) !important;
                    transform: translateX(4px);
                }
                .mobile-legend-chip:hover {
                    transform: scale(1.05);
                    opacity: 0.9;
                }
                .mobile-legend-chip {
                    border: 1px solid rgba(255,255,255,0.2);
                    white-space: nowrap;
                }
                #chartCenterTotal {
                    pointer-events: none;
                    z-index: 10;
                }
                .expense-row {
                    transition: all 0.2s ease;
                }
                .expense-row:hover {
                    background-color: rgba(var(--bs-primary-rgb), 0.1) !important;
                    transform: translateX(2px);
                }
                .expense-row.editing {
                    background-color: rgba(var(--bs-warning-rgb), 0.2) !important;
                    border-left: 3px solid var(--bs-warning);
                }
                .category-expense-badge {
                    font-size: 0.7rem;
                    padding: 0.25rem 0.4rem;
                }
                .table-dark th {
                    border-color: rgba(255,255,255,0.2);
                    background-color: rgba(255,255,255,0.05);
                }
                .table-dark td {
                    border-color: rgba(255,255,255,0.1);
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
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    border-left-color: var(--bs-primary);
                }
                .expense-card.editing {
                    border-left-color: var(--bs-primary);
                    box-shadow: 0 4px 12px rgba(var(--bs-primary-rgb), 0.3);
                }
                .mobile-expense-row:hover {
                    background: rgba(255,255,255,0.05) !important;
                }
                .mobile-expense-row.editing {
                    background: rgba(0,123,255,0.1) !important;
                    border-left: 3px solid var(--bs-primary);
                }
                @media (max-width: 768px) {
                    .mobile-expense-row {
                        transition: all 0.2s ease;
                        min-height: 60px;
                    }
                    .expense-card .btn {
                        padding: 0.5rem;
                        font-size: 0.85rem;
                    }
                    .expense-card .form-control,
                    .expense-card .form-select {
                        font-size: 0.9rem;
                        padding: 0.5rem;
                    }
                    #categoryExpensesListMobile {
                        background: rgba(255,255,255,0.02);
                        border-radius: 0.5rem;
                        overflow: hidden;
                    }
                }
            </style>
        `;
    }
}

customElements.define('category-chart', CategoryChart);
