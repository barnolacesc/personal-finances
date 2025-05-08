<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
</script>

<div class="container py-5">
  <div class="row justify-content-center">
    <div class="col-md-8 col-lg-6">
      <h1 class="text-center mb-5">Personal Finance Tracker</h1>
      
      <div class="d-flex flex-column gap-4">
        <button 
          class="card landing-button shadow-sm border-0" 
          on:click={() => goto('/expenses#add')}
        >
          <div class="card-body d-flex flex-column justify-content-center align-items-center">
            <i class="bi bi-plus-circle text-primary mb-3"></i>
            <h2 class="mb-0">Add Expense</h2>
          </div>
        </button>
        
        <button 
          class="card landing-button shadow-sm border-0" 
          on:click={() => goto('/expenses#view')}
        >
          <div class="card-body d-flex flex-column justify-content-center align-items-center">
            <i class="bi bi-list-ul text-success mb-3"></i>
            <h2 class="mb-0">View Expenses</h2>
          </div>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .landing-button {
    height: 200px;
    transition: transform 0.2s;
    background: white;
    cursor: pointer;
  }
  .landing-button:hover {
    transform: scale(1.02);
  }
  .landing-button i {
    font-size: 3rem;
  }
</style> 