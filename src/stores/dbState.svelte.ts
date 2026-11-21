import {
	createDatabase,
	deleteDatabase,
	exportDatabase,
	getActiveDatabase,
	importDatabase,
	listDatabases,
	renameDatabase,
	switchDatabase
} from '@/lib/utils/dbManager';
import type { DatabaseInfo } from '@/types/database.types';
import { loadingStore } from '@/stores/loadingStore.svelte';
import { appLog } from '@/lib/utils/appLog';

function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Database workspaces manager. Every write goes through a Rust command; the
 * store only mirrors the list for the settings UI and resets the app after a
 * switch (a reload guarantees every cached list/store is dropped).
 */
class DbState {
	databases = $state<DatabaseInfo[]>([]);
	activeName = $state('');
	loading = $state(false);
	error = $state<string | null>(null);

	get active(): DatabaseInfo | null {
		return this.databases.find((database) => database.isActive) ?? null;
	}

	async refresh(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const [databases, activeName] = await Promise.all([listDatabases(), getActiveDatabase()]);
			this.databases = databases;
			this.activeName = activeName;
			appLog.debug('db', `workspaces refreshed (${databases.length}, active: ${activeName})`);
		} catch (error) {
			this.error = toMessage(error);
		} finally {
			this.loading = false;
		}
	}

	async create(name: string): Promise<boolean> {
		return this.run('create', `Create workspace ${name}`, async () => {
			await createDatabase(name);
			await this.refresh();
		});
	}

	async switchTo(name: string): Promise<boolean> {
		if (name === this.activeName) return false;
		return this.run('switch', `Switch to workspace ${name}`, async () => {
			await switchDatabase(name);
			this.activeName = name;
			window.location.reload();
		});
	}

	async rename(oldName: string, newName: string): Promise<boolean> {
		if (oldName === newName) return false;
		return this.run('rename', `Rename workspace ${oldName} → ${newName}`, async () => {
			const wasActive = oldName === this.activeName;
			await renameDatabase(oldName, newName);
			if (wasActive) {
				// The media/raw-content folders move with the workspace, so drop
				// any cached absolute paths by reloading the app.
				this.activeName = newName;
				window.location.reload();
				return;
			}
			await this.refresh();
		});
	}

	async remove(name: string): Promise<boolean> {
		return this.run('remove', `Delete workspace ${name}`, async () => {
			await deleteDatabase(name);
			await this.refresh();
		});
	}

	async exportToZip(name: string): Promise<boolean> {
		return this.run('export', `Export workspace ${name}`, async () => {
			await exportDatabase(name);
		});
	}

	async importFromZip(name: string): Promise<boolean> {
		return this.run('import', `Import workspace ${name}`, async () => {
			await importDatabase(name);
			await this.refresh();
		});
	}

	private async run(id: string, label: string, action: () => Promise<void>): Promise<boolean> {
		this.loading = true;
		this.error = null;
		loadingStore.start(`db:${id}`, { source: 'backend', module: 'db', label });
		try {
			await action();
			// A switch/rename of the active workspace reloads the webview: the
			// entry dies with it, but the log line above already landed.
			loadingStore.finish(`db:${id}`);
			return true;
		} catch (error) {
			this.error = toMessage(error);
			loadingStore.fail(`db:${id}`, this.error);
			return false;
		} finally {
			this.loading = false;
		}
	}
}

export const dbState = new DbState();
