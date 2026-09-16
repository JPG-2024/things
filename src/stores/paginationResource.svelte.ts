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
	private signature: string | null = null;
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
