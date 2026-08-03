<script lang="ts">
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<div class="toolbar-divider {className}"></div>

<style>
	.toolbar-divider {
		width: 1px;
		height: 1.2em;
		background: color-mix(in srgb, var(--primary-color) 40%, transparent);
		margin: 0 0.5rem;
	}
</style>
