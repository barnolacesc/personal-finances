import { CONFIG } from './config.js';

// Centralized API service for all HTTP requests
export class ApiService {
    static async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Handle empty responses (like DELETE)
            if (response.status === 204) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${url}`, error);
            throw error;
        }
    }

    // Expense-related API calls
    static async getExpenses(month, year) {
        const url = `${CONFIG.API.ENDPOINTS.EXPENSES}?month=${month}&year=${year}`;
        return await this.request(url);
    }

    static async createExpense(expenseData) {
        return await this.request(CONFIG.API.ENDPOINTS.EXPENSES, {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });
    }

    static async updateExpense(expenseId, expenseData) {
        const url = `${CONFIG.API.ENDPOINTS.EXPENSES}/${expenseId}`;
        return await this.request(url, {
            method: 'PUT',
            body: JSON.stringify(expenseData)
        });
    }

    static async deleteExpense(expenseId) {
        const url = `${CONFIG.API.ENDPOINTS.EXPENSES}/${expenseId}`;
        return await this.request(url, {
            method: 'DELETE'
        });
    }

    // Month-related API calls
    static async getMonths() {
        return await this.request(CONFIG.API.ENDPOINTS.MONTHS);
    }
}

// Error handling utility
export class ErrorHandler {
    static handle(error, context = '') {
        console.error(`Error in ${context}:`, error);

        let message = 'An unexpected error occurred';

        if (error.message.includes('Failed to fetch')) {
            message = 'Network error. Please check your connection.';
        } else if (error.message.includes('HTTP 400')) {
            message = 'Invalid data provided';
        } else if (error.message.includes('HTTP 404')) {
            message = 'Resource not found';
        } else if (error.message.includes('HTTP 500')) {
            message = 'Server error. Please try again later.';
        }

        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }
}
