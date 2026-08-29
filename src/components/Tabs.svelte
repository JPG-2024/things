<script lang="ts">
	import ToggleIcon from '@/components/ToggleIcon.svelte';

	interface Tab {
		id: string;
		label: string;
		icon?: string;
	}

	interface Props {
		tabs: Tab[];
		activeTab: string;
		iconOnly?: boolean;
	}

	let { tabs, activeTab = $bindable(), iconOnly = false }: Props = $props();

	function handleTabClick(tabId: string, e: MouseEvent) {
		e.stopPropagation();
		activeTab = tabId;
	}
</script>

<div class="tabs">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			class="pill"
			class:pill--active={activeTab === tab.id}
			onclick={() => (activeTab = tab.id)}
		>
			{#if tab.icon}
				<ToggleIcon
					name={tab.icon}
					checked={activeTab === tab.id}
					onClick={(e) => handleTabClick(tab.id, e)}
					label={!iconOnly ? tab.label : null}
					tooltipProps={{ content: tab.label }}
					size={18}
				/>
			{:else if !iconOnly}
				{tab.label}
			{/if}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: flex-start;
	}

	.pill {
		text-transform: capitalize;
		cursor: pointer;
		border: none;
		border-radius: var(--radius-lg);
		background-color: transparent;
		padding: 7px 10px;
		width: max-content;
		color: var(--primary-color);
		font-weight: bold;
		font-size: 1rem;
		line-height: 1.2;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.pill--active {
		opacity: 1;
	}
</style>
