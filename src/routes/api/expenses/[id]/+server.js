import { json } from '@sveltejs/kit';
import { deleteExpense } from '$lib/server/db';

/**
 * DELETE handler for removing an expense by ID - matches original Flask app
 * @param {import('@sveltejs/kit').RequestEvent} event - The request event 
 */
export async function DELETE(event) {
  try {
    // Get expense ID from URL parameter
    if (!event.params.id) {
      return json({ error: 'Missing expense ID' }, { status: 400 });
    }
    
    const expenseId = parseInt(event.params.id);
    
    if (isNaN(expenseId)) {
      return json({ error: 'Invalid expense ID' }, { status: 400 });
    }
    
    const success = deleteExpense(expenseId);
    
    if (!success) {
      return json({ error: 'Expense not found' }, { status: 404 });
    }
    
    // Return empty response with 204 status (No Content)
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting expense:', error);
    return json({ error: 'Server error deleting expense' }, { status: 500 });
  }
} 