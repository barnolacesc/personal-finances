<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    // Only redirect if we're not already on a valid page
    if ($page.url.pathname.startsWith('/expenses')) {
      // We're already on a valid page, do nothing
      return;
    } else {
      // For unknown paths, redirect to home
      goto('/', { replaceState: true });
    }
  });
</script>

<div class="container py-5 text-center">
  <div class="spinner-border text-primary" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>
</div> 