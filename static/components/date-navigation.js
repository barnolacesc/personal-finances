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
                .date-nav-container {
                    margin-bottom: 0.5rem;
                }

                .date-nav-title {
                    color: var(--bs-body-color, #000);
                    font-size: 1rem;
                    font-weight: 600;
                }

                .date-nav-btn {
                    color: var(--bs-body-color, #000);
                    padding: 0.15rem 0.3rem;
                    font-size: 0.9rem;
                }

                .date-nav-btn:hover {
                    color: var(--bs-primary, #0d6efd);
                }

                .week-pill {
                    display: inline-block;
                    padding: 0.2rem 0.5rem;
                    font-size: 0.7rem;
                    border-radius: 12px;
                    background: var(--bs-secondary-bg, #f8f9fa);
                    color: var(--bs-secondary-color, #6c757d);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 1px solid transparent;
                    margin: 0 0.15rem;
                }

                .week-pill:hover {
                    background: var(--bs-primary, #0d6efd);
                    color: white;
                }

                .week-pill.active {
                    background: var(--bs-primary, #0d6efd);
                    color: white;
                    font-weight: 600;
                }

                /* Dark mode specific overrides */
                [data-bs-theme="dark"] .date-nav-title {
                    color: #ffffff !important;
                }

                [data-bs-theme="dark"] .date-nav-btn {
                    color: #e0e0e0 !important;
                }

                [data-bs-theme="dark"] .date-nav-btn:hover {
                    color: #0d6efd !important;
                }

                [data-bs-theme="dark"] .week-pill {
                    background: rgba(255, 255, 255, 0.1);
                    color: #a0a0a0;
                }

                [data-bs-theme="dark"] .week-pill:hover {
                    background: var(--bs-primary, #0d6efd);
                    color: white;
                }
            </style>
            <div class="date-nav-container text-center">
                <!-- Month selector: primary control -->
                <div class="d-flex justify-content-center align-items-center gap-1 mb-2">
                    <button id="prevMonthBtn" class="btn btn-link text-decoration-none date-nav-btn">
                        <i class="bi bi-chevron-left"></i>
                    </button>
                    <span class="date-nav-title" style="min-width: 140px;">
                        ${this.formatMonth()}
                    </span>
                    <button id="nextMonthBtn" class="btn btn-link text-decoration-none date-nav-btn">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                </div>

                <!-- Week selector: compact pills, secondary control -->
                <div class="d-flex justify-content-center align-items-center flex-wrap gap-1">
                    <span class="week-pill ${this.currentWeek === 'all' ? 'active' : ''}" data-week="all">All</span>
                    <span class="week-pill ${this.currentWeek === 'week1' ? 'active' : ''}" data-week="week1">W1</span>
                    <span class="week-pill ${this.currentWeek === 'week2' ? 'active' : ''}" data-week="week2">W2</span>
                    <span class="week-pill ${this.currentWeek === 'week3' ? 'active' : ''}" data-week="week3">W3</span>
                    <span class="week-pill ${this.currentWeek === 'week4' ? 'active' : ''}" data-week="week4">W4</span>
                    <span class="week-pill ${this.currentWeek === 'week5' ? 'active' : ''}" data-week="week5">W5</span>
                </div>
            </div>
        `;

        // Update navigation button states
        this.updateNavigationState();
    }

    setupEventListeners() {
        this.querySelector('#prevMonthBtn').addEventListener('click', () => this.changeMonth(-1));
        this.querySelector('#nextMonthBtn').addEventListener('click', () => this.changeMonth(1));

        // Week pill click handlers
        this.querySelectorAll('.week-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                const week = e.target.dataset.week;
                this.currentWeek = week;
                this.updateWeekDisplay();
                this.dispatchDateChange();
            });
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

    updateWeekDisplay() {
        // Update active state on week pills
        this.querySelectorAll('.week-pill').forEach(pill => {
            if (pill.dataset.week === this.currentWeek) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
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
