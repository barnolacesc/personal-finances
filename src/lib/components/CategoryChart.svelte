<script>
  import { onMount } from 'svelte';
  import { currentDate } from './DateNavigation.svelte';
  import { showToast } from '$lib/utils/toast';
  import { browser } from '$app/environment';

  /** @typedef {{category: string, amount: number}} CategoryData */
  
  /** @type {boolean} */
  let loading = true;
  /** @type {string|null} */
  let error = null;
  /** @type {CategoryData[]} */
  let chartData = [];
  /** @type {number} */
  let totalAmount = 0;
  /** @type {any} */
  let chartComponent = null;
  /** @type {function|null} */
  let unsubscribe = null;
  
  /**
   * Dynamically import chart components to prevent SSR issues
   * @returns {Promise<any|null>}
   */
  const importChartComponents = async () => {
    if (browser) {
      const { Doughnut } = await import('svelte-chartjs');
      const ChartJS = await import('chart.js');
      
      ChartJS.Chart.register(
        ChartJS.ArcElement,
        ChartJS.Title,
        ChartJS.Tooltip,
        ChartJS.Legend,
        ChartJS.CategoryScale
      );
      
      return { Doughnut, ChartJS };
    }
    return null;
  };
  
  // Chart data and colors
  $: chartLabels = chartData.map(item => item.category);
  $: chartValues = chartData.map(item => item.amount);
  $: backgroundColors = [
    '#2563eb', // super
    '#7c3aed', // xofa
    '#059669', // food_drink
    '#10b981', // save_inv
    '#f59e0b', // recurrent
    '#ec4899', // clothing
    '#8b5cf6', // personal
    '#dc2626', // taxes
    '#6366f1', // transport
    '#06b6d4', // health
    '#6b7280'  // other
  ];
  
  $: chartDataConfig = {
    labels: chartLabels,
    datasets: [
      {
        data: chartValues,
        backgroundColor: backgroundColors
      }
    ]
  };
  
  $: chartOptions = {
    plugins: {
      legend: {
        position: 'right',
      },
      tooltip: {
        callbacks: {
          /**
           * @param {Object} context
           * @param {string} [context.label]
           * @param {number} context.raw
           */
          label: function(context) {
            const value = Number(context.raw);
            const percentage = ((value / totalAmount) * 100).toFixed(1);
            return `${context.label}: $${value.toFixed(2)} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '70%',
    responsive: true,
    maintainAspectRatio: false
  };

  // Initialize on the client side
  onMount(() => {
    const initializeChart = async () => {
      // Import chart components on the client side
      chartComponent = await importChartComponents();
      
      if ($currentDate) {
        loadChartData();
      }
      
      // Watch for date changes
      unsubscribe = currentDate.subscribe(value => {
        if (value) {
          loadChartData();
        }
      });
    };
    
    initializeChart();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  });

  /**
   * Load chart data from the API
   */
  async function loadChartData() {
    try {
      loading = true;
      error = null;
      
      const year = $currentDate.getFullYear();
      const month = $currentDate.getMonth() + 1;
      console.log(`Loading chart data for ${year}-${month}`);
      
      const response = await fetch(`/api/expenses/summary?year=${year}&month=${month}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load chart data');
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      chartData = Array.isArray(data) ? data : [];
      totalAmount = chartData.reduce((sum, item) => sum + item.amount, 0);
    } catch (err) {
      console.error('Error loading chart data:', err);
      error = err instanceof Error ? err.message : 'Failed to load chart data';
      showToast(String(error), 'error');
    } finally {
      loading = false;
    }
  }
</script>

<div class="card mb-4">
  <div class="card-body">
    <h3 class="card-title mb-4">Category Distribution</h3>
    
    {#if loading}
      <div class="text-center">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    {:else if error}
      <div class="alert alert-danger" role="alert">
        {error}
        <button class="btn btn-sm btn-outline-danger ms-2" on:click={loadChartData}>
          Try Again
        </button>
      </div>
    {:else if chartData.length === 0}
      <p class="text-center text-muted">No expense data for this month</p>
    {:else if browser && chartComponent}
      <div class="chart-container" style="position: relative; height: 300px;">
        <svelte:component this={chartComponent.Doughnut} data={chartDataConfig} options={chartOptions} />
        
        <!-- Center text overlay -->
        <div class="chart-center-total">
          <div class="total-amount">${totalAmount.toFixed(2)}</div>
          <div class="total-label">Total</div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .chart-container {
    position: relative;
  }
  
  .chart-center-total {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    z-index: 1;
  }
  
  .total-amount {
    font-size: 1.5rem;
    font-weight: bold;
  }
  
  .total-label {
    font-size: 0.875rem;
    color: #6b7280;
  }
</style> 