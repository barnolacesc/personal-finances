// Centralized configuration for the expense tracking app
export const CONFIG = {
    // API endpoints
    API: {
        BASE_URL: '/api',
        ENDPOINTS: {
            EXPENSES: '/api/expenses',
            MONTHS: '/api/months'
        }
    },

    // Expense categories with colors and labels
    CATEGORIES: {
        super: { 
            label: 'Super', 
            color: '#2563eb',
            icon: 'bi-cart'
        },
        xofa: { 
            label: 'Xofa', 
            color: '#7c3aed',
            icon: 'bi-house'
        },
        food_drink: { 
            label: 'Food & Drink', 
            color: '#059669',
            icon: 'bi-cup-straw'
        },
        save_inv: { 
            label: 'Save & Invest', 
            color: '#10b981',
            icon: 'bi-piggy-bank'
        },
        recurrent: { 
            label: 'Recurrent', 
            color: '#f59e0b',
            icon: 'bi-arrow-repeat'
        },
        clothing: { 
            label: 'Clothing', 
            color: '#ec4899',
            icon: 'bi-person-check'
        },
        personal: { 
            label: 'Personal', 
            color: '#8b5cf6',
            icon: 'bi-person'
        },
        taxes: { 
            label: 'Taxes', 
            color: '#dc2626',
            icon: 'bi-receipt'
        },
        transport: { 
            label: 'Transport', 
            color: '#6366f1',
            icon: 'bi-car-front'
        },
        health: { 
            label: 'Health', 
            color: '#06b6d4',
            icon: 'bi-heart-pulse'
        },
        other: { 
            label: 'Other', 
            color: '#6b7280',
            icon: 'bi-three-dots'
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