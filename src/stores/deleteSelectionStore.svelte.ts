import { SvelteSet } from 'svelte/reactivity';
import { deleteArticleByUrl } from '@/stores/webStore';
import { articleCacheStore } from '@/stores/articleCacheStore.svelte';

class DeleteSelectionStore {
	markedUrls = new SvelteSet<string>();
	isDeleting = $state(false);

	isMarked(url: string | null | undefined): boolean {
		if (!url) return false;
		return this.markedUrls.has(url);
	}

	toggle(url: string | null | undefined): void {
		if (!url) return;
		if (this.markedUrls.has(url)) {
			this.markedUrls.delete(url);
		} else {
			this.markedUrls.add(url);
		}
	}

	add(url: string | null | undefined): void {
		if (!url) return;
		this.markedUrls.add(url);
	}

	remove(url: string | null | undefined): void {
		if (!url) return;
		this.markedUrls.delete(url);
	}

	clear(): void {
		this.markedUrls.clear();
	}

	async deleteSelected(): Promise<void> {
		if (this.markedUrls.size === 0 || this.isDeleting) return;
		this.isDeleting = true;
		const urlsToDelete = [...this.markedUrls];
		try {
			for (const url of urlsToDelete) {
				try {
					await deleteArticleByUrl(url);
				} catch (error) {
					console.error('Failed to delete article', url, error);
				}
			}
			articleCacheStore.removeArticlesByUrls(new Set(urlsToDelete));
			void articleCacheStore.fetchProfilesWithArticles({ force: true });
			this.clear();
		} finally {
			this.isDeleting = false;
		}
	}
}

export const deleteSelectionStore = new DeleteSelectionStore();
