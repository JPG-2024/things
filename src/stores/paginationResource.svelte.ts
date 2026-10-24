export type PageResult<TItem> = {
	items: TItem[];
	total?: number;
};

export type FetchPage<TItem, TParams> = (
	params: TParams,
	offset: number,
	limit: number
) => Promise<PageResult<TItem>>;

export class PaginationResource<TItem, TParams> {
	items = $state<TItem[]>([]);
	loading = $state(false);
	offset = $state(0);
	hasMore = $state(true);
	total = $state(0);

	private stale = true;
	// $state so `visibleItems` has no untracked reads: signature changes must
	// invalidate readers of the gate, not rely on accompanying items writes.
	private signature = $state<string | null>(null);
	private pendingSignature = $state<string | null>(null);
	private fetchId = 0;
	private params: TParams | undefined = undefined;

	constructor(
		private readonly pageSize: number,
		private readonly buildSignature: (params: TParams) => string,
		private readonly fetchPage: FetchPage<TItem, TParams>
	) {}

	get lastParams(): TParams | undefined {
		return this.params;
	}

	/**
	 * Items belonging to the currently displayed fetch. While a fresh fetch
	 * with a new signature is in flight this yields `[]`, so a route switch
	 * renders the loading state instead of the previous route's stale items.
	 * Same-signature fetches (including forced refreshes) keep serving the
	 * cached items until the new page resolves.
	 */
	get visibleItems(): TItem[] {
		return this.pendingSignature === this.signature ? this.items : [];
	}

	async fetch(params: TParams, options?: { force?: boolean; loadMore?: boolean }): Promise<void> {
		if (options?.loadMore) {
			await this.paginate();
			return;
		}

		const signature = this.buildSignature(params);
		if (!options?.force && !this.stale && signature === this.signature) {
			return;
		}

		const fetchId = ++this.fetchId;
		this.loading = true;
		// Announce the pending signature before awaiting so readers gate their
		// rendering on it for the whole in-flight window.
		this.pendingSignature = signature;
		try {
			const result = await this.fetchPage(params, 0, this.pageSize);
			if (fetchId !== this.fetchId) {
				return;
			}

			this.params = params;
			this.items = result.items;
			this.applyPage(result.items.length, result);
			this.signature = signature;
			this.stale = false;
		} catch (error) {
			// Fall back to the last-known-good list instead of leaving readers
			// gated on a signature that will never resolve; rethrow so callers
			// keep their existing error handling.
			if (fetchId === this.fetchId) {
				this.pendingSignature = this.signature;
			}
			throw error;
		} finally {
			if (fetchId === this.fetchId) {
				this.loading = false;
			}
		}
	}

	async loadMore(): Promise<void> {
		if (!this.hasMore || this.loading) {
			return;
		}

		await this.paginate();
	}

	invalidate(): void {
		this.stale = true;
	}

	/**
	 * Re-queries the window already on screen (the first `items.length` rows)
	 * so readers pick up rows written after the list was fetched, without
	 * collapsing a scrolled list back to page one the way `fetch({ force })`
	 * does. No-op until something is loaded: an empty list still fetches on
	 * demand through `fetch()`, which stays stale until then.
	 */
	async refreshLoaded(): Promise<void> {
		if (this.params === undefined || this.items.length === 0) {
			return;
		}

		const windowSize = this.items.length;
		// The list is not claimed (no `fetchId` bump): a refresh is a background
		// repaint and must never invalidate an in-flight `loadMore` — its
		// `finally` would then leave `loading` stuck true and freeze the
		// sentinel. It only gives up its own result when such a fetch wins.
		const startedFetchId = this.fetchId;
		const result = await this.fetchPage(this.params, 0, windowSize);
		if (startedFetchId !== this.fetchId) {
			return;
		}

		// A window query that comes back empty while rows are on screen means
		// the fetch failed (the article queries swallow their errors and answer
		// `{ articles: [], total: 0 }`), not that the list emptied: local
		// deletes are already applied by `remove`. Keep the rows, keep `stale`
		// as it is, and let the next explicit fetch retry.
		if (result.items.length === 0) {
			return;
		}

		this.items = result.items;
		this.applyPage(result.items.length, result);
		this.stale = false;
	}

	remove(predicate: (item: TItem) => boolean): number {
		const before = this.items.length;
		this.items = this.items.filter((item) => !predicate(item));
		return before - this.items.length;
	}

	replace(update: (items: TItem[]) => TItem[]): void {
		this.items = update(this.items);
	}

	private async paginate(): Promise<void> {
		if (this.params === undefined) {
			return;
		}

		const fetchId = ++this.fetchId;
		this.loading = true;
		try {
			const offset = this.offset;
			const result = await this.fetchPage(this.params, offset, this.pageSize);
			if (fetchId !== this.fetchId) {
				return;
			}

			this.items = [...this.items, ...result.items];
			this.applyPage(offset + result.items.length, result);
			this.stale = false;
		} finally {
			if (fetchId === this.fetchId) {
				this.loading = false;
			}
		}
	}

	private applyPage(nextOffset: number, result: PageResult<TItem>): void {
		this.offset = nextOffset;
		if (typeof result.total === 'number') {
			this.total = result.total;
			this.hasMore = nextOffset < result.total;
		} else {
			this.hasMore = result.items.length >= this.pageSize;
		}
	}
}
