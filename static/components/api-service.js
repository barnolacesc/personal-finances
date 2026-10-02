// Centralized API service for the expense tracking app
import { CONFIG } from './config.js';

export class ApiService {
    // Generic request helper with error handling
    static async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const rawBody = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(rawBody);
                } catch {
                    errorData = { error: rawBody };
                }
                const err = new Error(errorData.error || `HTTP ${response.status}`);
                err.status = response.status;
                err.data = errorData;
                err.requiresForce = Boolean(
                    errorData && (errorData.requiresForce || errorData.requires_force)
                );
                throw err;
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
    static async getExpenses(month, year, type = null) {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        if (type) params.set('type', type);
        const query = params.toString();
        const url = `${CONFIG.API.ENDPOINTS.EXPENSES}${query ? '?' + query : ''}`;
        return await this.request(url);
    }

    static async createExpense(expenseData) {
        return await this.request(CONFIG.API.ENDPOINTS.EXPENSES, {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });
    }

    static async updateExpense(id, expenseData) {
        return await this.request(`${CONFIG.API.ENDPOINTS.EXPENSES}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(expenseData)
        });
    }

    static async deleteExpense(id, force = false) {
        const url = `${CONFIG.API.ENDPOINTS.EXPENSES}/${id}${force ? '?force=true' : ''}`;
        return await this.request(url, {
            method: 'DELETE'
        });
    }

    static async getCategories() {
        return await this.request(`${CONFIG.API.ENDPOINTS.EXPENSES}/categories`);
    }

    // Trends-related API calls
    static async getTrends() {
        return await this.request(CONFIG.API.ENDPOINTS.TRENDS);
    }

    // Month-related API calls
    static async getMonths() {
        return await this.request(CONFIG.API.ENDPOINTS.MONTHS);
    }

    static async getSummary(month, year) {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const query = params.toString();
        const url = `/api/summary${query ? '?' + query : ''}`;
        return await this.request(url);
    }

    // Reconciliation and Allocation API calls
    static async getAllocations(params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = `${CONFIG.API.ENDPOINTS.ALLOCATIONS}${query ? '?' + query : ''}`;
        return await this.request(url);
    }

    static async createAllocation(allocationData) {
        return await this.request(CONFIG.API.ENDPOINTS.ALLOCATIONS, {
            method: 'POST',
            body: JSON.stringify(allocationData)
        });
    }

    static async updateAllocation(allocationId, allocationData) {
        const url = `${CONFIG.API.ENDPOINTS.ALLOCATIONS}/${allocationId}`;
        return await this.request(url, {
            method: 'PUT',
            body: JSON.stringify(allocationData)
        });
    }

    static async deleteAllocation(allocationId) {
        const url = `${CONFIG.API.ENDPOINTS.ALLOCATIONS}/${allocationId}`;
        return await this.request(url, {
            method: 'DELETE'
        });
    }

    static async getReconciliationSummary(month, year) {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const query = params.toString();
        const url = `${CONFIG.API.ENDPOINTS.RECONCILIATION_SUMMARY}${query ? '?' + query : ''}`;
        return await this.request(url);
    }

    static async getExpenseReconciliation(expenseId) {
        const url = `${CONFIG.API.ENDPOINTS.EXPENSES}/${expenseId}/reconciliation`;
        return await this.request(url);
    }
}

// Error handling utility
export class ApiError extends Error {
    constructor(message, status, details = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

export class ErrorHandler {
    static handle(error, context = '') {
        console.error(`Error in ${context}:`, error);

        let message = 'An unexpected error occurred';

        if (error.message && error.message.includes('Failed to fetch')) {
            message = 'Network error. Please check your connection.';
        } else if (error.status && error.message) {
            message = error.message;
        } else if (error.message && error.message.includes('HTTP 400')) {
            message = 'Invalid data provided';
        } else if (error.message && error.message.includes('HTTP 404')) {
            message = 'Resource not found';
        } else if (error.message && error.message.includes('HTTP 500')) {
            message = 'Server error. Please try again later.';
        } else if (error.message) {
            message = error.message;
        }

        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }
}
