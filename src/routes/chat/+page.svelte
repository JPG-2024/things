<script lang="ts">
  import { page } from '$app/state'

  const articleId = $derived(page.url.searchParams.get('articleId'))
</script>

<div class="params-reader">
  <p><strong>ID:</strong> {articleId || 'Not provided'}</p>
</div>

<style>
  .params-reader {
    border: 1px solid #ccc;
    border-radius: 0.5rem;

    padding: 1rem;
  }

  p {
    margin: 0.5rem 0;
  }
</style>
