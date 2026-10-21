import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { DatabaseInfo } from '@/types/database.types';

export const listDatabases = (): Promise<DatabaseInfo[]> => invoke<DatabaseInfo[]>('db_list');

export const getActiveDatabase = (): Promise<string> => invoke<string>('db_active_name');

export const createDatabase = (name: string): Promise<void> => invoke<void>('db_create', { name });

export const switchDatabase = (name: string): Promise<void> => invoke<void>('db_switch', { name });

export const renameDatabase = (oldName: string, newName: string): Promise<void> =>
	invoke<void>('db_rename', { oldName, newName });

export const deleteDatabase = (name: string): Promise<void> => invoke<void>('db_delete', { name });

/** Absolute media folder of the active database (thumbnails, profile pictures). */
export const getMediaDirectory = (): Promise<string> => invoke<string>('db_media_dir');

/**
 * Asks for a destination file and writes the database workspace as a ZIP.
 * Resolves to the written path, or `null` when the user cancels the dialog.
 */
export async function exportDatabase(name?: string): Promise<string | null> {
	const target = await save({
		title: 'Export database',
		defaultPath: `${name ?? 'notian-database'}.zip`,
		filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
	});
	if (typeof target !== 'string' || !target.trim()) return null;
	return invoke<string>('db_export', { name: name ?? null, targetPath: target });
}

/**
 * Asks for a ZIP file and restores it as a new database. Resolves to `false`
 * when the user cancels the dialog.
 */
export async function importDatabase(name: string): Promise<boolean> {
	const source = await open({
		title: 'Import database',
		multiple: false,
		directory: false,
		filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
	});
	if (typeof source !== 'string' || !source.trim()) return false;
	await invoke<void>('db_import', { zipPath: source, name });
	return true;
}
