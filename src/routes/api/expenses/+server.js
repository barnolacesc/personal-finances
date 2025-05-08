import { json } from '@sveltejs/kit';
import { 
  getFilteredExpenses,
  getExpenseSummary,
  addExpense,
} from '$lib/stores/expenses';

/**
 * GET handler for expenses - matches original Flask app
 * @param {Object} params
 * @param {URL} params.url - URL object
 */
export async function GET({ url }) {
  try {
    // Get month and year from query parameters, default to current month
    const now = new Date();
    const year = url.searchParams.get('year') || now.getFullYear().toString();
    const month = url.searchParams.get('month') || (now.getMonth() + 1).toString();
    
    // If route matches /api/expenses/summary
    if (url.pathname.endsWith('/summary')) {
      const summary = await getExpenseSummary(year, month);
      return json(summary);
    }
    
    // Default route /api/expenses - match the original app's response format
    const expenses = await getFilteredExpenses(year, month);
    return json({
      expenses: expenses,
      month: parseInt(String(month)),
      year: parseInt(String(year))
    });
  } catch (error) {
    console.error('Error getting expenses:', error);
    return json({ error: 'Server error fetching expenses' }, { status: 500 });
  }
}

/**
 * POST handler for creating an expense - matches original Flask app
 * @param {Object} params
 * @param {Request} params.request - Request object
 */
export async function POST({ request }) {
  try {
    const data = await request.json();
    
    // Validate required fields
    const requiredFields = ['amount', 'category', 'description'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return json({ error: `${field.charAt(0).toUpperCase() + field.slice(1)} field is required` }, { status: 400 });
      }
    }
    
    // Validate amount
    let amount;
    try {
      amount = parseFloat(data.amount);
      if (isNaN(amount)) {
        throw new Error('Invalid amount');
      }
    } catch (e) {
      return json({ error: 'Invalid amount value' }, { status: 400 });
    }
    
    // Validate category and description
    const category = String(data.category).trim();
    const description = String(data.description).trim();
    
    if (!category || !description) {
      return json({ error: 'Category and description cannot be empty' }, { status: 400 });
    }
    
    // Create new expense
    const newExpense = await addExpense({
      amount,
      description,
      category,
      date: data.date || new Date().toISOString().split('T')[0]
    });
    
    return json(newExpense, { status: 201 });
  } catch (error) {
    console.error('Error creating expense:', error);
    return json({ error: 'Server error processing request' }, { status: 500 });
  }
} 