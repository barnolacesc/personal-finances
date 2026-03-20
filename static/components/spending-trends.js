import { CONFIG, CategoryHelper, CurrencyHelper } from './config.js';

class SpendingTrends extends HTMLElement {
    constructor() {
        super();
        this.mode = 'weekly'; // 'weekly' or 'monthly'
        this.expenses = [];
        this.periods = [];
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.loadData();
    }

    setupEventListeners() {
        this.querySelector('#weeklyToggle').addEventListener('click', () => {
            this.mode = 'weekly';
            this.updateToggle();
            this.computeTrends();
        });
        this.querySelector('#monthlyToggle').addEventListener('click', () => {
            this.mode = 'monthly';
            this.updateToggle();
            this.computeTrends();
        });
    }

    updateToggle() {
        const weekly = this.querySelector('#weeklyToggle');
        const monthly = this.querySelector('#monthlyToggle');
        if (this.mode === 'weekly') {
            weekly.classList.add('active');
            monthly.classList.remove('active');
        } else {
            monthly.classList.add('active');
            weekly.classList.remove('active');
        }
    }

    async loadData() {
        try {
            // Fetch last 4 months of data
            const now = new Date();
            const allExpenses = [];

            for (let i = 0; i < 4; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const month = d.getMonth() + 1;
                const year = d.getFullYear();
                const res = await fetch(`/api/expenses?month=${month}&year=${year}`);
                if (res.ok) {
                    const data = await res.json();
                    allExpenses.push(...(data.expenses || []));
                }
            }

            this.expenses = allExpenses;
            this.computeTrends();
        } catch (error) {
            console.error('Error loading trends data:', error);
            window.showToast('Failed to load trends data', 'error');
        }
    }

    computeTrends() {
        if (this.mode === 'weekly') {
            this.computeWeekly();
        } else {
            this.computeMonthly();
        }
    }

    computeWeekly() {
        const now = new Date();
        const periods = [];

        for (let i = 3; i >= 0; i--) {
            const weekEnd = new Date(now);
            weekEnd.setDate(weekEnd.getDate() - (i * 7));
            const weekStart = new Date(weekEnd);
            weekStart.setDate(weekStart.getDate() - 6);

            const weekExpenses = this.expenses.filter(exp => {
                const d = new Date(exp.date);
                return d >= weekStart && d <= weekEnd;
            });

            const total = weekExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
            const weekNum = this.getWeekNumber(weekStart);

            periods.push({
                label: i === 0 ? 'CURRENT' : `W${weekNum}`,
                total,
                isCurrent: i === 0,
                expenses: weekExpenses
            });
        }

        this.periods = periods;
        this.renderTrends();
    }

    computeMonthly() {
        const now = new Date();
        const periods = [];

        for (let i = 3; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthExpenses = this.expenses.filter(exp => {
                const ed = new Date(exp.date);
                return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
            });

            const total = monthExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

            periods.push({
                label: i === 0 ? 'CURRENT' : d.toLocaleDateString('default', { month: 'short' }),
                total,
                isCurrent: i === 0,
                expenses: monthExpenses
            });
        }

        this.periods = periods;
        this.renderTrends();
    }

    getWeekNumber(date) {
        const start = new Date(date.getFullYear(), 0, 1);
        const diff = date - start;
        return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
    }

    renderTrends() {
        const grandTotal = this.periods.reduce((s, p) => s + p.total, 0);
        const maxTotal = Math.max(...this.periods.map(p => p.total), 1);
        const currentTotal = this.periods.find(p => p.isCurrent)?.total || 0;
        const prevTotal = this.periods.length >= 2 ? this.periods[this.periods.length - 2].total : 0;
        const deltaPercent = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 0;
        const deltaSign = deltaPercent > 0 ? '+' : '';

        // Compute daily avg and projected
        const currentPeriod = this.periods.find(p => p.isCurrent);
        const daysInPeriod = this.mode === 'weekly' ? 7 : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const daysSoFar = this.mode === 'weekly'
            ? Math.min(new Date().getDay() || 7, 7)
            : new Date().getDate();
        const dailyAvg = daysSoFar > 0 ? currentTotal / daysSoFar : 0;
        const projected = dailyAvg * daysInPeriod;

        // Category velocity
        const categoryVelocity = this.computeCategoryVelocity();

        // Bar chart
        const chartEl = this.querySelector('#barChart');
        chartEl.innerHTML = this.periods.map(p => {
            const heightPct = maxTotal > 0 ? (p.total / maxTotal) * 100 : 5;
            return `
                <div class="bar-col">
                    <div class="bar-wrapper">
                        <div class="bar ${p.isCurrent ? 'bar-current' : 'bar-past'}"
                             style="height: ${Math.max(heightPct, 5)}%;">
                        </div>
                    </div>
                    <span class="bar-label ${p.isCurrent ? 'bar-label-current' : ''}">${p.label}</span>
                    <span class="bar-amount">${CurrencyHelper.format(p.total)}</span>
                </div>
            `;
        }).join('');

        // Header stats
        this.querySelector('#periodLabel').textContent = this.mode === 'weekly' ? 'Last 4 Weeks' : 'Last 4 Months';
        this.querySelector('#grandTotal').textContent = CurrencyHelper.format(grandTotal);
        this.querySelector('#deltaText').textContent = prevTotal > 0 ? `${deltaSign}${deltaPercent}% vs prev.` : '';
        this.querySelector('#deltaText').className = `delta-text ${deltaPercent > 0 ? 'delta-up' : 'delta-down'}`;

        // Stats
        this.querySelector('#dailyAvg').textContent = CurrencyHelper.format(dailyAvg);
        this.querySelector('#projected').textContent = CurrencyHelper.format(projected);

        // Category velocity cards
        const velocityEl = this.querySelector('#categoryVelocity');
        if (categoryVelocity.length === 0) {
            velocityEl.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; color: var(--outline); font-size: 0.8125rem;">
                    Not enough data to show category trends
                </div>
            `;
        } else {
            velocityEl.innerHTML = categoryVelocity.map(cv => `
                <div class="velocity-card">
                    <div class="velocity-left">
                        <div class="velocity-icon" style="color: ${cv.color};">
                            <span class="material-symbols-outlined">${cv.icon}</span>
                        </div>
                        <div>
                            <div class="velocity-name">${cv.label}</div>
                            <div class="velocity-sub">${CurrencyHelper.format(cv.current)}</div>
                        </div>
                    </div>
                    <div class="velocity-right">
                        <div class="velocity-delta ${cv.delta > 0 ? 'delta-up' : cv.delta < 0 ? 'delta-down' : ''}">${cv.delta > 0 ? '+' : ''}${cv.delta.toFixed(0)}%</div>
                        <div class="velocity-vs">vs prev. ${this.mode === 'weekly' ? 'week' : 'month'}</div>
                    </div>
                </div>
            `).join('');
        }

        // Smart alert
        this.renderSmartAlert();
    }

    computeCategoryVelocity() {
        if (this.periods.length < 2) return [];

        const current = this.periods[this.periods.length - 1];
        const prev = this.periods[this.periods.length - 2];

        const currentByCategory = {};
        const prevByCategory = {};

        current.expenses.forEach(exp => {
            currentByCategory[exp.category] = (currentByCategory[exp.category] || 0) + parseFloat(exp.amount);
        });
        prev.expenses.forEach(exp => {
            prevByCategory[exp.category] = (prevByCategory[exp.category] || 0) + parseFloat(exp.amount);
        });

        const allCats = new Set([...Object.keys(currentByCategory), ...Object.keys(prevByCategory)]);
        const results = [];

        allCats.forEach(cat => {
            const cur = currentByCategory[cat] || 0;
            const pre = prevByCategory[cat] || 0;
            if (cur === 0 && pre === 0) return;

            const delta = pre > 0 ? ((cur - pre) / pre) * 100 : (cur > 0 ? 100 : 0);

            results.push({
                category: cat,
                label: CategoryHelper.getCategoryLabel(cat),
                icon: CategoryHelper.getCategoryIcon(cat),
                color: CategoryHelper.getCategoryColor(cat),
                current: cur,
                previous: pre,
                delta
            });
        });

        return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
    }

    renderSmartAlert() {
        const alertEl = this.querySelector('#smartAlert');
        if (this.periods.length < 2 || this.expenses.length < 5) {
            alertEl.style.display = 'none';
            return;
        }

        const current = this.periods[this.periods.length - 1];
        const prev = this.periods[this.periods.length - 2];

        if (prev.total === 0) {
            alertEl.style.display = 'none';
            return;
        }

        const diff = ((current.total - prev.total) / prev.total * 100).toFixed(0);
        let message;
        if (diff < -5) {
            message = `You're spending ${Math.abs(diff)}% less than last ${this.mode === 'weekly' ? 'week' : 'month'}. Keep it up!`;
        } else if (diff > 10) {
            message = `Spending is up ${diff}% compared to last ${this.mode === 'weekly' ? 'week' : 'month'}. Review your recent expenses.`;
        } else {
            message = `Your spending is tracking close to last ${this.mode === 'weekly' ? 'week' : 'month'} — stable at ${CurrencyHelper.format(current.total)}.`;
        }

        alertEl.style.display = 'block';
        this.querySelector('#smartAlertText').textContent = message;
    }

    render() {
        this.innerHTML = `
            <style>
                .trends-toggle {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 1.25rem;
                }
                .toggle-container {
                    background: var(--surface-container);
                    border-radius: 9999px;
                    padding: 0.25rem;
                    display: flex;
                    width: 100%;
                    max-width: 280px;
                }
                .toggle-btn {
                    flex: 1;
                    padding: 0.5rem;
                    border-radius: 9999px;
                    border: none;
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: transparent;
                    color: var(--on-surface-variant);
                }
                .toggle-btn.active {
                    background: var(--primary-container);
                    color: var(--on-primary);
                }
                .toggle-btn:hover:not(.active) {
                    color: var(--on-surface);
                }

                /* Chart section */
                .chart-section {
                    background: var(--surface-container);
                    border-radius: 1rem;
                    padding: 1.5rem;
                    margin-bottom: 1rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                }
                .chart-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-bottom: 1.5rem;
                }
                .chart-header-left h2 {
                    font-size: 0.625rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    color: var(--on-surface-variant);
                    margin: 0 0 0.25rem;
                }
                .chart-header-left .total {
                    font-family: 'Manrope', sans-serif;
                    font-size: 1.75rem;
                    font-weight: 800;
                    color: var(--on-surface);
                }
                .delta-text {
                    font-size: 0.8125rem;
                    font-weight: 700;
                }
                .delta-up { color: var(--error); }
                .delta-down { color: var(--tertiary); }

                /* Bar chart */
                .bar-chart {
                    height: 180px;
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 1rem;
                }
                .bar-col {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.375rem;
                }
                .bar-wrapper {
                    width: 100%;
                    height: 140px;
                    display: flex;
                    align-items: flex-end;
                }
                .bar {
                    width: 100%;
                    border-radius: 0.5rem 0.5rem 0 0;
                    transition: height 0.4s ease;
                    position: relative;
                }
                .bar-past {
                    background: var(--surface-container-highest);
                }
                .bar-past::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: var(--primary-container);
                    opacity: 0.15;
                    border-radius: inherit;
                    transition: opacity 0.2s;
                }
                .bar-col:hover .bar-past::after {
                    opacity: 0.35;
                }
                .bar-current {
                    background: var(--primary-container);
                    box-shadow: 0 -8px 20px -5px rgba(255, 140, 0, 0.3);
                }
                .bar-label {
                    font-size: 0.625rem;
                    font-weight: 700;
                    color: var(--on-surface-variant);
                    text-transform: uppercase;
                }
                .bar-label-current {
                    color: var(--primary);
                }
                .bar-amount {
                    font-size: 0.5625rem;
                    color: var(--outline);
                    font-weight: 600;
                }

                /* Stats grid */
                .stats-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.75rem;
                    margin-bottom: 1rem;
                }
                .stat-card {
                    background: var(--surface-container);
                    border-radius: 0.75rem;
                    padding: 1rem 1.25rem;
                    border-left: 4px solid;
                    border-color: var(--primary-container);
                }
                .stat-card:nth-child(2) {
                    border-color: var(--tertiary);
                }
                .stat-label {
                    font-size: 0.625rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: var(--on-surface-variant);
                    margin-bottom: 0.25rem;
                }
                .stat-value {
                    font-family: 'Manrope', sans-serif;
                    font-size: 1.375rem;
                    font-weight: 800;
                    color: var(--on-surface);
                }

                /* Category velocity */
                .velocity-section-title {
                    font-size: 0.625rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    color: var(--outline);
                    margin-bottom: 0.75rem;
                    padding-left: 0.25rem;
                }
                .velocity-card {
                    background: var(--surface-container-low);
                    border-radius: 0.75rem;
                    padding: 1rem;
                    margin-bottom: 0.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transition: background 0.15s;
                }
                .velocity-card:hover {
                    background: var(--surface-container);
                }
                .velocity-left {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .velocity-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: var(--surface-container-highest);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .velocity-icon .material-symbols-outlined {
                    font-size: 1.25rem;
                }
                .velocity-name {
                    font-weight: 700;
                    color: var(--on-surface);
                    font-size: 0.875rem;
                }
                .velocity-sub {
                    font-size: 0.75rem;
                    color: var(--on-surface-variant);
                }
                .velocity-right {
                    text-align: right;
                }
                .velocity-delta {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 800;
                    font-size: 1rem;
                    color: var(--on-surface);
                }
                .velocity-delta.delta-up { color: var(--error); }
                .velocity-delta.delta-down { color: var(--tertiary); }
                .velocity-vs {
                    font-size: 0.5625rem;
                    font-weight: 700;
                    color: var(--outline);
                    text-transform: uppercase;
                    letter-spacing: -0.02em;
                }

                /* Smart alert */
                .smart-alert {
                    background: linear-gradient(135deg, var(--primary-container), #B36200);
                    border-radius: 0.75rem;
                    padding: 1.25rem;
                    color: var(--on-primary);
                    margin-top: 1rem;
                    display: none;
                }
                .smart-alert-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    margin-bottom: 0.75rem;
                }
                .smart-alert-header .material-symbols-outlined {
                    font-size: 2rem;
                    font-variation-settings: 'FILL' 1;
                }
                .smart-alert-badge {
                    font-size: 0.5625rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.25rem;
                }
                .smart-alert-text {
                    font-family: 'Manrope', sans-serif;
                    font-weight: 700;
                    font-size: 0.9375rem;
                    line-height: 1.4;
                }
            </style>

            <!-- Toggle -->
            <div class="trends-toggle">
                <div class="toggle-container">
                    <button class="toggle-btn active" id="weeklyToggle">Weekly</button>
                    <button class="toggle-btn" id="monthlyToggle">Monthly</button>
                </div>
            </div>

            <!-- Chart Section -->
            <div class="chart-section">
                <div class="chart-header">
                    <div class="chart-header-left">
                        <h2 id="periodLabel">Last 4 Weeks</h2>
                        <div class="total" id="grandTotal">${CurrencyHelper.format(0)}</div>
                    </div>
                    <div>
                        <span class="delta-text" id="deltaText"></span>
                    </div>
                </div>
                <div class="bar-chart" id="barChart"></div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Daily Avg</div>
                    <div class="stat-value" id="dailyAvg">${CurrencyHelper.format(0)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Projected</div>
                    <div class="stat-value" id="projected">${CurrencyHelper.format(0)}</div>
                </div>
            </div>

            <!-- Category Velocity -->
            <div class="velocity-section-title">Category Velocity</div>
            <div id="categoryVelocity"></div>

            <!-- Smart Alert -->
            <div class="smart-alert" id="smartAlert">
                <div class="smart-alert-header">
                    <span class="material-symbols-outlined">bolt</span>
                    <span class="smart-alert-badge">Smart Alert</span>
                </div>
                <div class="smart-alert-text" id="smartAlertText"></div>
            </div>
        `;
    }
}

customElements.define('spending-trends', SpendingTrends);
