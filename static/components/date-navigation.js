import { BaseComponent, EventManager } from './event-manager.js';
class DateNavigation extends BaseComponent {
    constructor() {
        super();
        this.currentDate = new Date();
        this.currentWeek = 'all';
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.dispatchDateChange();
    }

    render() {
        this.innerHTML = `
            <style>
                .date-nav-container {
                    margin-bottom: 0.5rem;
                }

                .date-nav-title {
                    color: var(--on-surface);
                    font-family: 'Manrope', sans-serif;
                    font-size: 1.125rem;
                    font-weight: 700;
                    letter-spacing: -0.01em;
                }

                .date-nav-btn {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    background: var(--surface-container-highest);
                    border: none;
                    color: var(--on-surface);
                    cursor: pointer;
                    transition: background 0.15s ease;
                }

                .date-nav-btn:hover {
                    background: rgba(255, 140, 0, 0.2);
                }

                .date-nav-btn:disabled {
                    opacity: 0.3;
                    pointer-events: none;
                }

                .date-nav-pill {
                    background: var(--surface-container);
                    border-radius: 0.75rem;
                    padding: 1rem;
                    border: 1px solid rgba(86, 67, 52, 0.1);
                }

                .week-pill {
                    display: inline-block;
                    padding: 0.25rem 0.6rem;
                    font-size: 0.6875rem;
                    font-weight: 600;
                    border-radius: 9999px;
                    background: rgba(255, 255, 255, 0.06);
                    color: var(--on-surface-variant);
                    cursor: pointer;
                    transition: all 0.15s ease;
                    border: none;
                    font-family: 'Inter', sans-serif;
                }

                .week-pill:hover {
                    background: var(--primary-container);
                    color: var(--on-primary);
                }

                .week-pill.active {
                    background: var(--primary-container);
                    color: var(--on-primary);
                    font-weight: 700;
                }
            </style>
            <div class="date-nav-container">
                <div class="date-nav-pill d-flex align-items-center justify-content-between">
                    <button id="prevMonthBtn" class="date-nav-btn">
                        <span class="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div class="text-center">
                        <p class="date-nav-title mb-0">${this.formatMonth()}</p>
                        <div class="d-flex justify-content-center gap-1 mt-2">
                            <span class="week-pill ${this.currentWeek === 'all' ? 'active' : ''}" data-week="all">All</span>
                            <span class="week-pill ${this.currentWeek === 'week1' ? 'active' : ''}" data-week="week1">W1</span>
                            <span class="week-pill ${this.currentWeek === 'week2' ? 'active' : ''}" data-week="week2">W2</span>
                            <span class="week-pill ${this.currentWeek === 'week3' ? 'active' : ''}" data-week="week3">W3</span>
                            <span class="week-pill ${this.currentWeek === 'week4' ? 'active' : ''}" data-week="week4">W4</span>
                            <span class="week-pill ${this.currentWeek === 'week5' ? 'active' : ''}" data-week="week5">W5</span>
                        </div>
                    </div>
                    <button id="nextMonthBtn" class="date-nav-btn">
                        <span class="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            </div>
        `;

        this.updateNavigationState();
    }

    setupEventListeners() {
        this.querySelector('#prevMonthBtn').addEventListener('click', () => this.changeMonth(-1));
        this.querySelector('#nextMonthBtn').addEventListener('click', () => this.changeMonth(1));

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
        const newDate = new Date(this.currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        this.currentDate = newDate;
        this.currentWeek = 'all';
        this.render();
        this.setupEventListeners();
        this.dispatchDateChange();
    }

    updateWeekDisplay() {
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
        prevMonthBtn.disabled = false;
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
        document.dispatchEvent(event);
    }
}

customElements.define('date-navigation', DateNavigation);
