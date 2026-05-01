// Centralized event management system
export class EventManager {
    static EVENT_TYPES = {
        EXPENSE_ADDED: 'expenseadded',
        EXPENSE_UPDATED: 'expenseupdated',
        EXPENSE_DELETED: 'expensedeleted',
        DATE_CHANGED: 'datechange',
        THEME_CHANGED: 'themechange'
    };

    static emit(eventType, detail = {}) {
        const event = new CustomEvent(eventType, {
            bubbles: true,
            composed: true,
            detail
        });
        document.dispatchEvent(event);
    }

    static on(eventType, handler, element = document) {
        element.addEventListener(eventType, handler);
        return () => element.removeEventListener(eventType, handler);
    }

    static once(eventType, handler, element = document) {
        element.addEventListener(eventType, handler, { once: true });
    }

    // Specific event emitters
    static emitExpenseAdded(expense) {
        this.emit(this.EVENT_TYPES.EXPENSE_ADDED, { expense });
    }

    static emitExpenseUpdated(expense) {
        this.emit(this.EVENT_TYPES.EXPENSE_UPDATED, { expense });
    }

    static emitExpenseDeleted(expenseId) {
        this.emit(this.EVENT_TYPES.EXPENSE_DELETED, { expenseId });
    }

    static emitDateChanged(month, year, week) {
        this.emit(this.EVENT_TYPES.DATE_CHANGED, { month, year, week });
    }

    static emitThemeChanged(theme) {
        this.emit(this.EVENT_TYPES.THEME_CHANGED, { theme });
    }
}

// Base component class with common functionality
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this.eventListeners = [];
    }

    // Helper method to add event listeners that will be automatically cleaned up
    addEventListenerWithCleanup(element, event, handler) {
        element.addEventListener(event, handler);
        this.eventListeners.push(() => element.removeEventListener(event, handler));
    }

    // Listen to global events with automatic cleanup
    listenToGlobalEvent(eventType, handler) {
        const cleanup = EventManager.on(eventType, handler);
        this.eventListeners.push(cleanup);
    }

    // Clean up all event listeners when component is disconnected
    disconnectedCallback() {
        this.eventListeners.forEach(cleanup => cleanup());
        this.eventListeners = [];
    }

    // Common date/time management
    getCurrentDateTime() {
        const now = new Date();
        return {
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            week: 'all'
        };
    }

    // Common error handling
    handleError(error, context = this.constructor.name) {
        console.error(`Error in ${context}:`, error);
        if (window.showToast) {
            window.showToast('An error occurred. Please try again.', 'error');
        }
    }
}
