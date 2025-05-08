<script>
  import { onMount } from 'svelte';
  import NavBar from '$lib/components/NavBar.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import DateNavigation from '$lib/components/DateNavigation.svelte';
  import ExpenseForm from '$lib/components/ExpenseForm.svelte';
  import ExpenseList from '$lib/components/ExpenseList.svelte';
  import CategoryChart from '$lib/components/CategoryChart.svelte';
  import { browser } from '$app/environment';
  
  /** @type {'add' | 'view' | 'chart'} */
  let currentTab = 'add';
  
  onMount(() => {
    // Check for hash in URL to determine which tab to show
    if (browser) {
      const hash = window.location.hash;
      if (hash) {
        /** @type {any} */
        const tabValue = hash.replace('#', '');
        if (['add', 'view', 'chart'].includes(tabValue)) {
          currentTab = tabValue;
        }
      }
      
      // Listen for hash changes
      window.addEventListener('hashchange', () => {
        const newHash = window.location.hash;
        if (newHash) {
          /** @type {any} */
          const tabValue = newHash.replace('#', '');
          if (['add', 'view', 'chart'].includes(tabValue)) {
            currentTab = tabValue;
          }
        }
      });
    }
  });
  
  /**
   * Switch to a different tab
   * @param {'add' | 'view' | 'chart'} tab - The tab to switch to
   */
  function switchTab(tab) {
    currentTab = tab;
    window.location.hash = tab;
  }
</script>

<NavBar />
<ToastContainer />

<div class="container py-3">
  <div class="row justify-content-center">
    <div class="col-md-10 col-lg-8">
      <DateNavigation />
      
      <!-- Mobile tab navigation -->
      <div class="d-md-none mb-3">
        <div class="btn-group w-100" role="group">
          <button 
            type="button" 
            class="btn {currentTab === 'add' ? 'btn-primary' : 'btn-outline-primary'}" 
            on:click={() => switchTab('add')}
          >
            <i class="bi bi-plus-circle me-1"></i> Add
          </button>
          <button 
            type="button" 
            class="btn {currentTab === 'view' ? 'btn-primary' : 'btn-outline-primary'}" 
            on:click={() => switchTab('view')}
          >
            <i class="bi bi-list-ul me-1"></i> List
          </button>
          <button 
            type="button" 
            class="btn {currentTab === 'chart' ? 'btn-primary' : 'btn-outline-primary'}" 
            on:click={() => switchTab('chart')}
          >
            <i class="bi bi-pie-chart me-1"></i> Chart
          </button>
        </div>
      </div>
      
      <!-- Mobile view: Conditionally show components based on tab -->
      <div class="d-md-none">
        {#if currentTab === 'add'}
          <ExpenseForm />
        {:else if currentTab === 'view'}
          <ExpenseList />
        {:else if currentTab === 'chart'}
          <CategoryChart />
        {/if}
      </div>
      
      <!-- Desktop view: Show all components -->
      <div class="d-none d-md-block">
        <ExpenseForm />
        <ExpenseList />
        <CategoryChart />
      </div>
    </div>
  </div>
</div>

<style>
  :global(.badge.category-super) { background-color: #2563eb !important; }
  :global(.badge.category-xofa) { background-color: #7c3aed !important; }
  :global(.badge.category-food_drink) { background-color: #059669 !important; }
  :global(.badge.category-save_inv) { background-color: #10b981 !important; }
  :global(.badge.category-recurrent) { background-color: #f59e0b !important; }
  :global(.badge.category-clothing) { background-color: #ec4899 !important; }
  :global(.badge.category-personal) { background-color: #8b5cf6 !important; }
  :global(.badge.category-taxes) { background-color: #dc2626 !important; }
  :global(.badge.category-transport) { background-color: #6366f1 !important; }
  :global(.badge.category-health) { background-color: #06b6d4 !important; }
  :global(.badge.category-other) { background-color: #6b7280 !important; }
  :global(#chartCenterTotal) {
    pointer-events: none;
    z-index: 1;
  }
  
  /* iOS-specific fixes */
  @supports (-webkit-touch-callout: none) {
    :global(.btn-group .btn) {
      padding-top: 0.4rem;
      padding-bottom: 0.4rem;
    }
  }
</style> 