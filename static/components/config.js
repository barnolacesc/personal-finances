// Centralized configuration for the expense tracking app
export const CONFIG = {
    // API endpoints
    API: {
        BASE_URL: '/api',
        ENDPOINTS: {
            EXPENSES: '/api/expenses',
            MONTHS: '/api/months',
            RECURRING: '/api/recurring',
            RECURRING_APPLY: '/api/recurring/apply',
            RECURRING_PENDING: '/api/recurring/pending'
        }
    },

    // Expense categories with modern colors and labels
    CATEGORIES: {
        super: {
            label: 'Super',
            color: '#3b82f6',
            icon: 'shopping_cart'
        },
        xofa: {
            label: 'Xofa',
            color: '#8b5cf6',
            icon: 'home'
        },
        food_drink: {
            label: 'Food & Drink',
            color: '#10b981',
            icon: 'restaurant'
        },
        save_inv: {
            label: 'Save & Invest',
            color: '#06b6d4',
            icon: 'savings'
        },
        recurrent: {
            label: 'Recurrent',
            color: '#f59e0b',
            icon: 'repeat'
        },
        clothing: {
            label: 'Clothing',
            color: '#ec4899',
            icon: 'checkroom'
        },
        personal: {
            label: 'Personal',
            color: '#a855f7',
            icon: 'person'
        },
        taxes: {
            label: 'Taxes',
            color: '#ef4444',
            icon: 'receipt_long'
        },
        transport: {
            label: 'Transport',
            color: '#6366f1',
            icon: 'directions_car'
        },
        car: {
            label: 'Car',
            color: '#64748b',
            icon: 'directions_car'
        },
        health: {
            label: 'Health',
            color: '#14b8a6',
            icon: 'favorite'
        },
        cobeetrans: {
            label: 'Cobee Trans',
            color: '#7c3aed',
            icon: 'directions_bus'
        },
        cobeefood: {
            label: 'Cobee Food',
            color: '#f97316',
            icon: 'local_cafe'
        },
        other: {
            label: 'Other',
            color: '#94a3b8',
            icon: 'more_horiz'
        }
    },

    // Currency settings
    CURRENCY: {
        symbol: '€',
        locale: 'es-ES',
        code: 'EUR'
    },

    // UI settings
    UI: {
        TOAST_DURATION: 3000,
        ANIMATION_DURATION: 300,
        CHART_HEIGHT: 300
    },

    // Form validation
    VALIDATION: {
        DESCRIPTION_MAX_LENGTH: 50,
        AMOUNT_PATTERN: '[0-9]*[.,]?[0-9]*'
    }
};

// Helper functions for configuration
export class CategoryHelper {
    static getAllCategories() {
        return Object.keys(CONFIG.CATEGORIES);
    }

    static getCategoryData(categoryKey) {
        return CONFIG.CATEGORIES[categoryKey] || CONFIG.CATEGORIES.other;
    }

    static getCategoryLabel(categoryKey) {
        return this.getCategoryData(categoryKey).label;
    }

    static getCategoryColor(categoryKey) {
        return this.getCategoryData(categoryKey).color;
    }

    static getCategoryIcon(categoryKey) {
        return this.getCategoryData(categoryKey).icon;
    }

    static formatCategoryLabel(categoryKey) {
        // Legacy function for backward compatibility
        return categoryKey
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// Currency formatting utility
export class CurrencyHelper {
    static format(amount) {
        return new Intl.NumberFormat(CONFIG.CURRENCY.locale, {
            style: 'currency',
            currency: CONFIG.CURRENCY.code,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    static parseAmount(value) {
        return parseFloat(value.replace(',', '.'));
    }
}

// Date formatting utility
export class DateHelper {
    static formatDate(date) {
        return new Date(date).toLocaleDateString('default', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static formatDateLong(date) {
        return new Date(date).toLocaleDateString('default', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
