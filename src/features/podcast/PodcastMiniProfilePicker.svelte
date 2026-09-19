<script lang="ts">
	import Input from '@/components/inputs/Input.component.svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import Icon from '@/components/Icon.svelte';
	import { getImage, type VoiceProfile } from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import { fly } from 'svelte/transition';

	interface Props {
		profiles: VoiceProfile[];
		selectedProfileId: string;
		hostLabel: string;
		onPick: (profile: VoiceProfile) => void;
		onClose: () => void;
	}

	let { profiles, selectedProfileId, hostLabel, onPick, onClose }: Props = $props();

	let filter = $state('');

	let filteredProfiles = $derived(
		filter.trim() === ''
			? profiles
			: profiles.filter((p) => p.name_prefix.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	function autoScroll(node: HTMLElement, selected: boolean) {
		function apply(isSelected: boolean) {
			if (isSelected)
				node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
		}
		apply(selected);
		return {
			update(newSelected: boolean) {
				apply(newSelected);
			}
		};
	}

	function handlePick(profile: VoiceProfile) {
		onPick(profile);
		onClose();
	}
</script>

<div class="podcast-mini-picker" transition:fly={{ duration: 200, y: 40 }}>
	<div class="podcast-mini-picker__header">
		<span class="podcast-mini-picker__label">{hostLabel}</span>
		<div class="podcast-mini-picker__filter">
			<Input
				search={true}
				bind:value={filter}
				placeholder="Filter voices..."
				autofocus={true}
				onEnter={() => {
					const first = filteredProfiles[0];
					if (first) handlePick(first);
				}}
			/>
		</div>
		<button
			type="button"
			class="podcast-mini-picker__close"
			onclick={(e) => {
				e.stopPropagation();
				onClose();
			}}
			aria-label="Close picker"
		>
			<Icon name="X" size={18} />
		</button>
	</div>

	{#if filteredProfiles.length === 0}
		<p class="podcast-mini-picker__empty">No matching voices</p>
	{:else}
		<WheelStage gap={12} scrollSpeed={4}>
			{#each filteredProfiles as profile (profile.id)}
				{@const isSelected = profile.id === selectedProfileId}
				<button
					type="button"
					class="podcast-mini-picker__profile"
					class:selected={isSelected}
					use:autoScroll={isSelected}
					onclick={(e) => {
						e.stopPropagation();
						handlePick(profile);
					}}
					aria-label={profile.name_prefix}
					aria-pressed={isSelected}
				>
					<div class="podcast-mini-picker__avatar-wrap">
						{#if profile.image_src}
							<img
								class="podcast-mini-picker__avatar"
								src={getImage(profile.image_src)}
								alt={profile.name_prefix}
							/>
						{:else}
							<div
								class="podcast-mini-picker__avatar fallback"
								style="background: {colorFor(profile.id)}"
							>
								<span>{initialFor(profile.name_prefix)}</span>
							</div>
						{/if}
					</div>
					<span class="podcast-mini-picker__profile-name">{profile.name_prefix}</span>
				</button>
			{/each}
		</WheelStage>
	{/if}
</div>

<style>
	.podcast-mini-picker {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: 100%;
		align-items: center;
	}

	.podcast-mini-picker__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 50%;
	}

	.podcast-mini-picker__label {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.podcast-mini-picker__filter {
		flex: 1;
		min-width: 0;
	}

	.podcast-mini-picker__close {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: background 0.2s ease;
	}

	.podcast-mini-picker__close:hover {
		background: rgba(255, 255, 255, 0.12);
		color: white;
	}

	.podcast-mini-picker__empty {
		margin: 0;
		padding: 0.5rem 0;
		text-align: center;
		font-size: 0.85rem;
		color: white;
		opacity: 0.6;
	}

	.podcast-mini-picker__profile {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-radius: var(--radius-lg);
		transition: background-color 0.2s ease;
	}

	.podcast-mini-picker__profile:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	.podcast-mini-picker__profile.selected {
		cursor: default;
	}

	.podcast-mini-picker__avatar-wrap {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		transition: box-shadow 240ms ease;
	}

	.podcast-mini-picker__profile.selected .podcast-mini-picker__avatar-wrap {
		box-shadow: 0 0 0 2px var(--primary-color);
	}

	.podcast-mini-picker__avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.podcast-mini-picker__avatar.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
		user-select: none;
	}

	.podcast-mini-picker__profile-name {
		max-width: 92px;
		font-size: 0.8rem;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
