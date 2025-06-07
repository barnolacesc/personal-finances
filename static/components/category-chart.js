class CategoryChart extends HTMLElement {
    constructor() {
        super();
        this.chart = null;
        this.isInitialized = false;
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.currentWeek = 'all';
        this.categoryColors = {
            super: '#2563eb',      // Blue
            xofa: '#7c3aed',       // Purple
            food_drink: '#059669',  // Green
            save_inv: '#10b981',   // Emerald
            recurrent: '#f59e0b',  // Orange
            clothing: '#ec4899',   // Pink
            personal: '#8b5cf6',   // Purple
            taxes: '#dc2626',      // Red
            transport: '#6366f1',  // Indigo
            car: '#374151',      // Dark gray
            health: '#06b6d4',     // Cyan
            other: '#6b7280'       // Gray
        };
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
        return new Date(date).toLocaleDateString('default', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatCategory(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getCategoryColor(category) {
        return this.categoryColors[category] || '#6b7280';
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
                        cutout: '60%',
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const value = context.raw;
                                        return `${context.label}: ${this.formatAmount(value)}`;
                                    }
                                }
                            }
                        },
                        animation: {
                            animateRotate: true,
                            animateScale: true
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
                    <div class="d-flex align-items-center justify-content-between legend-item" 
                         data-category="${category}" 
                         style="cursor: pointer">
                        <div class="d-flex align-items-center">
                            <span class="color-dot me-2" style="background-color: ${color}"></span>
                            <span class="text-capitalize">${this.formatCategory(category)}</span>
                        </div>
                        <strong>${this.formatAmount(amount)}</strong>
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
        
        // Update expenses list
        this.querySelector('#categoryExpensesList').innerHTML = categoryExpenses
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(exp => `
                <tr>
                    <td>${this.formatDate(exp.date)}</td>
                    <td>${exp.description}</td>
                    <td class="amount">${this.formatAmount(exp.amount)}</td>
                </tr>
            `).join('');
        
        // Show the section
        const categoryDetails = this.querySelector('#categoryDetails');
        bootstrap.Collapse.getOrCreateInstance(categoryDetails).show();
    }

    render() {
        this.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-header py-3">
                    <h5 class="mb-0">
                        <button class="btn btn-link text-decoration-none p-0 w-100 text-start d-flex justify-content-between align-items-center" 
                                type="button" 
                                data-bs-toggle="collapse" 
                                data-bs-target="#chartSection">
                            <span><i class="bi bi-pie-chart me-2"></i>Expense Distribution</span>
                            <span id="chartTotal" class="text-primary"></span>
                        </button>
                    </h5>
                </div>
                <div id="chartSection" class="collapse show">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-md-6 position-relative">
                                <canvas id="categoryChart"></canvas>
                                <div id="chartCenterTotal" class="position-absolute top-50 start-50 translate-middle text-center">
                                    <div class="fs-5 text-muted mb-1">Total</div>
                                    <div class="fs-4 fw-bold"></div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div id="chartLegend" class="d-flex flex-column gap-2 ps-md-4 mt-4 mt-md-0"></div>
                            </div>
                        </div>
                    </div>
                    <!-- Category Details Section -->
                    <div id="categoryDetails" class="collapse">
                        <div class="card-header border-top">
                            <h6 class="mb-0 d-flex justify-content-between align-items-center">
                                <span id="categoryDetailsTitle">Category Details</span>
                                <button type="button" class="btn-close" aria-label="Close"></button>
                            </h6>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>Date</th>
                                        <th>Description</th>
                                        <th class="amount">Amount</th>
                                    </tr>
                                </thead>
                                <tbody id="categoryExpensesList"></tbody>
                                <tfoot class="table-light">
                                    <tr>
                                        <td colspan="2"><strong>Category Total</strong></td>
                                        <td class="amount" id="categoryTotal">€0.00</td>
                                    </tr>
                                </tfoot>
                            </table>
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
            </style>
        `;
    }
}

customElements.define('category-chart', CategoryChart); 