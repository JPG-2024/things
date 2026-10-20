import { SvelteSet } from 'svelte/reactivity';
import { deleteArticleByUrl } from '@/stores/webStore';
import { articleCacheStore } from '@/stores/articleCacheStore.svelte';

class SelectedArticlesStore {
	selectedUrls = new SvelteSet<string>();
	isDeleting = $state(false);

	isSelected(url: string | null | undefined): boolean {
		if (!url) return false;
		return this.selectedUrls.has(url);
	}

	toggle(url: string | null | undefined): void {
		if (!url) return;
		if (this.selectedUrls.has(url)) {
			this.selectedUrls.delete(url);
		} else {
			this.selectedUrls.add(url);
		}
	}

	add(url: string | null | undefined): void {
		if (!url) return;
		this.selectedUrls.add(url);
	}

	remove(url: string | null | undefined): void {
		if (!url) return;
		this.selectedUrls.delete(url);
	}

	clear(): void {
		this.selectedUrls.clear();
	}

	async deleteSelected(): Promise<void> {
		if (this.selectedUrls.size === 0 || this.isDeleting) return;
		this.isDeleting = true;
		const urlsToDelete = [...this.selectedUrls];
		try {
			for (const url of urlsToDelete) {
				try {
					await deleteArticleByUrl(url);
				} catch (error) {
					console.error('Failed to delete article', url, error);
				}
			}
			articleCacheStore.removeArticlesByUrls(new Set(urlsToDelete));
			articleCacheStore.invalidateProfiles();
			this.clear();
		} finally {
			this.isDeleting = false;
		}
	}
}

export const selectedArticlesStore = new SelectedArticlesStore();
