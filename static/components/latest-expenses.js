import { CONFIG, CategoryHelper, CurrencyHelper, DateHelper } from './config.js';

class LatestExpenses extends HTMLElement {
    constructor() {
        super();
        this.currentPage = 1;
        this.perPage = parseInt(this.getAttribute('limit')) || 6;
        this.period = this.getAttribute('period') || 'all';
        this.mode = this.getAttribute('mode') || 'default';
        this.allExpenses = [];
        this.totalExpenses = 0;
        this.activeSwipeItem = null;

        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedYear = new Date().getFullYear();
        this.selectedWeek = 'all';
        this.useDateNavigation = false;
    }

    connectedCallback() {
        this.useDateNavigation = !!document.querySelector('date-navigation');
        if (this.mode === 'recent') this.useDateNavigation = false;

        this.render();
        this.setupDateChangeListener();
        this.loadAllExpenses();
    }

    setupDateChangeListener() {
        document.addEventListener('datechange', (e) => {
            if (this.useDateNavigation) {
                this.selectedMonth = e.detail.month;
                this.selectedYear = e.detail.year;
                this.selectedWeek = e.detail.week;
                this.currentPage = 1;
                this.loadAllExpenses();
            }
        });
    }

    render() {
        const showPeriodSelector = this.mode !== 'recent' && !this.useDateNavigation;

        this.innerHTML = `
            <div class="modern-card ${this.mode === 'recent' ? '' : 'chart-container-modern'}">
                ${showPeriodSelector ? `
                <div class="text-center mb-3">
                    <div class="period-selector">
                        <button type="button" class="period-btn ${this.period === 'today' ? 'active' : ''}" data-period="today">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">today</span>
                            <span>Today</span>
                        </button>
                        <button type="button" class="period-btn ${this.period === 'week' ? 'active' : ''}" data-period="week">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">date_range</span>
                            <span>Week</span>
                        </button>
                        <button type="button" class="period-btn ${this.period === 'all' ? 'active' : ''}" data-period="all">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">calendar_month</span>
                            <span>Month</span>
                        </button>
                    </div>
                </div>
                ` : ''}

                <div id="latestExpensesList" class="expenses-list">
                    <div class="text-center py-5">
                        <div class="spinner-border" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>

                <div id="paginationControls" class="d-none mt-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <button id="prevPageBtn" class="btn btn-sm btn-outline-primary" disabled>
                            <span class="material-symbols-outlined" style="font-size: 1rem;">chevron_left</span> Prev
                        </button>
                        <span class="text-muted" style="font-size: 0.8125rem;" id="pageInfo">Page 1</span>
                        <button id="nextPageBtn" class="btn btn-sm btn-outline-primary" disabled>
                            Next <span class="material-symbols-outlined" style="font-size: 1rem;">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .period-selector {
                    display: inline-flex;
                    gap: 0.25rem;
                    padding: 0.25rem;
                    background: var(--surface-container-high);
                    border-radius: 0.75rem;
                }

                .period-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.1rem;
                    padding: 0.4rem 0.7rem;
                    border: none;
                    background: transparent;
                    color: var(--on-surface-variant);
                    border-radius: 0.5rem;
                    font-size: 0.65rem;
                    font-weight: 600;
                    font-family: 'Inter', sans-serif;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    min-width: 50px;
                }

                .period-btn:hover {
                    background: rgba(255, 140, 0, 0.1);
                    color: var(--primary);
                }

                .period-btn.active {
                    background: var(--primary-container);
                    color: var(--on-primary);
                }

                .expenses-list {
                    min-height: 200px;
                }

                .swipe-container {
                    position: relative;
                    overflow: hidden;
                    border-bottom: 1px solid rgba(86, 67, 52, 0.08);
                    background: var(--surface-container);
                }
                .swipe-container:last-child { border-bottom: none; }

                .swipe-actions {
                    position: absolute;
                    right: 0;
                    top: 0;
                    bottom: 0;
                    display: flex;
                    align-items: stretch;
                    z-index: 1;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .swipe-container:has(.expense-item.swiped) .swipe-actions { opacity: 1; }

                .swipe-action {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 60px;
                    margin: 0.5rem 0.25rem;
                    color: white;
                    font-size: 0.65rem;
                    font-weight: 700;
                    flex-direction: column;
                    gap: 0.2rem;
                    border: none;
                    border-radius: 0.75rem;
                    cursor: pointer;
                    font-family: 'Inter', sans-serif;
                }
                .swipe-action-edit { background: var(--primary-container); color: var(--on-primary); }
                .swipe-action-delete { background: var(--error-container); color: var(--on-error-container); }
                .swipe-action:active { opacity: 0.8; transform: scale(0.95); }

                .expense-item {
                    position: relative;
                    padding: 0.875rem 1rem;
                    background: var(--surface-container);
                    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    z-index: 2;
                    touch-action: pan-y;
                    -webkit-user-select: none;
                    user-select: none;
                }
                .expense-item.swiping { transition: none; }
                .expense-item.swiped { transform: translateX(-135px); }

                .swipe-hint-btn {
                    background: var(--surface-container-high);
                    border: none;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    color: var(--on-surface-variant);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin-left: 0.5rem;
                }
                .swipe-hint-btn:active { background: var(--surface-bright); }

                .expense-amount {
                    font-family: 'Manrope', sans-serif;
                    font-size: 1rem;
                    font-weight: 700;
                }

                .expense-description {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--on-surface);
                    margin-bottom: 0.125rem;
                }

                .expense-date { font-size: 0.75rem; }

                .expense-category-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 0.75rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    background: var(--surface-container-highest);
                }

                @media (max-width: 768px) {
                    .expense-item { padding: 0.75rem 0.8rem; }
                    .expense-category-icon { width: 40px; height: 40px; }
                    .expense-amount { font-size: 0.9rem; }
                    .expense-description { font-size: 0.85rem; }
                }
            </style>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const buttons = this.querySelectorAll('[data-period]');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-period]');
                this.period = btn.dataset.period;
                this.currentPage = 1;
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadAllExpenses();
            });
        });

        const prevBtn = this.querySelector('#prevPageBtn');
        const nextBtn = this.querySelector('#nextPageBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.filterAndDisplayExpenses();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.getFilteredExpenses().length / this.perPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.filterAndDisplayExpenses();
                }
            });
        }
    }

    async loadAllExpenses() {
        const listContainer = this.querySelector('#latestExpensesList');
        listContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border" role="status"></div>
                <p class="text-muted mt-2" style="font-size: 0.8125rem;">Loading expenses...</p>
            </div>
        `;

        try {
            let monthsToFetch = [];

            if (this.mode === 'recent') {
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                monthsToFetch.push({ year: currentYear, month: currentMonth });
                const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
                const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
                monthsToFetch.push({ year: prevYear, month: prevMonth });
            } else if (this.useDateNavigation) {
                monthsToFetch.push({ year: this.selectedYear, month: this.selectedMonth });
            } else {
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                if (this.period === 'today' || this.period === 'week') {
                    monthsToFetch.push({ year: currentYear, month: currentMonth });
                    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
                    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
                    monthsToFetch.push({ year: prevYear, month: prevMonth });
                } else {
                    monthsToFetch.push({ year: currentYear, month: currentMonth });
                }
            }

            const allExpensesPromises = monthsToFetch.map(async ({ year, month }) => {
                const response = await fetch(`/api/expenses?month=${month}&year=${year}`);
                if (!response.ok) return [];
                const { expenses } = await response.json();
                return expenses;
            });

            const expensesArrays = await Promise.all(allExpensesPromises);
            this.allExpenses = expensesArrays.flat().sort((a, b) => new Date(b.date) - new Date(a.date));
            this.totalExpenses = this.allExpenses.length;
            this.filterAndDisplayExpenses();
        } catch (error) {
            console.error('Error loading expenses:', error);
            listContainer.innerHTML = `
                <div class="text-center py-5" style="color: var(--error);">
                    <span class="material-symbols-outlined" style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">error</span>
                    <p class="mb-1">Failed to load expenses</p>
                    <small class="text-muted">${error.message}</small>
                </div>
            `;
        }
    }

    getFilteredExpenses() {
        let filtered = [...this.allExpenses];

        if (this.mode === 'recent') {
            return filtered;
        } else if (this.useDateNavigation) {
            if (this.selectedWeek !== 'all') {
                filtered = filtered.filter(expense => {
                    const date = new Date(expense.date);
                    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                    const firstDayOfWeek = firstDay.getDay();
                    const dayOffset = date.getDate() + firstDayOfWeek - 1;
                    const weekNumber = Math.ceil(dayOffset / 7);
                    return `week${weekNumber}` === this.selectedWeek;
                });
            }
        } else {
            if (this.period === 'today') {
                const today = new Date().toDateString();
                filtered = filtered.filter(exp => new Date(exp.date).toDateString() === today);
            } else if (this.period === 'week') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                weekAgo.setHours(0, 0, 0, 0);
                filtered = filtered.filter(exp => {
                    const d = new Date(exp.date);
                    d.setHours(0, 0, 0, 0);
                    return d >= weekAgo;
                });
            }
        }

        return filtered;
    }

    filterAndDisplayExpenses() {
        const filteredExpenses = this.getFilteredExpenses();

        if (this.mode === 'recent') {
            const recentExpenses = filteredExpenses.slice(0, this.perPage);
            this.renderExpenses(recentExpenses, recentExpenses.length);
            const paginationDiv = this.querySelector('#paginationControls');
            if (paginationDiv) paginationDiv.classList.add('d-none');
        } else {
            const totalPages = Math.ceil(filteredExpenses.length / this.perPage);
            const startIndex = (this.currentPage - 1) * this.perPage;
            const endIndex = startIndex + this.perPage;
            const pageExpenses = filteredExpenses.slice(startIndex, endIndex);

            this.renderExpenses(pageExpenses, filteredExpenses.length);
            this.updatePaginationControls(totalPages, filteredExpenses.length);
        }
    }

    renderExpenses(expenses, totalCount) {
        const listContainer = this.querySelector('#latestExpensesList');

        if (!expenses || expenses.length === 0) {
            let periodLabel;
            let hint = '';

            if (this.mode === 'recent') {
                periodLabel = 'yet';
                hint = '<small>Add your first expense to get started!</small>';
            } else if (this.useDateNavigation) {
                periodLabel = this.selectedWeek === 'all' ? 'this month' : `week ${this.selectedWeek.replace('week', '')}`;
            } else {
                periodLabel = this.period === 'today' ? 'today' : this.period === 'week' ? 'this week' : 'this month';
            }

            listContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <span class="material-symbols-outlined" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">inbox</span>
                    <p class="mb-0">No expenses ${periodLabel}</p>
                    ${hint}
                </div>
            `;
            return;
        }

        listContainer.innerHTML = expenses.map(expense => {
            const categoryColor = CategoryHelper.getCategoryColor(expense.category);
            const categoryIcon = CategoryHelper.getCategoryIcon(expense.category);
            const categoryLabel = CategoryHelper.getCategoryLabel(expense.category);
            const sourceBadge = expense.source === 'bank_sync'
                ? `<span class="source-badge bank"><span class="material-symbols-outlined" style="font-size: 0.625rem;">account_balance</span>Bank</span>`
                : expense.source === 'manual'
                ? `<span class="source-badge manual"><span class="material-symbols-outlined" style="font-size: 0.625rem;">edit</span>Manual</span>`
                : '';

            return `
                <div class="swipe-container" data-expense-id="${expense.id}">
                    <div class="swipe-actions">
                        <button class="swipe-action swipe-action-edit" data-action="edit">
                            <span class="material-symbols-outlined" style="font-size: 1.125rem;">edit</span>
                            <span>Edit</span>
                        </button>
                        <button class="swipe-action swipe-action-delete" data-action="delete">
                            <span class="material-symbols-outlined" style="font-size: 1.125rem;">delete</span>
                            <span>Delete</span>
                        </button>
                    </div>
                    <div class="expense-item d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center flex-grow-1 me-3">
                            <div class="expense-category-icon me-3">
                                <span class="material-symbols-outlined" style="color: ${categoryColor}; font-size: 1.25rem;">${categoryIcon}</span>
                            </div>
                            <div class="flex-grow-1 min-width-0">
                                <div class="expense-description text-truncate">${expense.description}</div>
                                <div class="expense-date text-muted d-flex align-items-center gap-2">
                                    <span>${categoryLabel}</span>
                                    <span style="width: 3px; height: 3px; border-radius: 50%; background: var(--outline-variant); display: inline-block;"></span>
                                    <span>${this.formatExpenseDate(expense.date)}</span>
                                    ${sourceBadge}
                                </div>
                            </div>
                        </div>
                        <div class="expense-amount text-end text-nowrap">
                            ${CurrencyHelper.format(expense.amount)}
                        </div>
                        <button class="swipe-hint-btn" title="Edit or Delete">
                            <span class="material-symbols-outlined" style="font-size: 1rem;">more_horiz</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this.setupSwipeHandlers(listContainer, expenses);
    }

    setupSwipeHandlers(container, expenses) {
        const swipeContainers = container.querySelectorAll('.swipe-container');

        swipeContainers.forEach(swipeContainer => {
            const expenseItem = swipeContainer.querySelector('.expense-item');
            const expenseId = swipeContainer.dataset.expenseId;
            const expense = expenses.find(e => e.id == expenseId);

            let startX = 0, startY = 0, currentX = 0;
            let isDragging = false, isHorizontalSwipe = false;

            expenseItem.addEventListener('touchstart', (e) => {
                if (this.activeSwipeItem && this.activeSwipeItem !== expenseItem) {
                    this.activeSwipeItem.classList.remove('swiped');
                }
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                currentX = startX;
                isDragging = true;
                isHorizontalSwipe = false;
                expenseItem.classList.add('swiping');
            }, { passive: true });

            expenseItem.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentX = e.touches[0].clientX;
                const diffX = currentX - startX;
                const diffY = e.touches[0].clientY - startY;

                if (!isHorizontalSwipe && Math.abs(diffX) > 10) {
                    isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
                }

                if (isHorizontalSwipe) {
                    e.preventDefault();
                    if (diffX < 0) {
                        expenseItem.style.transform = `translateX(${Math.max(diffX, -135)}px)`;
                    } else if (expenseItem.classList.contains('swiped')) {
                        expenseItem.style.transform = `translateX(${Math.min(-135 + diffX, 0)}px)`;
                    }
                }
            }, { passive: false });

            expenseItem.addEventListener('touchend', () => {
                if (!isDragging) return;
                isDragging = false;
                expenseItem.classList.remove('swiping');
                const diffX = currentX - startX;

                if (isHorizontalSwipe) {
                    if (diffX < -50) {
                        expenseItem.classList.add('swiped');
                        expenseItem.style.transform = '';
                        this.activeSwipeItem = expenseItem;
                    } else if (diffX > 50 && expenseItem.classList.contains('swiped')) {
                        expenseItem.classList.remove('swiped');
                        expenseItem.style.transform = '';
                        this.activeSwipeItem = null;
                    } else {
                        expenseItem.style.transform = '';
                    }
                } else if (Math.abs(diffX) < 10) {
                    if (expenseItem.classList.contains('swiped')) {
                        expenseItem.classList.remove('swiped');
                        expenseItem.style.transform = '';
                        this.activeSwipeItem = null;
                    }
                }
                startX = 0; startY = 0; currentX = 0; isHorizontalSwipe = false;
            });

            expenseItem.addEventListener('click', (e) => {
                if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
                if (expenseItem.classList.contains('swiped')) {
                    expenseItem.classList.remove('swiped');
                    this.activeSwipeItem = null;
                }
            });

            const editBtn = swipeContainer.querySelector('[data-action="edit"]');
            const deleteBtn = swipeContainer.querySelector('[data-action="delete"]');
            const hintBtn = swipeContainer.querySelector('.swipe-hint-btn');

            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                expenseItem.classList.remove('swiped');
                this.activeSwipeItem = null;
                this.editExpense(expense);
            });

            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDelete(expense, swipeContainer);
            });

            hintBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.activeSwipeItem && this.activeSwipeItem !== expenseItem) {
                    this.activeSwipeItem.classList.remove('swiped');
                }
                if (expenseItem.classList.contains('swiped')) {
                    expenseItem.classList.remove('swiped');
                    this.activeSwipeItem = null;
                } else {
                    expenseItem.classList.add('swiped');
                    this.activeSwipeItem = expenseItem;
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (this.activeSwipeItem && !e.target.closest('.swipe-container')) {
                this.activeSwipeItem.classList.remove('swiped');
                this.activeSwipeItem = null;
            }
        });
    }

    async confirmDelete(expense, container) {
        const confirmed = confirm(`Delete "${expense.description}" (${CurrencyHelper.format(expense.amount)})?`);
        if (confirmed) {
            try {
                const response = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to delete');

                container.style.transition = 'all 0.3s ease';
                container.style.transform = 'translateX(-100%)';
                container.style.opacity = '0';
                container.style.maxHeight = container.offsetHeight + 'px';

                setTimeout(() => {
                    container.style.maxHeight = '0';
                    container.style.padding = '0';
                    container.style.margin = '0';
                }, 300);

                setTimeout(() => {
                    this.loadAllExpenses();
                    if (window.showToast) window.showToast('Expense deleted', 'success');
                }, 500);
            } catch (error) {
                if (window.showToast) window.showToast('Failed to delete expense', 'error');
                const expenseItem = container.querySelector('.expense-item');
                expenseItem.classList.remove('swiped');
                this.activeSwipeItem = null;
            }
        } else {
            const expenseItem = container.querySelector('.expense-item');
            expenseItem.classList.remove('swiped');
            this.activeSwipeItem = null;
        }
    }

    updatePaginationControls(totalPages, totalCount) {
        const paginationDiv = this.querySelector('#paginationControls');
        const prevBtn = this.querySelector('#prevPageBtn');
        const nextBtn = this.querySelector('#nextPageBtn');
        const pageInfo = this.querySelector('#pageInfo');

        if (totalPages <= 1) {
            paginationDiv.classList.add('d-none');
            return;
        }

        paginationDiv.classList.remove('d-none');
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;

        const startItem = (this.currentPage - 1) * this.perPage + 1;
        const endItem = Math.min(this.currentPage * this.perPage, totalCount);
        pageInfo.textContent = `${startItem}-${endItem} of ${totalCount}`;
    }

    formatExpenseDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const expenseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (expenseDate.getTime() === today.getTime()) {
            return `Today, ${date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (expenseDate.getTime() === yesterday.getTime()) {
            return `Yesterday, ${date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            return date.toLocaleDateString('default', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
    }

    editExpense(expense) {
        const editUrl = `/add?edit=${expense.id}&amount=${expense.amount}&category=${expense.category}&description=${encodeURIComponent(expense.description)}`;
        window.location.href = editUrl;
    }
}

customElements.define('latest-expenses', LatestExpenses);
