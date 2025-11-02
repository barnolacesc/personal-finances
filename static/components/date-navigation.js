class DateNavigation extends HTMLElement {
    constructor() {
        super();
        this.currentDate = new Date();
        this.currentWeek = 'all';
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        // Dispatch initial date state
        this.dispatchDateChange();
    }

    render() {
        this.innerHTML = `
            <style>
                .date-nav-title {
                    color: var(--bs-body-color, #000);
                }
                .date-nav-subtitle {
                    color: var(--bs-secondary-color, #6c757d);
                }
                .date-nav-btn {
                    color: var(--bs-body-color, #000);
                }
                .date-nav-btn:hover {
                    color: var(--bs-primary, #0d6efd);
                }

                /* Dark mode specific overrides */
                [data-bs-theme="dark"] .date-nav-title {
                    color: #ffffff !important;
                }
                [data-bs-theme="dark"] .date-nav-subtitle {
                    color: #a0a0a0 !important;
                }
                [data-bs-theme="dark"] .date-nav-btn {
                    color: #e0e0e0 !important;
                }
                [data-bs-theme="dark"] .date-nav-btn:hover {
                    color: #0d6efd !important;
                }
            </style>
            <div class="d-flex flex-column align-items-center" style="margin-bottom: 0.75rem;">
                <div class="d-flex justify-content-center align-items-center gap-2" style="margin-bottom: 0.25rem;">
                    <button id="prevMonthBtn" class="btn btn-link text-decoration-none date-nav-btn" style="font-size: 1rem; padding: 0.25rem;">
                        <i class="bi bi-chevron-left"></i>
                    </button>
                    <h5 id="currentMonthBtn" class="mb-0 text-center date-nav-title" style="min-width: 160px; font-size: 1.1rem;">
                        ${this.formatMonth()}
                    </h5>
                    <button id="nextMonthBtn" class="btn btn-link text-decoration-none date-nav-btn" style="font-size: 1rem; padding: 0.25rem;">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                </div>

                <div class="d-flex justify-content-center align-items-center gap-2">
                    <button id="prevWeekBtn" class="btn btn-link text-decoration-none p-0 date-nav-btn" style="font-size: 0.85rem;">
                        <i class="bi bi-chevron-left"></i>
                    </button>
                    <span id="currentWeekBtn" class="mb-0 text-center date-nav-subtitle" style="min-width: 90px; font-size: 0.85rem; cursor: pointer;">
                        All Month
                    </span>
                    <button id="nextWeekBtn" class="btn btn-link text-decoration-none p-0 date-nav-btn" style="font-size: 0.85rem;">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;

        // Update navigation button states
        this.updateNavigationState();
    }

    setupEventListeners() {
        this.querySelector('#prevMonthBtn').addEventListener('click', () => this.changeMonth(-1));
        this.querySelector('#nextMonthBtn').addEventListener('click', () => this.changeMonth(1));
        this.querySelector('#prevWeekBtn').addEventListener('click', () => this.changeWeek(-1));
        this.querySelector('#nextWeekBtn').addEventListener('click', () => this.changeWeek(1));
        this.querySelector('#currentWeekBtn').addEventListener('click', () => {
            this.currentWeek = 'all';
            this.updateWeekDisplay();
            this.dispatchDateChange();
        });
    }

    formatMonth() {
        return this.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    changeMonth(delta) {
        // Create a new date object to avoid modifying the original
        const newDate = new Date(this.currentDate);
        newDate.setMonth(newDate.getMonth() + delta);

        // Update the current date
        this.currentDate = newDate;
        this.currentWeek = 'all';

        // Re-render and notify
        this.render();
        this.setupEventListeners(); // Reattach event listeners after render
        this.dispatchDateChange();
    }

    changeWeek(delta) {
        const weeks = ['week1', 'week2', 'week3', 'week4', 'week5', 'all'];
        let currentIndex = weeks.indexOf(this.currentWeek);

        // If current week is not found (shouldn't happen), default to first week
        if (currentIndex === -1) currentIndex = 0;

        // Calculate new index with wrapping
        currentIndex = (currentIndex + delta + weeks.length) % weeks.length;
        this.currentWeek = weeks[currentIndex];

        this.updateWeekDisplay();
        this.dispatchDateChange();
    }

    updateWeekDisplay() {
        const weekBtn = this.querySelector('#currentWeekBtn');
        weekBtn.textContent = this.currentWeek === 'all' ? 'All Month' : `Week ${this.currentWeek.slice(-1)}`;

        // Update week navigation buttons
        const prevWeekBtn = this.querySelector('#prevWeekBtn');
        const nextWeekBtn = this.querySelector('#nextWeekBtn');

        // Always enable both buttons since we have circular navigation
        prevWeekBtn.disabled = false;
        nextWeekBtn.disabled = false;
    }

    updateNavigationState() {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const nextMonthBtn = this.querySelector('#nextMonthBtn');
        nextMonthBtn.disabled =
            this.currentDate.getMonth() >= currentMonth &&
            this.currentDate.getFullYear() >= currentYear;

        const prevMonthBtn = this.querySelector('#prevMonthBtn');
        prevMonthBtn.disabled = false; // Allow navigating to past months
    }

    dispatchDateChange() {
        const event = new CustomEvent('datechange', {
            bubbles: true,
            composed: true,
            detail: {
                month: this.currentDate.getMonth() + 1,
                year: this.currentDate.getFullYear(),
                week: this.currentWeek
            }
        });
        this.dispatchEvent(event);
        // Also dispatch to document for components that might be in different shadow DOMs
        document.dispatchEvent(event);

        // Log the date change for debugging
        console.log('Date changed:', {
            month: this.currentDate.getMonth() + 1,
            year: this.currentDate.getFullYear(),
            week: this.currentWeek
        });
    }
}

customElements.define('date-navigation', DateNavigation);
