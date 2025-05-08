<script>
  import { onMount } from 'svelte';
  import { currentDate } from './DateNavigation.svelte';
  import { showToast } from '$lib/utils/toast';

  /** @type {Array<{id: number, amount: number, description: string, category: string, date: string}>} */
  let expenses = [];
  /** @type {boolean} */
  let loading = true;
  /** @type {string | null} */
  let error = null;
  /** @type {number | null} */
  let deletingId = null;

  // Only fetch expenses on the client side
  onMount(() => {
    if ($currentDate) {
      loadExpenses();
    }
    
    // Watch for date changes
    return currentDate.subscribe(value => {
      if (value) {
        loadExpenses();
      }
    });
  });

  async function loadExpenses() {
    try {
      loading = true;
      error = null;
      
      const year = $currentDate.getFullYear();
      const month = $currentDate.getMonth() + 1;
      console.log(`Loading expenses for ${year}-${month}`);
      
      const response = await fetch(`/api/expenses?year=${year}&month=${month}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load expenses');
      }
      
      const responseData = await response.json();
      console.log('Loaded expenses:', responseData);
      
      // Extract the expenses array from the response
      if (responseData && Array.isArray(responseData.expenses)) {
        expenses = responseData.expenses;
      } else if (Array.isArray(responseData)) {
        expenses = responseData;
      } else {
        console.error('Invalid response format:', responseData);
        expenses = [];
      }
    } catch (err) {
      console.error('Error loading expenses:', err);
      error = err instanceof Error ? err.message : 'Failed to load expenses';
      showToast(String(error), 'error');
    } finally {
      loading = false;
    }
  }

  /**
   * Delete an expense by ID
   * @param {number} id - Expense ID
   */
  async function deleteExpense(id) {
    if (deletingId !== null) return;
    
    try {
      deletingId = id;
      
      console.log(`Deleting expense ${id}`);
      const response = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE'
      });

      // Handle 204 No Content response
      if (response.status === 204) {
        showToast('Expense deleted successfully');
        await loadExpenses();
        return;
      }
      
      // For other responses, try to parse JSON
      try {
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to delete expense');
        }
        
        showToast('Expense deleted successfully');
        await loadExpenses();
      } catch (parseError) {
        // If we can't parse JSON but response is OK, assume success
        if (response.ok) {
          showToast('Expense deleted successfully');
          await loadExpenses();
        } else {
          throw new Error('Invalid server response');
        }
      }
    } catch (error) {
      console.error('Error deleting expense:', error);
      showToast(error instanceof Error ? error.message : 'Failed to delete expense', 'error');
    } finally {
      deletingId = null;
    }
  }

  /**
   * Format a date string to local date format
   * @param {string} dateString - Date string to format
   * @returns {string} Formatted date
   */
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  /**
   * Format amount as currency
   * @param {number} amount - Amount to format
   * @returns {string} Formatted amount
   */
  function formatAmount(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
</script>

<div class="card mb-4">
  <div class="card-body">
    <h3 class="card-title mb-4">Expenses</h3>
    
    {#if loading}
      <div class="text-center">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    {:else if error}
      <div class="alert alert-danger" role="alert">
        {error}
        <button class="btn btn-sm btn-outline-danger ms-2" on:click={loadExpenses}>
          Try Again
        </button>
      </div>
    {:else if expenses.length === 0}
      <p class="text-center text-muted">No expenses for this month</p>
    {:else}
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each expenses as expense (expense.id)}
              <tr>
                <td>{formatDate(expense.date)}</td>
                <td>{expense.description}</td>
                <td>
                  <span class="badge category-{expense.category}">
                    {expense.category}
                  </span>
                </td>
                <td>{formatAmount(expense.amount)}</td>
                <td>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    on:click={() => deleteExpense(expense.id)}
                    disabled={deletingId === expense.id}
                  >
                    {#if deletingId === expense.id}
                      <div class="spinner-border spinner-border-sm" role="status">
                        <span class="visually-hidden">Loading...</span>
                      </div>
                    {:else}
                      <i class="bi bi-trash"></i>
                    {/if}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div> 