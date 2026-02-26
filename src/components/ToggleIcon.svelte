<script lang="ts">
  import Icon from './Icon.svelte'

  let { name, checked = false, onToggle, ...props } = $props()
</script>

<Icon {name} {...props} handleClick={onToggle} style="opacity: {checked ? 1 : 0.5}" />
