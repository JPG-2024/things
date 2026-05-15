<script lang="ts">
	import Card from "@/components/Card.svelte";
	import Icon from "@/components/Icon.svelte";
	import { urlRouter } from "@/lib/urlRouter/urlRouter";
	import { navigate, toVTName } from "@/lib/utils/url";
	import {
		deleteProfileById,
		getArticleWithTasksByUrl,
		getArticlesByProfile,
		type ArticleProfile,
		type ArticleWithTasks,
	} from "@/stores/tasksStore";
	import { ttsState } from "@/stores/ttsStore.svelte";
	import { createHotkey } from "@tanstack/svelte-hotkeys";
	import {
		createMutation,
		createQuery,
		useQueryClient,
	} from "@tanstack/svelte-query";

interface Props {
	profile: ArticleProfile;
	showTitle?: boolean;
	onDeleted?: (profileId: string) => void | Promise<void>;
}

let { profile, showTitle = false, onDeleted }: Props = $props();

let hoveredArticleUrl = $state<string | null>(null);

$effect(() => {
	const cleanup = createHotkey(
		"S",
		async () => {
			if (!hoveredArticleUrl) return;
			const article = await getArticleWithTasksByUrl(hoveredArticleUrl);
			const titleSummaryTask = article?.persistedTasks?.find(
				(t) => t.id === "title-summary",
			);
			if (!titleSummaryTask?.data) {
				throw new Error("No title-summary data found for this article");
			}

			ttsState.setTextContents([titleSummaryTask.data as string]);
			await ttsState.generateTTS();
		},
		() => ({
			enabled: hoveredArticleUrl !== null,
			ignoreInputs: true,
		}),
	);
	return cleanup;
});

const queryClient = useQueryClient();

const query = createQuery({
	queryKey: ["articles", profile.id],
	queryFn: () =>
		getArticlesByProfile(profile.id, {
			limit: 20,
			createdAtFrom: Date.now() - 1000 * 60 * 60 * 24 * 30,
		}),
	refetchOnWindowFocus: "always",
});


function handleRefresh() {
	$query.refetch();
}

const mutation = createMutation({
	mutationFn: async (profileId: string) => {
		const result = await deleteProfileById(profileId);
		if (!result.success) {
			throw new Error("Failed to delete profile");
		}
		return result;
	},
	onSuccess: async (_, profileId) => {
		queryClient.invalidateQueries({ queryKey: ["articles", profileId] });
		await onDeleted?.(profileId);
	},
});

function handleNavigateToArticle(article: ArticleWithTasks) {
	if (!article.url) return;
	navigate(`/youtube/${encodeURIComponent(article.url)}`);
	urlRouter(article.url);
}

function handleDeleteProfile() {
	if ($mutation.status === "pending") return;
	$mutation.mutate(profile.id);
}
</script>

<div class="category-widget">
	<Card>
		{#if showTitle}
			<div class="title-row">
				<h2 class="category-title">{profile.name}</h2>
				<div class="actions">
					<button
						type="button"
						class="refresh-btn"
						onclick={handleRefresh}
						disabled={$query.isFetching}
						aria-label={`Refresh ${profile.name}`}
						title="Refresh"
					>
						<Icon name="RefreshCw" />
					</button>
					<button
						type="button"
						class="delete-btn"
						onclick={handleDeleteProfile}
						disabled={$mutation.status === "pending"}
						aria-label={`Delete ${profile.name}`}
						title="Delete profile"
					>
						<Icon name="Trash" />
					</button>
				</div>
			</div>
		{/if}
		{#if $query.data?.length}
			<div class="img-flex">
				{#if profile.profilePicture}
					<img
						src={profile.profilePicture}
						alt={profile.name}
						class="profile-avatar"
						style={`view-transition-name: vt-profile-${toVTName(profile.id)}`}
					/>
				{/if}
				{#each $query.data as article (article.url)}
					<button
						type="button"
						class="img-button"
						onclick={() => handleNavigateToArticle(article)}
						onmouseenter={() => (hoveredArticleUrl = article.url ?? null)}
						onmouseleave={() => (hoveredArticleUrl = null)}
						aria-label="View article"
					>
						<img
							src={article.thumbnail}
							alt="Article"
							class="mini-img"
							style={`view-transition-name: vt-main-image-${toVTName(article.url ?? "")}`}
						/>
					</button>
				{/each}
			</div>
		{:else if $query.isLoading}
			<span>Loading articles...</span>
		{/if}
	</Card>
</div>

<style>
	.category-widget {
		display: flex;
		flex-direction: column;
		width: max-content;
		align-items: center;
		box-sizing: border-box;
	}

	.delete-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.3rem;
		background: rgba(255, 255, 255, 0.08);
	}

	.title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0rem;
		width: 100%;
		padding-inline: 10px;
		font-size: 0.5rem;
		color: rgba(255, 255, 255, 0.068);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.refresh-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border-radius: 999px;
		padding: 0.3rem;
		background: rgba(255, 255, 255, 0.08);
	}

	.refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.img-flex {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		width: 100%;
		padding: 5px;
	}

	.img-button {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		border-radius: 0.5rem;
		overflow: hidden;
		transition: transform 0.2s;
	}

	.img-button:hover {
		transform: scale(1.2);
		z-index: 20;
	}

	.mini-img {
		width: 80px;
		height: 55px;
		object-fit: cover;
		display: block;
	}

	.profile-avatar {
		width: 50px;
		height: 50px;
		border-radius: 100%;
		object-fit: cover;
		flex-shrink: 0;
		margin-right: 0.5rem;
	}
</style>