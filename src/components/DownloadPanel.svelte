<script lang="ts">
	import { musicState } from '@/stores/musicStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';

	function handleClose() {
		drawersState.close('downloads');
	}
</script>

<div class="panel">
	<div class="panel-header">
		<h2>
			<Icon name="Download" size={30} color={viewState.primaryColor} />
			<span>Downloads</span>
		</h2>
		<div class="panel-actions">
			{#if musicState.downloads.some((d) => d.status === 'done' || d.status === 'error')}
				<button type="button" class="clear-btn" onclick={() => musicState.clearFinished()}>
					Clear finished
				</button>
			{/if}
			<button type="button" class="close-btn" onclick={handleClose}>
				<Icon name="X" size={20} />
			</button>
		</div>
	</div>

	<div class="download-controls">
		<Input bind:value={musicState.downloadFolder} placeholder="folder name" />
		<button type="button" class="toggle-btn" aria-label="Toggle keep URL params">
			<ToggleIcon
				name="Link"
				bind:checked={musicState.downloadPlaylist}
				size={18}
				tooltipProps={{ content: 'keep URL params' }}
			/>
		</button>
	</div>

	{#if musicState.downloads.length === 0}
		<div class="empty-state">
			<Icon name="Music" size={48} color="rgba(255,255,255,0.3)" />
			<p>No downloads yet</p>
		</div>
	{:else}
		<div class="downloads-list">
			{#each musicState.downloads as track (track.id)}
				<div class="download-item" class:error={track.status === 'error'}>
					<div class="track-info">
						<div class="track-url" title={track.url}>
							{track.url}
						</div>
						{#if track.error}
							<div class="track-error">{track.error}</div>
						{/if}
					</div>
					<div class="track-status">
						{#if track.status === 'pending'}
							<div class="status-icon pending">
								<div class="spinner"></div>
							</div>
						{:else if track.status === 'downloading'}
							<div class="status-icon downloading">
								<div class="spinner"></div>
							</div>
						{:else if track.status === 'done'}
							<div class="status-icon done">
								<Icon name="Check" size={18} color="#4ade80" />
							</div>
						{:else if track.status === 'error'}
							<div class="status-icon error">
								<Icon name="AlertCircle" size={18} color="#f87171" />
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.panel {
		padding: 1.5rem;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.panel-header h2 {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		font-size: 1.3rem;
		color: var(--primary-color);
	}

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.clear-btn {
		all: unset;
		cursor: pointer;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		font-size: 0.85rem;
		color: var(--primary-color);
		border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
		transition: all 0.15s;
	}

	.clear-btn:hover {
		background: color-mix(in srgb, var(--primary-color) 15%, transparent);
	}

	.close-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.4rem;
		border-radius: 6px;
		color: var(--primary-color);
		transition: background 0.15s;
	}

	.close-btn:hover {
		background: color-mix(in srgb, var(--primary-color) 15%, transparent);
	}

	.download-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.download-controls .text-input {
		flex: 1;
	}

	.toggle-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.4rem;
		border-radius: 6px;
		transition: background 0.15s;
	}

	.toggle-btn:hover {
		background: color-mix(in srgb, var(--primary-color) 15%, transparent);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		flex: 1;
		opacity: 0.6;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.95rem;
	}

	.downloads-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.download-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: border-color 0.15s;
	}

	.download-item:hover {
		border-color: color-mix(in srgb, var(--primary-color) 30%, transparent);
	}

	.download-item.error {
		border-color: rgba(248, 113, 113, 0.3);
	}

	.track-info {
		flex: 1;
		min-width: 0;
	}

	.track-url {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track-error {
		font-size: 0.75rem;
		color: #f87171;
		margin-top: 0.25rem;
	}

	.track-status {
		flex-shrink: 0;
	}

	.status-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--primary-color);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
