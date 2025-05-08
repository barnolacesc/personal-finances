<script>
  import { page } from '$app/stores';
</script>

<div class="container py-5">
  <div class="row justify-content-center">
    <div class="col-md-8 col-lg-6 text-center">
      <h1 class="mb-4">{$page.status}: {$page.error?.message}</h1>
      <p class="text-muted mb-4">
        {#if $page.status === 404}
          The page you're looking for doesn't exist.
        {:else}
          Something went wrong. Please try again later.
        {/if}
      </p>
      <a href="/" class="btn btn-primary">Go Home</a>
    </div>
  </div>
</div> 