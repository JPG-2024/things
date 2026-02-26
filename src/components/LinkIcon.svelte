<script lang="ts">
  let { url }: { url: string } = $props()
  import Icon from './Icon.svelte'

  async function copyToClipboard(event: MouseEvent) {
    event.preventDefault()
    try {
      await navigator.clipboard.writeText(url)
      // Optionally, you can show a notification or visual feedback here
    } catch (err) {
      // Optionally, handle error
      console.error('Failed to copy!', err)
    }
  }
</script>

<button type="button" onclick={copyToClipboard} class="link" title="Copy link">
  <Icon name="Link" />
</button>

<style>
  .link {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .link:hover {
    text-decoration: underline;
  }
</style>
