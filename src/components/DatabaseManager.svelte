<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '@/components/Icon.svelte';
	import Button from '@/components/inputs/Button.component.svelte';
	import TextField from '@/components/inputs/fields/TextField.component.svelte';
	import { dbState } from '@/stores/dbState.svelte';

	let newName = $state('');
	let renameTarget = $state<string | null>(null);
	let renameValue = $state('');
	let deleteTarget = $state<string | null>(null);

	onMount(() => {
		void dbState.refresh();
	});

	function formatSize(bytes: number): string {
		if (bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / 1024 ** exponent;
		return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
	}

	async function handleCreate() {
		const name = newName.trim();
		if (!name) return;
		if (await dbState.create(name)) newName = '';
	}

	async function handleImport() {
		const name = newName.trim();
		if (!name) return;
		if (await dbState.importFromZip(name)) newName = '';
	}

	function startRename(name: string) {
		renameTarget = name;
		renameValue = name;
		deleteTarget = null;
	}

	async function confirmRename() {
		if (!renameTarget) return;
		const next = renameValue.trim();
		if (!next) return;
		if (await dbState.rename(renameTarget, next)) {
			renameTarget = null;
			renameValue = '';
		}
	}

	async function confirmDelete(name: string) {
		if (deleteTarget !== name) {
			deleteTarget = name;
			renameTarget = null;
			return;
		}
		if (await dbState.remove(name)) deleteTarget = null;
	}
</script>

<div class="db-manager">
	{#if dbState.error}
		<p class="error-text">{dbState.error}</p>
	{/if}

	<ul class="db-list">
		{#each dbState.databases as database (database.name)}
			<li class="db-row" class:active={database.isActive}>
				<div class="db-main">
					<Icon name={database.isActive ? 'Database' : 'HardDrive'} size={16} />
					{#if renameTarget === database.name}
						<div class="db-rename">
							<TextField
								label="Rename to"
								bind:value={renameValue}
								onEnter={() => void confirmRename()}
							/>
							<div class="db-actions">
								<Button
									onClick={() => void confirmRename()}
									icon="Check"
									disabled={dbState.loading}
								>
									Save
								</Button>
								<Button onClick={() => (renameTarget = null)} icon="X">Cancel</Button>
							</div>
						</div>
					{:else}
						<span class="db-name">{database.name}</span>
						{#if database.isActive}
							<span class="db-badge">active</span>
						{/if}
						<span class="db-size">{formatSize(database.sizeBytes)}</span>
					{/if}
				</div>

				{#if renameTarget !== database.name}
					<div class="db-actions">
						{#if !database.isActive}
							<Button
								onClick={() => void dbState.switchTo(database.name)}
								icon="ArrowRightLeft"
								disabled={dbState.loading}
							>
								Switch
							</Button>
						{/if}
						<Button
							onClick={() => startRename(database.name)}
							icon="Pencil"
							disabled={dbState.loading}
						>
							Rename
						</Button>
						<Button
							onClick={() => void dbState.exportToZip(database.name)}
							icon="Download"
							disabled={dbState.loading}
						>
							Export
						</Button>
						{#if !database.isActive}
							<Button
								onClick={() => void confirmDelete(database.name)}
								icon={deleteTarget === database.name ? 'AlertTriangle' : 'Trash2'}
								disabled={dbState.loading}
							>
								{deleteTarget === database.name ? 'Confirm delete' : 'Delete'}
							</Button>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="db-create">
		<TextField
			label="New database name"
			placeholder="e.g. trabajo"
			helper="Letters, numbers, dashes and underscores."
			bind:value={newName}
			onEnter={() => void handleCreate()}
		/>
		<div class="db-actions">
			<Button
				onClick={() => void handleCreate()}
				icon="Plus"
				disabled={dbState.loading || !newName.trim()}
			>
				Create
			</Button>
			<Button
				onClick={() => void handleImport()}
				icon="Upload"
				disabled={dbState.loading || !newName.trim()}
			>
				Import .zip as this name
			</Button>
			<Button onClick={() => void dbState.refresh()} icon="RefreshCw" disabled={dbState.loading}>
				Refresh
			</Button>
		</div>
	</div>
</div>

<style>
	.db-manager {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.db-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.db-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-sm);
	}

	.db-row.active {
		border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
	}

	.db-main {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.db-name {
		font-family: var(--font-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.db-badge {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		color: var(--primary-color);
		border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
	}

	.db-size {
		margin-left: auto;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
	}

	.db-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.db-rename {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
	}

	.db-create {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.error-text {
		margin: 0;
		font-size: 0.8rem;
		color: rgb(255, 140, 109);
		word-break: break-word;
	}
</style>
