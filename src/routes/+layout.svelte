<script>
  import '../app.css';
  import { onMount } from 'svelte';
  
  // iOS viewport resize fix for when virtual keyboard appears
  onMount(() => {
    // Adjust viewport on input focus for iOS
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      const viewportMeta = document.querySelector('meta[name=viewport]');
      if (viewportMeta && viewportMeta instanceof HTMLMetaElement) {
        viewportMeta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
      }
      
      // Fix for input focus scrolling issues
      document.addEventListener('focusin', () => {
        // Small delay to allow the keyboard to appear
        setTimeout(() => {
          window.scrollTo(0, 0);
        }, 100);
      });
    }
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#f8f9fa">
</svelte:head>

<slot />

<style>
  :global(body) {
    background-color: #f8f9fa;
    margin: 0;
    padding: 0;
  }
  
  /* iOS momentum scrolling */
  :global(.scroll-container) {
    -webkit-overflow-scrolling: touch;
  }
</style> 