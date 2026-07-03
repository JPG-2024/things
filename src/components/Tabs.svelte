<script lang="ts">
	interface Tab {
		id: string;
		label: string;
	}

	interface Props {
		tabs: Tab[];
		activeTab: string;
	}

	let { tabs, activeTab = $bindable() }: Props = $props();
</script>

<div class="tabs">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			class="pill"
			class:pill--active={activeTab === tab.id}
			onclick={() => (activeTab = tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.pill {
		text-transform: capitalize;
		cursor: pointer;
		border: none;
		border-radius: 12px;
		background-color: transparent;
		padding: 7px 20px;
		width: max-content;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 0.88rem;
		line-height: 1.2;
	}

	.pill--active {
		text-shadow:
			0 0 5px var(--primary-color),
			0 0 10px var(--primary-color),
			0 0 20px var(--primary-color),
			0 0 40px var(--primary-color),
			0 0 80px white;
	}
</style>
