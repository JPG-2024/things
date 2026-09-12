<script lang="ts">
	import Input from '@/components/inputs/Input.component.svelte';
	import WheelStage from '@/components/WheelStage.svelte';
	import Icon from '@/components/Icon.svelte';
	import { getImage, type VoiceProfile } from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import { fly } from 'svelte/transition';

	interface Props {
		filteredProfiles: VoiceProfile[];
		selectedProfileId: string;
		filter?: string;
		onPick: (profile: VoiceProfile) => void;
		onExpand: () => void;
	}

	let {
		filteredProfiles,
		selectedProfileId,
		filter = $bindable(''),
		onPick,
		onExpand
	}: Props = $props();

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
</script>

<div class="tts-player-mini__picker" transition:fly={{ duration: 200, y: 40 }}>
	<div class="tts-player-mini__picker-header">
		<div class="tts-player-mini__filter">
			<Input
				search={true}
				bind:value={filter}
				placeholder="Filter voices..."
				autofocus={true}
				onEnter={() => {
					const first = filteredProfiles[0];
					if (first) onPick(first);
				}}
			/>
		</div>
		<button
			type="button"
			class="tts-player-mini__expand"
			onclick={(e) => {
				e.stopPropagation();
				onExpand();
			}}
			aria-label="Open full player"
			title="Open full player"
		>
			<Icon name="Maximize2" size={18} />
		</button>
	</div>

	{#if filteredProfiles.length === 0}
		<p class="tts-player-mini__empty">No matching voices</p>
	{:else}
		<WheelStage gap={12} scrollSpeed={4}>
			{#each filteredProfiles as profile (profile.id)}
				{@const isSelected = profile.id === selectedProfileId}
				<button
					type="button"
					class="tts-player-mini__profile"
					class:selected={isSelected}
					use:autoScroll={isSelected}
					onclick={(e) => {
						e.stopPropagation();
						onPick(profile);
					}}
					aria-label={profile.name_prefix}
					aria-pressed={isSelected}
				>
					<div class="tts-player-mini__avatar-wrap">
						{#if profile.image_src}
							<img
								class="tts-player-mini__avatar"
								src={getImage(profile.image_src)}
								alt={profile.name_prefix}
							/>
						{:else}
							<div
								class="tts-player-mini__avatar fallback"
								style="background: {colorFor(profile.id)}"
							>
								<span>{initialFor(profile.name_prefix)}</span>
							</div>
						{/if}
					</div>
					<span class="tts-player-mini__profile-name">{profile.name_prefix}</span>
				</button>
			{/each}
		</WheelStage>
	{/if}
</div>

<style>
	.tts-player-mini__picker {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: 100%;
		align-items: center;
	}

	.tts-player-mini__picker-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 50%;
	}

	.tts-player-mini__filter {
		flex: 1;
		min-width: 0;
	}

	.tts-player-mini__expand {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		color: var(--primary-color);
		cursor: pointer;
		background: rgba(154, 154, 154, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: background 0.2s ease;
	}

	.tts-player-mini__expand:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.tts-player-mini__empty {
		margin: 0;
		padding: 0.5rem 0;
		text-align: center;
		font-size: 0.85rem;
		color: white;
		opacity: 0.6;
	}

	.tts-player-mini__profile {
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

	.tts-player-mini__profile:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	.tts-player-mini__profile.selected {
		cursor: default;
	}

	.tts-player-mini__avatar-wrap {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		transition: box-shadow 240ms ease;
	}

	.tts-player-mini__profile.selected .tts-player-mini__avatar-wrap {
		box-shadow: 0 0 0 2px var(--primary-color);
	}

	.tts-player-mini__avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-sizing: border-box;
	}

	.tts-player-mini__avatar.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
		user-select: none;
	}

	.tts-player-mini__profile-name {
		max-width: 92px;
		font-size: 0.8rem;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
