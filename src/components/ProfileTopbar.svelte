<script lang="ts">
	import { type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import Icon from '@/components/Icon.svelte';
	import Toolbar from '@/components/Toolbar.svelte';

	interface Props {
		/** Plain label rendered next to the optional thumb. */
		name?: string;
		/** Optional round thumbnail (e.g. profile picture). Omit for name-only bars. */
		thumbSrc?: string | null;
		/** Icon shown in place of the thumb when `thumbSrc` is missing (e.g. 'User'). */
		fallbackIcon?: string;
		/** Back handler; defaults to navigating home. */
		onBack?: () => void;
		/** Right-side toolbar icons. */
		actions?: Snippet;
	}

	let { name, thumbSrc, fallbackIcon, onBack, actions }: Props = $props();

	function handleBack() {
		if (onBack) {
			onBack();
		} else {
			goto('/');
		}
	}
</script>

<div class="top-bar">
	<Toolbar justify="space-between" iconSize={20}>
		<div class="topbar-left">
			<Icon
				name="ArrowLeft"
				onClick={handleBack}
				tooltipProps={{ content: 'back' }}
				ariaLabel="Go back"
			/>
			{#if name}
				<div class="identity">
					{#if thumbSrc}
						<img class="thumb" src={thumbSrc} alt={name} />
					{:else if fallbackIcon}
						<Icon name={fallbackIcon} ariaLabel={name} />
					{/if}
					<span class="name">{name}</span>
				</div>
			{/if}
		</div>
		<div class="topbar-actions">{@render actions?.()}</div>
	</Toolbar>
</div>

<style>
	.top-bar {
		width: 100%;
		padding: 0 1rem;
		padding-right: 2rem;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.identity {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		max-width: 40ch;
	}

	.thumb {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.name {
		font-size: 1.15rem;
		font-weight: 600;
		font-family: var(--font-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
</style>
