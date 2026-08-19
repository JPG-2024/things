<script lang="ts">
	import VoiceProfileWheel, {
		type WheelSelection
	} from '@/components/modals/VoiceProfileWheel.svelte';
	import { getImage, type Voice, type VoiceProfile } from '@/lib/utils/ttsService';
	import { colorFor, initialFor } from '@/lib/utils/avatar';
	import Icon from '@/components/Icon.svelte';
	import { viewState } from '@/stores/viewStore.svelte';

	type Props = {
		profiles: VoiceProfile[];
		chunks: Voice[];
		selection: WheelSelection;
		onChange: (selection: WheelSelection) => void;
		onChunksChanged?: () => void;
	};

	let { profiles, chunks, selection, onChange, onChunksChanged }: Props = $props();

	let showWheel = $state(false);

	let selectedProfile = $derived(profiles.find((p) => p.id === selection.profileId) ?? null);
</script>

<div class="voice-selector">
	<button
		type="button"
		class="current-profile-card"
		onclick={() => (showWheel = true)}
		disabled={profiles.length === 0}
		aria-label={selectedProfile
			? `Change voice. Currently ${selectedProfile.name_prefix}`
			: 'Choose voice'}
	>
		{#if selectedProfile}
			<div class="avatar-wrap">
				{#if selectedProfile.image_src}
					<img
						class="avatar"
						src={getImage(selectedProfile.image_src)}
						alt={selectedProfile.name_prefix}
					/>
				{:else}
					<div class="avatar fallback" style="background: {colorFor(selectedProfile.id)}">
						<span class="fallback-letter">{initialFor(selectedProfile.name_prefix)}</span>
					</div>
				{/if}
			</div>
			<div class="current-profile-meta">
				<span class="current-profile-name">{selectedProfile.name_prefix}</span>
				{#if selectedProfile.language}
					<span class="current-profile-lang">{selectedProfile.language.toUpperCase()}</span>
				{/if}
			</div>
		{:else}
			<div class="current-profile-meta">
				<span class="current-profile-name empty">No voice selected</span>
				<span class="current-profile-lang">Add one below to get started</span>
			</div>
		{/if}
		<div class="current-profile-action" aria-hidden="true">
			<Icon name="ChevronRight" size={18} color={viewState.primaryColor} />
		</div>
	</button>

	<VoiceProfileWheel
		show={showWheel}
		{profiles}
		{chunks}
		initial={selection}
		onCommit={onChange}
		{onChunksChanged}
		onClose={() => (showWheel = false)}
	/>
</div>

<style>
	.voice-selector {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		height: fit-content;
		width: fit-content;
	}

	.current-profile-card {
		display: inline-flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			transform 0.15s ease;
		max-width: 100%;
	}

	.current-profile-card:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
		transform: translateY(-1px);
	}

	.current-profile-card:focus-visible {
		outline: none;
		border-color: var(--primary-color);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 25%, transparent);
	}

	.current-profile-card:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.current-profile-meta {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
		min-width: 0;
	}

	.current-profile-name {
		font-size: 1rem;
		font-weight: 600;
		color: white;
	}

	.current-profile-name.empty {
		font-weight: 500;
		opacity: 0.7;
	}

	.current-profile-lang {
		font-size: 0.7rem;
		opacity: 0.6;
		letter-spacing: 0.05em;
	}

	.current-profile-action {
		flex-shrink: 0;
	}

	.avatar-wrap {
		width: 64px;
		height: 64px;
		border-radius: 999px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.avatar {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.5rem;
	}
</style>
