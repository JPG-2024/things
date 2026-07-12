<script lang="ts">
	interface ScrollerItem {
		id: string;
		label: string;
		imageSrc?: string | null;
	}

	interface Props {
		items: ScrollerItem[];
		selectedId?: string;
		onSelect?: (id: string) => void;
		onHoverChange?: (id: string | null) => void;
		itemSize?: number;
		gap?: number;
		showIndex?: boolean;
		fullWidth?: boolean;
	}

	let {
		items,
		selectedId = $bindable(''),
		onSelect,
		onHoverChange,
		itemSize = 64,
		gap = 12,
		showIndex = false,
		fullWidth = true
	}: Props = $props();

	function hashHue(input: string): number {
		let hash = 5381;
		for (let i = 0; i < input.length; i++) {
			hash = (hash * 33) ^ input.charCodeAt(i);
		}
		return Math.abs(hash) % 360;
	}

	function colorFor(id: string): string {
		return `hsl(${hashHue(id)}, 60%, 50%)`;
	}

	function initialFor(label: string): string {
		const trimmed = label.trim();
		return trimmed.length ? trimmed[0].toUpperCase() : '?';
	}

	function handleClick(id: string) {
		selectedId = id;
		onSelect?.(id);
	}

	function handleMouseEnter(id: string) {
		onHoverChange?.(id);
	}

	function handleMouseLeave() {
		onHoverChange?.(null);
	}

	function handleWheel(e: WheelEvent) {
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
		const el = e.currentTarget as HTMLDivElement;
		const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
		el.scrollLeft += delta;
		e.preventDefault();
	}
</script>

<div
	class="scroller"
	class:full-width={fullWidth}
	style="--item-size: {itemSize}px; --gap: {gap}px;"
	onwheel={handleWheel}
	role="listbox"
	aria-label="Horizontal selector"
>
	<div class="track">
		{#each items as item, i (item.id)}
			{@const isSelected = item.id === selectedId}
			<button
				type="button"
				class="item"
				class:selected={isSelected}
				role="option"
				aria-selected={isSelected}
				onclick={() => handleClick(item.id)}
				onmouseenter={() => handleMouseEnter(item.id)}
				onmouseleave={handleMouseLeave}
			>
				<div class="avatar-wrap">
					{#if item.imageSrc}
						<img class="avatar" src={item.imageSrc} alt={item.label} />
					{:else}
						<div class="avatar fallback" style="background: {colorFor(item.id)}">
							<span class="fallback-letter">{initialFor(item.label)}</span>
						</div>
					{/if}
					{#if showIndex}
						<span class="index-badge">{i + 1}</span>
					{/if}
				</div>
				<span class="label">{item.label}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.scroller {
		position: relative;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		box-sizing: border-box;
	}

	.scroller::-webkit-scrollbar {
		display: none;
	}

	.scroller.full-width {
		width: 100%;
	}

	.track {
		display: inline-flex;
		gap: var(--gap);
		padding: 4px;
		box-sizing: border-box;
	}

	.scroller.full-width .track {
		display: flex;
	}

	.item {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem;
		background: transparent;
		border: none;
		cursor: pointer;
		outline: none;
		scroll-snap-align: start;
		border-radius: 12px;
		transition: transform 0.15s ease;
		color: inherit;
		font: inherit;
		min-width: var(--item-size);
	}

	.item:hover {
		transform: translateY(-2px);
	}

	.item:focus-visible .avatar-wrap {
		box-shadow: 0 0 0 2px var(--primary-color);
	}

	.item.selected .avatar-wrap {
		outline: 2px solid var(--primary-color);
		outline-offset: 2px;
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 25%, transparent);
	}

	.avatar-wrap {
		position: relative;
		width: var(--item-size);
		height: var(--item-size);
		flex-shrink: 0;
		border-radius: 999px;
		overflow: visible;
		transition: box-shadow 0.2s ease;
	}

	.avatar {
		width: 100%;
		height: 100%;
		border-radius: 999px;
		object-fit: cover;
		display: block;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: calc(var(--item-size) * 0.4);
		user-select: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.fallback-letter {
		line-height: 1;
	}

	.index-badge {
		position: absolute;
		right: -4px;
		bottom: -4px;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--primary-color);
		color: black;
		font-size: 0.7rem;
		font-weight: bold;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
		box-sizing: border-box;
	}

	.label {
		font-size: 0.75rem;
		max-width: calc(var(--item-size) + 16px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
		opacity: 0.85;
	}

	.item.selected .label {
		opacity: 1;
		font-weight: bold;
	}
</style>
