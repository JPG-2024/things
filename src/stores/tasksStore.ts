import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskMapBase } from '@/types/taskRunner.types';
import {
	mergeStoredTasks,
	deleteArticleMedia,
	buildUpsertInput,
	mapStoredArticle,
	fetchStoredArticlesByProfile,
	type ArticleWithTasks,
	type ArticleProfile,
	type PersistedTaskState,
	type StoredArticleRecord,
	type ProfileWithMostRecentArticle,
	type DeleteStoredArticleProfileResult
} from './articleHelpers';

export type { ArticleWithTasks, ArticleProfile, PersistedTaskState };
export { UNKNOWN_PROFILE_ID, UNKNOWN_PROFILE_LABEL } from './articleHelpers';

export async function getArticles(): Promise<ArticleWithTasks[]> {
	try {
		const result = await invoke<StoredArticleRecord[]>('list_stored_articles');

		return result.map((row) => mapStoredArticle(row));
	} catch (error) {
		console.error('Error querying DB articles', error);
		return [];
	}
}

export async function getProfiles(): Promise<ArticleProfile[]> {
	try {
		const result = await invoke<ArticleProfile[]>('list_stored_article_profiles');

		return result;
	} catch (error) {
		console.error('Error querying article profiles', error);
		return [];
	}
}

export async function getProfilesWithArticlesAfter(
	createdAtFrom: number
): Promise<ProfileWithMostRecentArticle[]> {
	try {
		const result = await invoke<ProfileWithMostRecentArticle[]>(
			'list_profiles_with_articles_after',
			{ createdAtFrom }
		);

		return result;
	} catch (error) {
		console.error('Error querying profiles with articles after date', error);
		return [];
	}
}

export async function getArticlesByProfile(
	profileId: string,
	options?: {
		createdAtFrom?: number;
		limit?: number;
	}
): Promise<ArticleWithTasks[]> {
	try {
		const result = await fetchStoredArticlesByProfile(
			profileId,
			['id', 'url', 'title', 'thumbnail'],
			options?.createdAtFrom,
			options?.limit
		);

		return result.map((row) => mapStoredArticle(row));
	} catch (error) {
		console.error('Error querying profile articles', error);
		return [];
	}
}

export async function getArticleWithTasksByUrl(url: string): Promise<ArticleWithTasks | null> {
	try {
		const row = await invoke<StoredArticleRecord | null>('get_stored_article_by_url', { url });

		if (!row) {
			return null;
		}

		return mapStoredArticle(row);
	} catch (error) {
		console.error('Error querying article', error);
		return null;
	}
}

export async function saveTasks<TMap extends TaskMapBase>(
	url: string,
	tasks: Task<TMap>[],
	valuesToOverride?: Partial<Record<string, unknown>> | undefined
): Promise<void> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		const tasksToSave = mergeStoredTasks(existingArticle?.persistedTasks, tasks);
		const input = await buildUpsertInput({
			url,
			tasksToSave,
			existingArticle,
			valuesToOverride
		});

		await invoke('upsert_stored_article', { input });
	} catch (error) {
		console.error('Error saving tasks:', error);
	}
}

export async function deleteArticleByUrl(url: string): Promise<{ success: boolean }> {
	try {
		const existingArticle = await getArticleWithTasksByUrl(url);
		await deleteArticleMedia(existingArticle);

		await invoke('delete_stored_article_by_url', { url });

		return { success: true };
	} catch (error) {
		console.error('Error deleting article from database:', error);
		return { success: false };
	}
}

export async function deleteProfileById(
	profileId: string
): Promise<DeleteStoredArticleProfileResult> {
	try {
		const articles = await fetchStoredArticlesByProfile(profileId);
		for (const article of articles) {
			await deleteArticleMedia(mapStoredArticle(article));
		}

		return await invoke<DeleteStoredArticleProfileResult>('delete_stored_article_profile', {
			profileId
		});
	} catch (error) {
		console.error('Error deleting article profile:', error);
		return { success: false, deletedCount: 0 };
	}
}

export async function saveProfile(
	profileId: string,
	profilePicture: string | null,
	lastVideoDate: string | null
): Promise<void> {
	try {
		await invoke('upsert_stored_article_profile', {
			input: {
				id: profileId.toLowerCase().replace(/\s+/g, '-'),
				name: profileId.toLowerCase().replace(/\s+/g, '-'),
				profilePicture,
				lastVideoDate
			}
		});
	} catch (error) {
		console.error('Error saving profile:', error);
	}
}
