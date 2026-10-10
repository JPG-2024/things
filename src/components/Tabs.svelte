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
		// Stacks the tabs in a column and centers them vertically. The container
		// must get its height from outside; the vertical rail in ArticleList is
		// sticky and fills the viewport height.
		vertical?: boolean;
		onTabChange?: (tabId: string) => void;
		iconSize?: number;
	}

	let {
		tabs,
		activeTab = $bindable(),
		iconOnly = false,
		vertical = false,
		onTabChange = undefined,
		iconSize = 16
	}: Props = $props();

	function selectTab(tabId: string) {
		if (activeTab !== tabId) onTabChange?.(tabId);
		activeTab = tabId;
	}

	function handleTabClick(tabId: string, e: MouseEvent) {
		e.stopPropagation();
		selectTab(tabId);
	}

	// Scroll up goes left, scroll down goes right. DeltaX (horizontal trackpad
	// scrolls, Shift+scroll) is intentionally ignored so it stays available for
	// horizontal page/container scrolling. Clamped at the edges, no wrap-around.
	// Returns whether a switch occurred.
	function switchTabByOffset(offset: 1 | -1): boolean {
		const index = tabs.findIndex((t) => t.id === activeTab);
		const nextIndex = Math.min(tabs.length - 1, Math.max(0, index + offset));
		if (nextIndex === index) return false;
		selectTab(tabs[nextIndex].id);
		return true;
	}

	// Wheel over the tabs is owned by the tabs: deltaY switches the active tab
	// (clamped, no wrap-around) and the event is always cancelled, so the scroll
	// container behind the bar never scrolls — including at the first/last tab
	// where the switch is clamped.
	function handleWheel(e: WheelEvent) {
		if (e.deltaY === 0) return;
		switchTabByOffset(e.deltaY > 0 ? 1 : -1);
		e.preventDefault();
	}
</script>

<div
	class="tabs"
	class:tabs--icon-only={iconOnly}
	class:tabs--vertical={vertical}
	onwheel={handleWheel}
>
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			class="pill"
			class:pill--active={activeTab === tab.id}
			onclick={() => selectTab(tab.id)}
		>
			{#if tab.icon}
				<ToggleIcon
					name={tab.icon}
					checked={activeTab === tab.id}
					onClick={(e) => handleTabClick(tab.id, e)}
					label={!iconOnly ? tab.label : null}
					tooltipProps={{ content: tab.label }}
					size={iconSize}
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

	.tabs--vertical {
		flex-direction: column;
		flex-wrap: nowrap;
		justify-content: center;
		align-items: center;
		height: 100%;
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
		font-size: var(--tabs-pill-font-size, 0.7rem);
		line-height: 1.2;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		opacity: 0.6;
		transition: opacity 0.15s ease;
	}

	.pill--active {
		opacity: 1;
	}

	.tabs--icon-only .pill {
		opacity: 1;
	}
</style>
