<script lang="ts">
	import { musicState } from '@/stores/musicStore.svelte';
	import { drawersState, viewState } from '@/stores/viewStore.svelte';
	import Icon from '@/components/Icon.svelte';
	import Input from '@/components/inputs/Input.component.svelte';
	import ToggleIcon from '@/components/ToggleIcon.svelte';
	import { extractValidUrl } from '@/lib/utils/pasteUrl';

	let manualInput = $state('');
	let feedback = $state<{ added: number; skipped: number } | null>(null);
	let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleClose() {
		drawersState.close('downloads');
	}

	async function handleDownloadAll() {
		await musicState.downloadAll();
	}

	function handleRetry(itemId: string) {
		void musicState.downloadSingle(itemId);
	}

	function handleRemove(itemId: string) {
		musicState.removeItem(itemId);
	}

	function showFeedback(added: number, skipped: number) {
		feedback = { added, skipped };
		if (feedbackTimeout) clearTimeout(feedbackTimeout);
		feedbackTimeout = setTimeout(() => {
			feedback = null;
		}, 4000);
	}

	function handleManualAdd() {
		const lines = manualInput
			.split(/[\n,\s]+/)
			.map((s) => s.trim())
			.filter(Boolean);

		const validUrls: string[] = [];
		for (const line of lines) {
			const valid = extractValidUrl(line);
			if (valid) validUrls.push(valid);
		}

		if (validUrls.length === 0) return;

		const result = musicState.addToQueue(validUrls);
		showFeedback(result.added.length, result.skipped.length);
		manualInput = '';
	}

	function handleManualKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleManualAdd();
		}
	}
</script>

<div class="panel">
	<div class="panel-header">
		<h2>
			<Icon name="Download" size={30} color={viewState.primaryColor} />
			<span>Downloads</span>
			{#if musicState.downloads.length > 0}
				<span class="counter">({musicState.downloads.length})</span>
			{/if}
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

	<div class="manual-add">
		<textarea
			bind:value={manualInput}
			placeholder="Paste URLs here (one per line)"
			rows="2"
			class="manual-input"
			onkeydown={handleManualKeyDown}
		></textarea>
		<button
			type="button"
			class="manual-add-btn"
			onclick={handleManualAdd}
			disabled={!manualInput.trim()}
		>
			<Icon name="Plus" size={16} />
			<span>Add</span>
		</button>
	</div>

	{#if feedback}
		<div class="feedback" class:has-skipped={feedback.skipped > 0}>
			{#if feedback.added > 0}
				<span class="feedback-added">+{feedback.added} added</span>
			{/if}
			{#if feedback.skipped > 0}
				<span class="feedback-skipped">{feedback.skipped} already in queue</span>
			{/if}
		</div>
	{/if}

	{#if musicState.pendingCount > 0}
		<button
			type="button"
			class="download-all-btn"
			onclick={handleDownloadAll}
			disabled={musicState.isDownloading}
		>
			{#if musicState.isDownloading}
				<div class="btn-spinner"></div>
				<span>Downloading…</span>
			{:else}
				<Icon name="Download" size={18} />
				<span>Download All ({musicState.pendingCount})</span>
			{/if}
		</button>
	{/if}

	{#if musicState.downloads.length === 0}
		<div class="empty-state">
			<Icon name="Music" size={48} color="rgba(255,255,255,0.3)" />
			<p>No downloads yet</p>
		</div>
	{:else}
		<div class="downloads-list">
			{#each musicState.downloads as track (track.id)}
				<div
					class="download-item"
					class:error={track.status === 'error'}
					class:done={track.status === 'done'}
				>
					<div class="track-info">
						<div class="track-url" title={track.url}>
							{track.url}
						</div>
						{#if track.filename && track.status === 'done'}
							<div class="track-filename" title={track.filename}>
								{track.filename}
							</div>
						{/if}
						{#if track.error}
							<div class="track-error">{track.error}</div>
						{/if}
					</div>
					<div class="track-actions">
						{#if track.status === 'pending'}
							<button
								type="button"
								class="action-btn remove"
								aria-label="Remove from queue"
								onclick={() => handleRemove(track.id)}
							>
								<Icon name="X" size={14} />
							</button>
						{:else if track.status === 'error'}
							<button
								type="button"
								class="action-btn retry"
								aria-label="Retry download"
								onclick={() => handleRetry(track.id)}
							>
								<Icon name="RotateCw" size={14} />
							</button>
							<button
								type="button"
								class="action-btn remove"
								aria-label="Remove"
								onclick={() => handleRemove(track.id)}
							>
								<Icon name="X" size={14} />
							</button>
						{/if}
						<div class="track-status">
							{#if track.status === 'pending'}
								<div class="status-dot pending" title="Pending"></div>
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

	.counter {
		font-size: 0.85rem;
		opacity: 0.7;
		font-weight: normal;
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

	.manual-add {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		align-items: stretch;
	}

	.manual-input {
		flex: 1;
		resize: none;
		padding: 0.5rem 0.7rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.95);
		font-family: inherit;
		font-size: 0.85rem;
		line-height: 1.4;
		transition: border-color 0.15s;
		min-height: 38px;
	}

	.manual-input:focus {
		outline: none;
		border-color: color-mix(in srgb, var(--primary-color) 60%, transparent);
	}

	.manual-input::placeholder {
		color: rgba(255, 255, 255, 0.35);
	}

	.manual-add-btn {
		all: unset;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		cursor: pointer;
		padding: 0 0.9rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--primary-color);
		border: 1px solid color-mix(in srgb, var(--primary-color) 50%, transparent);
		background: color-mix(in srgb, var(--primary-color) 10%, transparent);
		transition: all 0.15s;
		white-space: nowrap;
	}

	.manual-add-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--primary-color) 20%, transparent);
	}

	.manual-add-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.feedback {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.feedback.has-skipped {
		border-color: rgba(248, 113, 113, 0.3);
	}

	.feedback-added {
		color: #4ade80;
	}

	.feedback-skipped {
		color: #f87171;
	}

	.download-all-btn {
		all: unset;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.7rem 1rem;
		margin-bottom: 1rem;
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 600;
		color: #0a0a0a;
		background: var(--primary-color);
		transition:
			opacity 0.15s,
			transform 0.1s;
	}

	.download-all-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.download-all-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.download-all-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-top-color: #0a0a0a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
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

	.download-item.done {
		opacity: 0.75;
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

	.track-filename {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 0.2rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track-error {
		font-size: 0.75rem;
		color: #f87171;
		margin-top: 0.25rem;
	}

	.track-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.action-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.6);
		transition:
			background 0.15s,
			color 0.15s;
	}

	.action-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.95);
	}

	.action-btn.retry:hover {
		color: var(--primary-color);
	}

	.action-btn.remove:hover {
		color: #f87171;
	}

	.track-status {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
	}

	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
	}

	.status-dot.pending {
		background: rgba(255, 255, 255, 0.25);
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
