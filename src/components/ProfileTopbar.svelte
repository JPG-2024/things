<script lang="ts">
	import { type Snippet } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import ProfileThumb from '@/components/ProfileThumb.svelte';
	import Toolbar from '@/components/Toolbar.svelte';
	import { navigateBack } from '@/stores/navigationHistory.svelte';
	import TogleIccon from '@/components/ToggleIcon.svelte';

	interface Props {
		/** Plain label rendered next to the optional thumb. */
		name?: string;
		/** Optional round thumbnail (e.g. profile picture). Omit for name-only bars. */
		thumbSrc?: string | null;
		/** Icon shown in place of the thumb when `thumbSrc` is missing (e.g. 'User'). */
		fallbackIcon?: string;
		/** Optional icon rendered at the left of the name (e.g. 'Tag'). */
		iconName?: string;
		/** Back handler; defaults to navigating home. */
		onBack?: () => void;
		/** Right-side toolbar icons. */
		actions?: Snippet;
	}

	let { name, thumbSrc, fallbackIcon, iconName, onBack, actions }: Props = $props();

	function handleBack() {
		if (onBack) {
			onBack();
		} else {
			void navigateBack();
		}
	}
</script>

<div class="top-bar">
	<Toolbar justify="space-between" iconSize={20}>
		<div class="topbar-left">
			<TogleIccon
				name="ArrowLeft"
				onClick={handleBack}
				checked
				tooltipProps={{ content: 'back' }}
				ariaLabel="Go back"
			/>
			{#if name}
				<div class="identity">
					{#if thumbSrc}
						<ProfileThumb src={thumbSrc} tooltip={name} size={40} />
					{:else if fallbackIcon}
						<Icon name={fallbackIcon} ariaLabel={name} />
					{/if}
					{#if iconName}
						<span class="identity-icon">
							<Icon name={iconName} ariaLabel={name} />
						</span>
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
		padding: 1rem 0;
		padding-right: 3rem;
		padding-bottom: 2rem;
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

	.identity-icon {
		display: inline-flex;
		align-items: center;
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
