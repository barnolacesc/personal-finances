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
  /** @type {boolean} */
  let chartInitialized = false;
  
  /**
   * Dynamically import chart components to prevent SSR issues
   * @returns {Promise<any|null>}
   */
  const importChartComponents = async () => {
    if (browser) {
      try {
        const { Doughnut } = await import('svelte-chartjs');
        const ChartJS = await import('chart.js');
        
        ChartJS.Chart.register(
          ChartJS.ArcElement,
          ChartJS.Title,
          ChartJS.Tooltip,
          ChartJS.Legend,
          ChartJS.CategoryScale
        );
        
        console.log('Chart components loaded successfully');
        return { Doughnut, ChartJS };
      } catch (err) {
        console.error('Failed to load chart components:', err);
        error = 'Failed to load chart components';
        return null;
      }
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
        display: false // Hide default legend for mobile
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
    cutout: '65%',
    responsive: true,
    maintainAspectRatio: false
  };

  // Initialize on the client side
  onMount(() => {
    const initializeChart = async () => {
      loading = true;
      
      if (!browser) {
        console.log('Not in browser environment');
        loading = false;
        return;
      }
      
      // Import chart components on the client side
      try {
        console.log('Importing chart components');
        chartComponent = await importChartComponents();
        chartInitialized = chartComponent !== null;
        console.log('Chart initialization:', chartInitialized ? 'success' : 'failed');
      } catch (err) {
        console.error('Error initializing chart:', err);
        error = 'Failed to initialize chart component';
      }
      
      if ($currentDate && chartInitialized) {
        console.log('Loading chart data', $currentDate);
        loadChartData();
      }
      
      // Watch for date changes
      unsubscribe = currentDate.subscribe(value => {
        if (value && chartInitialized) {
          loadChartData();
        }
      });
      
      loading = false;
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
      console.log('Chart data received:', data);
      
      // Ensure data is an array
      chartData = Array.isArray(data) ? data : [];
      totalAmount = chartData.reduce((sum, item) => sum + item.amount, 0);
      
      console.log('Chart data processed:', chartData.length, 'categories, total:', totalAmount);
    } catch (err) {
      console.error('Error loading chart data:', err);
      error = err instanceof Error ? err.message : 'Failed to load chart data';
      showToast(String(error), 'error');
    } finally {
      loading = false;
    }
  }
</script>

<div class="card mb-3">
  <div class="card-body p-3">
    <h3 class="card-title mb-3">Category Distribution</h3>
    
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
    {:else if browser && chartComponent && chartInitialized}
      <div class="chart-container" style="position: relative; height: 250px;">
        <svelte:component this={chartComponent.Doughnut} data={chartDataConfig} options={chartOptions} />
        
        <!-- Center text overlay -->
        <div class="chart-center-total">
          <div class="total-amount">${totalAmount.toFixed(2)}</div>
          <div class="total-label">Total</div>
        </div>
      </div>
      
      <!-- Custom mobile-friendly legend -->
      <div class="chart-legend mt-3">
        {#each chartData as item, i}
          <div class="legend-item d-flex justify-content-between align-items-center py-1">
            <div class="d-flex align-items-center">
              <span class="color-dot me-2" style="background-color: {backgroundColors[i % backgroundColors.length]};"></span>
              <span class="legend-label">{item.category}</span>
            </div>
            <div class="d-flex flex-column align-items-end">
              <span class="legend-value">${item.amount.toFixed(2)}</span>
              <span class="legend-percent text-muted">{((item.amount / totalAmount) * 100).toFixed(1)}%</span>
            </div>
          </div>
        {/each}
      </div>
    {:else if browser && !chartInitialized}
      <div class="alert alert-warning">
        Chart library failed to initialize. Try refreshing the page.
      </div>
    {/if}
  </div>
</div>

<style>
  .chart-container {
    position: relative;
    max-width: 100%;
    margin: 0 auto;
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
    font-size: 1.25rem;
    font-weight: bold;
  }
  
  .total-label {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .chart-legend {
    font-size: 0.9rem;
    max-height: 250px;
    overflow-y: auto;
    border-top: 1px solid #e5e7eb;
    padding-top: 0.5rem;
  }
  
  .legend-item {
    padding: 0.25rem 0;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .color-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  
  .legend-label {
    text-transform: capitalize;
  }
  
  .legend-percent {
    font-size: 0.75rem;
  }
  
  /* iPhone-specific optimizations */
  @media (max-width: 428px) {
    .card-body {
      padding: 0.75rem;
    }
    
    .chart-container {
      height: 220px !important;
    }
    
    .total-amount {
      font-size: 1.1rem;
    }
    
    .legend-label {
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style> 