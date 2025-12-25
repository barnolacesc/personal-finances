import { CONFIG, CategoryHelper, CurrencyHelper, DateHelper } from './config.js';

class LatestExpenses extends HTMLElement {
    constructor() {
        super();
        this.currentPage = 1;
        this.perPage = parseInt(this.getAttribute('limit')) || 6;
        this.period = this.getAttribute('period') || 'all'; // 'all', 'week', 'today'
        this.mode = this.getAttribute('mode') || 'default'; // 'default', 'recent'
        this.allExpenses = []; // Store all fetched expenses
        this.totalExpenses = 0;
        this.activeSwipeItem = null; // Track currently swiped item

        // For syncing with date-navigation on expenses page
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedYear = new Date().getFullYear();
        this.selectedWeek = 'all';
        this.useDateNavigation = false; // Will be true if date-navigation exists on page
    }

    connectedCallback() {
        // Check if we're on a page with date-navigation
        this.useDateNavigation = !!document.querySelector('date-navigation');

        // Recent mode is simple - no selectors, no date-navigation sync
        if (this.mode === 'recent') {
            this.useDateNavigation = false;
        }

        this.render();
        this.setupDateChangeListener();
        this.loadAllExpenses();
    }

    setupDateChangeListener() {
        // Listen for date changes from date-navigation component
        document.addEventListener('datechange', (e) => {
            if (this.useDateNavigation) {
                this.selectedMonth = e.detail.month;
                this.selectedYear = e.detail.year;
                this.selectedWeek = e.detail.week;
                this.currentPage = 1; // Reset to first page
                this.loadAllExpenses();
            }
        });
    }

    render() {
        // Hide period selector in recent mode or when using date-navigation
        const showPeriodSelector = this.mode !== 'recent' && !this.useDateNavigation;

        this.innerHTML = `
            <div class="modern-card ${this.mode === 'recent' ? 'recent-expenses-card' : 'chart-container-modern'}">
                ${showPeriodSelector ? `
                <div class="text-center mb-3">
                    <div class="period-selector-modern">
                        <button type="button" class="period-btn ${this.period === 'today' ? 'active' : ''}" data-period="today">
                            <i class="bi bi-calendar-day"></i>
                            <span>Today</span>
                        </button>
                        <button type="button" class="period-btn ${this.period === 'week' ? 'active' : ''}" data-period="week">
                            <i class="bi bi-calendar-week"></i>
                            <span>Week</span>
                        </button>
                        <button type="button" class="period-btn ${this.period === 'all' ? 'active' : ''}" data-period="all">
                            <i class="bi bi-calendar-month"></i>
                            <span>Month</span>
                        </button>
                    </div>
                </div>
                ` : ''}

                <div id="latestExpensesList" class="expenses-list">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>

                <!-- Pagination Controls -->
                <div id="paginationControls" class="d-none mt-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <button id="prevPageBtn" class="btn btn-sm btn-outline-primary" disabled>
                            <i class="bi bi-chevron-left"></i> Previous
                        </button>
                        <span class="text-muted small" id="pageInfo">Page 1</span>
                        <button id="nextPageBtn" class="btn btn-sm btn-outline-primary" disabled>
                            Next <i class="bi bi-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>

            <style>
                /* Period Selector - Modern Pill Style */
                .period-selector-modern {
                    display: inline-flex;
                    gap: 0.375rem;
                    padding: 0.25rem;
                    background: var(--surface-secondary);
                    border-radius: 10px;
                    border: 1px solid var(--card-border);
                }

                .period-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 0.15rem;
                    padding: 0.45rem 0.75rem;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    border-radius: 7px;
                    font-size: 0.7rem;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    cursor: pointer;
                    min-width: 55px;
                }

                .period-btn i {
                    font-size: 0.95rem;
                    transition: transform 0.2s ease;
                }

                .period-btn:hover {
                    background: rgba(0, 122, 255, 0.1);
                    color: var(--primary-color);
                }

                .period-btn:hover i {
                    transform: scale(1.1);
                }

                .period-btn.active {
                    background: var(--primary-color);
                    color: white;
                    box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
                }

                .period-btn.active i {
                    transform: scale(1.05);
                }

                .expenses-list {
                    min-height: 300px;
                    border-radius: 0.5rem;
                }

                /* Swipeable expense item container */
                .swipe-container {
                    position: relative;
                    overflow: hidden;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-card);
                }

                .swipe-container:last-child {
                    border-bottom: none;
                }

                /* Action buttons behind the content - only visible when swiped */
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

                .swipe-container:has(.expense-item.swiped) .swipe-actions {
                    opacity: 1;
                }

                .swipe-action {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 60px;
                    margin: 0.5rem 0.25rem;
                    color: white;
                    font-size: 0.7rem;
                    font-weight: 600;
                    flex-direction: column;
                    gap: 0.25rem;
                    border: none;
                    border-radius: 12px;
                    cursor: pointer;
                }

                .swipe-action i {
                    font-size: 1.1rem;
                }

                .swipe-action-edit {
                    background: var(--primary-color, #007AFF);
                }

                .swipe-action-delete {
                    background: #FF3B30;
                }

                .swipe-action:active {
                    opacity: 0.8;
                    transform: scale(0.95);
                }

                /* The actual expense content */
                .expense-item {
                    position: relative;
                    padding: 0.875rem 1rem;
                    background-color: var(--bg-card);
                    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    z-index: 2;
                    touch-action: pan-y;
                    -webkit-user-select: none;
                    user-select: none;
                    margin: 0;
                    width: 100%;
                    box-sizing: border-box;
                }

                .expense-item.swiping {
                    transition: none;
                }

                .expense-item.swiped {
                    transform: translateX(-135px);
                }


                /* Swipe hint button (three dots) */
                .swipe-hint-btn {
                    background: var(--bg-secondary);
                    border: none;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    padding: 0;
                    margin-left: 0.75rem;
                    color: var(--text-secondary);
                    font-size: 1rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .swipe-hint-btn:active {
                    background: var(--border-color);
                }

                .expense-amount {
                    font-size: 1rem;
                    font-weight: 600;
                }

                .expense-description {
                    font-size: 0.9rem;
                    margin-bottom: 0.25rem;
                    color: var(--text-primary);
                }

                .expense-date {
                    font-size: 0.75rem;
                    opacity: 0.7;
                }

                .expense-category-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                @media (max-width: 768px) {
                    .period-selector-modern {
                        gap: 0.3rem;
                        padding: 0.2rem;
                    }

                    .period-btn {
                        padding: 0.4rem 0.65rem;
                        font-size: 0.65rem;
                        min-width: 50px;
                        gap: 0.1rem;
                    }

                    .period-btn i {
                        font-size: 0.9rem;
                    }

                    .expense-item {
                        padding: 0.75rem 0.8rem;
                    }

                    .expense-amount {
                        font-size: 0.9rem;
                    }

                    .expense-description {
                        font-size: 0.85rem;
                    }

                    .expense-category-icon {
                        width: 36px;
                        height: 36px;
                    }
                }
            </style>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Period filter buttons
        const buttons = this.querySelectorAll('[data-period]');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.period = e.target.dataset.period;
                this.currentPage = 1; // Reset to first page
                buttons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                // Reload expenses when period changes to fetch appropriate data
                this.loadAllExpenses();
            });
        });

        // Pagination buttons
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
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted mt-2 small">Loading expenses...</p>
            </div>
        `;

        try {
            let monthsToFetch = [];

            if (this.mode === 'recent') {
                // Recent mode - fetch last 2 months to get recent expenses
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                monthsToFetch.push({ year: currentYear, month: currentMonth });

                // Add previous month
                const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
                const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
                monthsToFetch.push({ year: prevYear, month: prevMonth });
            } else if (this.useDateNavigation) {
                // On expenses page - use the selected month/year from date-navigation
                monthsToFetch.push({ year: this.selectedYear, month: this.selectedMonth });
            } else {
                // On home page with period selector
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

            // Fetch expenses from selected months
            const allExpensesPromises = monthsToFetch.map(async ({ year, month }) => {
                const response = await fetch(`/api/expenses?month=${month}&year=${year}`);
                if (!response.ok) return [];
                const { expenses } = await response.json();
                return expenses;
            });

            // Wait for all requests to complete
            const expensesArrays = await Promise.all(allExpensesPromises);

            // Flatten and sort by date (newest first)
            this.allExpenses = expensesArrays
                .flat()
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            this.totalExpenses = this.allExpenses.length;

            // Display filtered expenses
            this.filterAndDisplayExpenses();
        } catch (error) {
            console.error('Error loading expenses:', error);
            listContainer.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 mb-2 d-block"></i>
                    <p class="mb-1">Failed to load expenses</p>
                    <small class="text-muted">${error.message}</small>
                </div>
            `;
        }
    }

    getFilteredExpenses() {
        let filtered = [...this.allExpenses];

        if (this.mode === 'recent') {
            // Recent mode - no filtering, just return all (already sorted by date)
            return filtered;
        } else if (this.useDateNavigation) {
            // On expenses page - filter by week if selected
            if (this.selectedWeek !== 'all') {
                filtered = filtered.filter(expense => {
                    const date = new Date(expense.date);
                    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                    const firstDayOfWeek = firstDay.getDay();
                    const dayOffset = date.getDate() + firstDayOfWeek - 1;
                    const weekNumber = Math.ceil(dayOffset / 7);
                    const weekKey = `week${weekNumber}`;
                    return weekKey === this.selectedWeek;
                });
            }
        } else {
            // On home page - use period selector
            if (this.period === 'today') {
                const today = new Date().toDateString();
                filtered = filtered.filter(exp =>
                    new Date(exp.date).toDateString() === today
                );
            } else if (this.period === 'week') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                weekAgo.setHours(0, 0, 0, 0);
                filtered = filtered.filter(exp => {
                    const expenseDate = new Date(exp.date);
                    expenseDate.setHours(0, 0, 0, 0);
                    return expenseDate >= weekAgo;
                });
            }
        }

        return filtered;
    }

    filterAndDisplayExpenses() {
        const filteredExpenses = this.getFilteredExpenses();

        if (this.mode === 'recent') {
            // Recent mode - just show first N items, no pagination
            const recentExpenses = filteredExpenses.slice(0, this.perPage);
            this.renderExpenses(recentExpenses, recentExpenses.length);
            // Hide pagination in recent mode
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
                if (this.selectedWeek !== 'all') {
                    hint = '<small>Try selecting "All" to see all expenses this month</small>';
                }
            } else {
                periodLabel = this.period === 'today' ? 'today' :
                              this.period === 'week' ? 'this week' : 'this month';
                if (this.period !== 'all') {
                    hint = '<small>Try selecting "Month" to see all expenses this month</small>';
                }
            }

            listContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-inbox fs-2 mb-2 d-block"></i>
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

            return `
                <div class="swipe-container" data-expense-id="${expense.id}">
                    <div class="swipe-actions">
                        <button class="swipe-action swipe-action-edit" data-action="edit">
                            <i class="bi bi-pencil"></i>
                            <span>Edit</span>
                        </button>
                        <button class="swipe-action swipe-action-delete" data-action="delete">
                            <i class="bi bi-trash"></i>
                            <span>Delete</span>
                        </button>
                    </div>
                    <div class="expense-item d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center flex-grow-1 me-3">
                            <div class="expense-category-icon me-3"
                                 style="background: ${categoryColor}20;">
                                <i class="bi bi-${categoryIcon}" style="color: ${categoryColor}; font-size: 1.1rem;"></i>
                            </div>
                            <div class="flex-grow-1 min-width-0">
                                <div class="expense-description text-truncate">${expense.description}</div>
                                <div class="expense-date text-muted d-flex align-items-center gap-2">
                                    <span class="badge badge-sm category-${expense.category}" style="font-size: 0.65rem;">
                                        ${categoryLabel}
                                    </span>
                                    <span>${this.formatExpenseDate(expense.date)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="expense-amount text-end text-nowrap" style="color: ${categoryColor};">
                            ${CurrencyHelper.format(expense.amount)}
                        </div>
                        <button class="swipe-hint-btn" title="Edit or Delete">
                            <i class="bi bi-three-dots"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Set up swipe and click handlers
        this.setupSwipeHandlers(listContainer, expenses);
    }

    setupSwipeHandlers(container, expenses) {
        const swipeContainers = container.querySelectorAll('.swipe-container');

        swipeContainers.forEach(swipeContainer => {
            const expenseItem = swipeContainer.querySelector('.expense-item');
            const expenseId = swipeContainer.dataset.expenseId;
            const expense = expenses.find(e => e.id == expenseId);

            let startX = 0;
            let startY = 0;
            let currentX = 0;
            let isDragging = false;
            let isHorizontalSwipe = false;

            // Touch events for mobile
            expenseItem.addEventListener('touchstart', (e) => {
                // Close any other open swipe items
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

                // Determine if this is a horizontal swipe (more X movement than Y)
                if (!isHorizontalSwipe && Math.abs(diffX) > 10) {
                    isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
                }

                // Only handle horizontal swipes
                if (isHorizontalSwipe) {
                    e.preventDefault(); // Prevent browser back/forward navigation

                    // Only allow left swipe (negative diff)
                    if (diffX < 0) {
                        const translateX = Math.max(diffX, -135);
                        expenseItem.style.transform = `translateX(${translateX}px)`;
                    } else if (expenseItem.classList.contains('swiped')) {
                        // If already swiped, allow closing by swiping right
                        const translateX = Math.min(-135 + diffX, 0);
                        expenseItem.style.transform = `translateX(${translateX}px)`;
                    }
                }
            }, { passive: false });

            expenseItem.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                expenseItem.classList.remove('swiping');

                const diffX = currentX - startX;

                // Only process swipe if it was horizontal
                if (isHorizontalSwipe) {
                    if (diffX < -50) {
                        // Swiped left enough - reveal actions
                        expenseItem.classList.add('swiped');
                        expenseItem.style.transform = '';
                        this.activeSwipeItem = expenseItem;
                    } else if (diffX > 50 && expenseItem.classList.contains('swiped')) {
                        // Swiped right - close
                        expenseItem.classList.remove('swiped');
                        expenseItem.style.transform = '';
                        this.activeSwipeItem = null;
                    } else {
                        // Not enough movement - snap back
                        expenseItem.style.transform = '';
                    }
                } else if (Math.abs(diffX) < 10) {
                    // It was a tap - just close if swiped, don't navigate
                    if (expenseItem.classList.contains('swiped')) {
                        expenseItem.classList.remove('swiped');
                        expenseItem.style.transform = '';
                        this.activeSwipeItem = null;
                    }
                }

                startX = 0;
                startY = 0;
                currentX = 0;
                isHorizontalSwipe = false;
            });

            // Mouse click for desktop - just close swipe if open, no direct edit
            expenseItem.addEventListener('click', (e) => {
                if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;

                if (expenseItem.classList.contains('swiped')) {
                    expenseItem.classList.remove('swiped');
                    this.activeSwipeItem = null;
                }
            });

            // Action button handlers
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

            // Three-dots button toggles swipe actions
            hintBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                // Close any other open item
                if (this.activeSwipeItem && this.activeSwipeItem !== expenseItem) {
                    this.activeSwipeItem.classList.remove('swiped');
                }

                // Toggle this item
                if (expenseItem.classList.contains('swiped')) {
                    expenseItem.classList.remove('swiped');
                    this.activeSwipeItem = null;
                } else {
                    expenseItem.classList.add('swiped');
                    this.activeSwipeItem = expenseItem;
                }
            });
        });

        // Close swipe when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (this.activeSwipeItem && !e.target.closest('.swipe-container')) {
                this.activeSwipeItem.classList.remove('swiped');
                this.activeSwipeItem = null;
            }
        });
    }

    async confirmDelete(expense, container) {
        // Show iOS-style confirmation
        const confirmed = confirm(`Delete "${expense.description}" (${CurrencyHelper.format(expense.amount)})?`);

        if (confirmed) {
            try {
                const response = await fetch(`/api/expenses/${expense.id}`, {
                    method: 'DELETE'
                });

                if (!response.ok) throw new Error('Failed to delete');

                // Animate removal
                container.style.transition = 'all 0.3s ease';
                container.style.transform = 'translateX(-100%)';
                container.style.opacity = '0';
                container.style.maxHeight = container.offsetHeight + 'px';

                setTimeout(() => {
                    container.style.maxHeight = '0';
                    container.style.padding = '0';
                    container.style.margin = '0';
                    container.style.borderWidth = '0';
                }, 300);

                setTimeout(() => {
                    // Refresh the list
                    this.loadAllExpenses();
                    if (window.showToast) {
                        window.showToast('Expense deleted', 'success');
                    }
                }, 500);

            } catch (error) {
                console.error('Error deleting expense:', error);
                if (window.showToast) {
                    window.showToast('Failed to delete expense', 'error');
                }
                // Reset swipe state
                const expenseItem = container.querySelector('.expense-item');
                expenseItem.classList.remove('swiped');
                this.activeSwipeItem = null;
            }
        } else {
            // User cancelled - reset swipe state
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

        // Update button states
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages;

        // Update page info
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
            return date.toLocaleDateString('default', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    editExpense(expense) {
        const editUrl = `/static/add-expense.html?edit=${expense.id}&amount=${expense.amount}&category=${expense.category}&description=${encodeURIComponent(expense.description)}`;
        window.location.href = editUrl;
    }
}

customElements.define('latest-expenses', LatestExpenses);
