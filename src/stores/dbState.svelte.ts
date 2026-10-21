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
		} catch (error) {
			this.error = toMessage(error);
		} finally {
			this.loading = false;
		}
	}

	async create(name: string): Promise<boolean> {
		return this.run(async () => {
			await createDatabase(name);
			await this.refresh();
		});
	}

	async switchTo(name: string): Promise<boolean> {
		if (name === this.activeName) return false;
		return this.run(async () => {
			await switchDatabase(name);
			this.activeName = name;
			window.location.reload();
		});
	}

	async rename(oldName: string, newName: string): Promise<boolean> {
		if (oldName === newName) return false;
		return this.run(async () => {
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
		return this.run(async () => {
			await deleteDatabase(name);
			await this.refresh();
		});
	}

	async exportToZip(name: string): Promise<boolean> {
		return this.run(async () => {
			await exportDatabase(name);
		});
	}

	async importFromZip(name: string): Promise<boolean> {
		return this.run(async () => {
			await importDatabase(name);
			await this.refresh();
		});
	}

	private async run(action: () => Promise<void>): Promise<boolean> {
		this.loading = true;
		this.error = null;
		try {
			await action();
			return true;
		} catch (error) {
			this.error = toMessage(error);
			return false;
		} finally {
			this.loading = false;
		}
	}
}

export const dbState = new DbState();
