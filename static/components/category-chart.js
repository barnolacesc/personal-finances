import { CONFIG, CategoryHelper, CurrencyHelper , Utils} from './config.js';
import { EventManager , BaseComponent} from './event-manager.js';

class CategoryChart extends BaseComponent {
    constructor() {
        super();
        this.isInitialized = false;
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.currentWeek = 'all';
        this.currentExpenses = [];
        this.currentCategories = [];
        this.activeCategory = null;
    }

    connectedCallback() {
        setTimeout(async () => {
        this.render();
        await new Promise(resolve => setTimeout(resolve, 50));
        this.setupEventListeners();
        this.isInitialized = true;
        await this.updateChart();
        }, 0);
    }

    setupEventListeners() {
        // Close button for category details
        this.querySelector('#categoryDetails .close-btn').addEventListener('click', () => {
            this.querySelector('#categoryDetails').classList.remove('show');
            this.activeCategory = null;
            this.updateDonutHighlight();
            this.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
        });

        // Expense list click delegation
        this.querySelector('#categoryExpensesList').addEventListener('click', (e) => {
            const row = e.target.closest('.expense-card');
            if (row) {
                const expense = this.currentExpenses.find(exp => exp.id == row.dataset.expenseId);
                if (expense) this.editExpense(expense);
            }
        });

        document.addEventListener('expenseadded', () => {
            if (this.isInitialized) this.updateChart();
        });

        document.addEventListener('datechange', (e) => {
            this.currentMonth = e.detail.month;
            this.currentYear = e.detail.year;
            this.currentWeek = e.detail.week;
            this.updateChart();
        });
    }

    formatAmount(amount) {
        return CurrencyHelper.format(amount);
    }

    formatDateCompact(date) {
        const expenseDate = new Date(date);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (expenseDate.toDateString() === today.toDateString()) return 'Today';
        if (expenseDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return expenseDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    }

    async updateChart() {
        if (!this.isInitialized) return;

        try {
            const response = await fetch(`/api/expenses?month=${this.currentMonth}&year=${this.currentYear}`);
            if (!response.ok) throw new Error('Failed to fetch expenses');

            const { expenses } = await response.json();

            const filteredExpenses = this.currentWeek === 'all' ? expenses : expenses.filter(expense => {
                const date = new Date(expense.date);
                const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                const firstDayOfWeek = firstDay.getDay();
                const dayOffset = date.getDate() + firstDayOfWeek - 1;
                const weekNumber = Math.ceil(dayOffset / 7);
                return `week${weekNumber}` === this.currentWeek;
            });

            this.renderChart(filteredExpenses);
        } catch (error) {
            console.error('Error updating chart:', error);
            if (this.isInitialized && document.readyState === 'complete') {
                window.showToast('Failed to update chart', 'error');
            }
        }
    }

    renderChart(expenses) {
        this.currentExpenses = expenses;

        const totalEl = this.querySelector('#chartTotal');
        const donutContainer = this.querySelector('#donutChart');
        const legendContainer = this.querySelector('#chartLegend');

        if (!expenses || expenses.length === 0) {
            if (totalEl) totalEl.textContent = this.formatAmount(0);
            if (donutContainer) donutContainer.innerHTML = this.renderEmptyDonut();
            if (legendContainer) legendContainer.innerHTML = `
                <div style="text-align: center; padding: 1rem; color: var(--outline);">
                    No expenses for this period
                </div>`;
            return;
        }

        const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
        if (totalEl) totalEl.textContent = this.formatAmount(total);

        // Group and sort by category
        const categoryTotals = expenses.reduce((acc, exp) => {
            acc[exp.category] = (acc[exp.category] || 0) + parseFloat(exp.amount);
            return acc;
        }, {});

        const sortedCategories = Object.entries(categoryTotals).sort(([,a], [,b]) => b - a);
        this.currentCategories = sortedCategories;

        // Render SVG donut
        if (donutContainer) {
            donutContainer.innerHTML = this.renderDonut(sortedCategories, total);
            this.setupSegmentListeners();
        }

        // Render legend
        if (legendContainer) {
            legendContainer.innerHTML = sortedCategories.map(([category, amount]) => {
                const color = CategoryHelper.getCategoryColor(category);
                const pct = Math.round((amount / total) * 100);
                const icon = CategoryHelper.getCategoryIcon(category);
                return `
                    <div class="legend-item" data-category="${category}">
                        <div class="legend-left">
                            <div class="legend-icon-dot" style="background: ${color};">
                                <span class="material-symbols-outlined" style="font-size: 0.75rem; color: #0E0E0E;">${icon}</span>
                            </div>
                            <span class="legend-label">${CategoryHelper.getCategoryLabel(category)}</span>
                        </div>
                        <div class="legend-right">
                            <span class="legend-amount">${this.formatAmount(amount)}</span>
                            <span class="legend-pct">${pct}%</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Legend click handlers
            legendContainer.querySelectorAll('.legend-item').forEach(item => {
                item.addEventListener('click', () => {
                    const category = item.dataset.category;
                    this.activeCategory = category;
                    this.updateDonutHighlight();
                    this.showCategoryDetails(category, this.currentExpenses);
                    legendContainer.querySelectorAll('.legend-item').forEach(i => {
                        i.classList.toggle('active', i.dataset.category === category);
                    });
                });
            });
        }
    }

    renderEmptyDonut() {
        return `
            <svg viewBox="0 0 200 200" class="donut-svg">
                <circle cx="100" cy="100" r="78" fill="none" stroke="var(--surface-container-highest)" stroke-width="22"/>
                <text x="100" y="96" text-anchor="middle" fill="var(--outline)" font-family="Inter" font-size="11">No data</text>
                <text x="100" y="114" text-anchor="middle" fill="var(--on-surface)" font-family="Manrope" font-weight="800" font-size="14">${this.formatAmount(0)}</text>
            </svg>
        `;
    }

    renderDonut(categories, total) {
        const cx = 100, cy = 100, r = 78;
        const circumference = 2 * Math.PI * r;
        let offset = 0;
        const gap = 2; // gap in degrees between segments

        const segments = categories.map(([category, amount]) => {
            const pct = amount / total;
            const gapPct = gap / 360;
            const segPct = Math.max(pct - gapPct, 0.005);
            const dashLength = segPct * circumference;
            const dashGap = circumference - dashLength;
            const rotation = (offset * 360) - 90; // -90 to start at top
            const color = CategoryHelper.getCategoryColor(category);

            const segment = `
                <circle
                    class="donut-segment"
                    data-category="${category}"
                    cx="${cx}" cy="${cy}" r="${r}"
                    fill="none"
                    stroke="${color}"
                    stroke-width="22"
                    stroke-dasharray="${dashLength} ${dashGap}"
                    transform="rotate(${rotation} ${cx} ${cy})"
                    style="cursor: pointer;"
                />
            `;
            offset += pct;
            return segment;
        });

        return `
            <svg viewBox="0 0 200 200" class="donut-svg">
                ${segments.join('')}
                <circle cx="${cx}" cy="${cy}" r="56" fill="var(--surface-container-lowest)"/>
                <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="var(--outline)" font-family="Inter" font-size="9" letter-spacing="0.12em">TOTAL</text>
                <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="var(--on-surface)" font-family="Manrope" font-weight="800" font-size="13">${this.formatAmount(total)}</text>
            </svg>
        `;
    }

    setupSegmentListeners() {
        this.querySelectorAll('.donut-segment').forEach(seg => {
            seg.addEventListener('click', () => {
                const category = seg.dataset.category;
                this.activeCategory = category;
                this.updateDonutHighlight();
                this.showCategoryDetails(category, this.currentExpenses);
                // Also highlight matching legend item
                this.querySelectorAll('.legend-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.category === category);
                });
            });
        });
    }

    updateDonutHighlight() {
        this.querySelectorAll('.donut-segment').forEach(seg => {
            if (this.activeCategory && seg.dataset.category !== this.activeCategory) {
                seg.style.opacity = '0.25';
                seg.style.strokeWidth = '20';
                seg.classList.remove('active');
            } else if (this.activeCategory && seg.dataset.category === this.activeCategory) {
                seg.style.opacity = '1';
                seg.style.strokeWidth = '30';
                seg.classList.add('active');
            } else {
                seg.style.opacity = '1';
                seg.style.strokeWidth = '24';
                seg.classList.remove('active');
            }
        });
    }

    showCategoryDetails(category, expenses) {
        const categoryExpenses = expenses
            .filter(exp => exp.category === category)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const total = categoryExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

        this.querySelector('#categoryDetailsTitle').textContent = CategoryHelper.getCategoryLabel(category);
        this.querySelector('#categoryDetailsIcon').textContent = CategoryHelper.getCategoryIcon(category);
        this.querySelector('#categoryTotal').textContent = this.formatAmount(total);

        const listEl = this.querySelector('#categoryExpensesList');

        if (categoryExpenses.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--outline);">
                    <span class="material-symbols-outlined" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">inbox</span>
                    No expenses in this category
                </div>
            `;
        } else {
            listEl.innerHTML = categoryExpenses.map(exp => `
                <div class="expense-card" data-expense-id="${exp.id}">
                    <div class="expense-card-left">
                        <div class="expense-card-desc">${exp.description}</div>
                        <div class="expense-card-meta">
                            <span>${this.formatDateCompact(exp.date)}</span>
                            <span class="meta-dot"></span>
                            <span class="source-badge source-${exp.source || 'manual'}">${(exp.source || 'manual') === 'bank_sync' ? 'Bank' : 'Manual'}</span>
                        </div>
                    </div>
                    <div class="expense-card-amount">${this.formatAmount(exp.amount)}</div>
                </div>
            `).join('');
        }

        this.querySelector('#categoryDetails').classList.add('show');
    }

    editExpense(expense) {
        const editUrl = `/add?edit=${expense.id}&amount=${expense.amount}&category=${expense.category}&description=${encodeURIComponent(expense.description)}`;
        window.location.href = editUrl;
    }

    render() {
        this.innerHTML = `
            <style>
                .chart-wrapper {
                    background: var(--surface-container);
                    border-radius: 1rem;
                    padding: 1.25rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                }
                .chart-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }
                .chart-header-left {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--on-surface);
                    font-weight: 600;
                    font-size: 0.875rem;
                }
                .chart-header-total {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    font-size: 1.25rem;
                    color: var(--primary);
                }
                .chart-body {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .donut-container {
                    display: flex;
                    justify-content: center;
                    width: 180px;
                    height: 180px;
                    margin: 0 auto;
                }
                .donut-svg {
                    width: 180px;
                    height: 180px;
                    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
                }
                .donut-segment {
                    transition: stroke-width 0.2s ease, opacity 0.2s ease;
                }
                .donut-segment:hover, .donut-segment.active {
                    stroke-width: 30 !important;
                    filter: brightness(1.15);
                }
                .legend-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.125rem;
                    width: 100%;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    padding: 0.4rem 0.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: background 0.15s ease;
                    gap: 0.5rem;
                }
                .legend-item:hover, .legend-item.active {
                    background: var(--surface-container-high);
                }
                .legend-item.active {
                    border-left: 3px solid var(--primary-container);
                    padding-left: calc(0.5rem - 3px);
                }
                .legend-left {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex: 1;
                    min-width: 0;
                }
                .legend-icon-dot {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .legend-label {
                    font-size: 0.8125rem;
                    color: var(--on-surface);
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    min-width: 0;
                    flex: 1;
                }
                .legend-right {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-shrink: 0;
                }
                .legend-amount {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 700;
                    font-size: 0.8125rem;
                    color: var(--on-surface);
                    white-space: nowrap;
                }
                .legend-pct {
                    font-size: 0.6875rem;
                    color: var(--outline);
                    min-width: 28px;
                    text-align: right;
                }

                /* Category Details Panel */
                .category-details {
                    display: none;
                    background: var(--surface-container);
                    border-radius: 1rem;
                    margin-top: 0.75rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                    overflow: hidden;
                    animation: slideDown 0.2s ease-out;
                }
                .category-details.show {
                    display: block;
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .details-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.1);
                }
                .details-header-left {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .details-header-left .material-symbols-outlined {
                    color: var(--primary);
                    font-size: 1.25rem;
                }
                .details-title {
                    font-weight: 700;
                    color: var(--on-surface);
                }
                .details-total {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    color: var(--primary);
                }
                .close-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--on-surface);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.15s;
                }
                .close-btn:hover {
                    background: rgba(255, 140, 0, 0.2);
                }
                .details-list {
                    max-height: 320px;
                    overflow-y: auto;
                }
                .expense-card {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem 1.25rem;
                    cursor: pointer;
                    transition: background 0.15s;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.06);
                }
                .expense-card:hover {
                    background: var(--surface-container-high);
                }
                .expense-card:last-child {
                    border-bottom: none;
                }
                .expense-card-left {
                    flex: 1;
                    min-width: 0;
                }
                .expense-card-desc {
                    font-weight: 600;
                    color: var(--on-surface);
                    font-size: 0.875rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .expense-card-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    margin-top: 0.125rem;
                    font-size: 0.6875rem;
                    color: var(--outline);
                }
                .meta-dot {
                    width: 3px;
                    height: 3px;
                    border-radius: 50%;
                    background: var(--outline-variant);
                }
                .source-badge {
                    font-size: 0.5625rem;
                    padding: 0.125rem 0.375rem;
                    border-radius: 9999px;
                    background: var(--surface-container-highest);
                    text-transform: uppercase;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                .source-manual { color: var(--primary); }
                .source-bank_sync { color: var(--tertiary); }
                .expense-card-amount {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    font-size: 0.9375rem;
                    color: var(--on-surface);
                    margin-left: 1rem;
                    flex-shrink: 0;
                }
            </style>

            <div class="chart-wrapper chart-container-modern modern-card">
                <div class="chart-header">
                    <div class="chart-header-left">
                        <span class="material-symbols-outlined" style="font-size: 1.125rem;">donut_large</span>
                        <span>Distribution</span>
                    </div>
                    <div class="chart-header-total" id="chartTotal">${this.formatAmount(0)}</div>
                </div>
                <div class="chart-body">
                    <div class="donut-container" id="donutChart">
                        ${this.renderEmptyDonut()}
                    </div>
                    <div class="legend-container" id="chartLegend"></div>
                </div>
            </div>

            <div class="category-details" id="categoryDetails">
                <div class="details-header">
                    <div class="details-header-left">
                        <span class="material-symbols-outlined" id="categoryDetailsIcon">category</span>
                        <span class="details-title" id="categoryDetailsTitle">Category</span>
                        <span class="details-total" id="categoryTotal">${this.formatAmount(0)}</span>
                    </div>
                    <button class="close-btn" aria-label="Close">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">close</span>
                    </button>
                </div>
                <div class="details-list" id="categoryExpensesList"></div>
            </div>
        `;
    }
}

customElements.define('category-chart', CategoryChart);
