# Plan: Add PROFILE_FROM_VIDEO Task to YouTube Crawl Tasks

## Overview

Add a new task `PROFILE_FROM_VIDEO` to `youtubeCrawlTasks.ts` that runs after `VIDEO_INFO` completes, extracts the `profileId` from the video info, and calls `youtubeProfileRunner` as a separate workflow run.

## Files to Modify

### 1. `src/runners/youtube/tasks/youtubeTasks.shared.ts`

**Line 49** - Add to `TaskNames` enum:

```typescript
((EXTRACT_PROFILE = 'extract-profile'), (PROFILE_FROM_VIDEO = 'profile-from-video'));
```

**Line 68** - Add to `YouTubeTaskState` type (after EXTRACT_PROFILE line):

```typescript
[TaskNames.EXTRACT_PROFILE]: { name: string; profilePicture: string | null };
[TaskNames.PROFILE_FROM_VIDEO]: { profileId: string; runId: string };
```

**Line 73-78** - Add `videosAmount` to `YouTubeTaskFactoryContext`:

```typescript
export type YouTubeTaskFactoryContext = {
	url: string;
	language: TTSLanguage;
	freshRun: boolean;
	profileId?: string;
	videosAmount?: number;
};
```

### 2. `src/runners/youtube/tasks/youtubeCrawlTasks.ts`

**Line 11-15** - Update `CrawlTaskIds` type:

```typescript
type CrawlTaskIds =
	| TaskNames.VIDEO_INFO
	| TaskNames.CHAPTERS
	| TaskNames.TIMED_CAPTIONS
	| TaskNames.CONTENT
	| TaskNames.PROFILE_FROM_VIDEO;
```

**Line 1** - Add import:

```typescript
import { youtubeProfileRunner } from '../profileVideosRunner';
```

**Lines 44-46** - Remove broken code from VIDEO_INFO task:

```typescript
// DELETE THESE LINES:
if (!options.profileId) {
	youtubeProfileRunner(url, 1, profileId);
}
```

**After line 52** (after VIDEO_INFO task, before CHAPTERS task) - Add new task:

```typescript
[TaskNames.PROFILE_FROM_VIDEO]: () => ({
	id: TaskNames.PROFILE_FROM_VIDEO,
	name: 'Extract profile from video',
	dependencies: [TaskNames.VIDEO_INFO],
	type: 'script',
	run: async ({ state }) => {
		const videoInfo = getRequiredTaskState(state, TaskNames.VIDEO_INFO);
		const profileId = videoInfo.profileId?.slice(1);

		if (!profileId) {
			throw new Error('No profileId found in video info');
		}

		const profileUrl = `https://www.youtube.com/${profileId}/videos`;
		await youtubeProfileRunner(profileUrl, 1, profileId);

		return { profileId, runId: profileUrl };
	}
}),
```

## Summary

| File                     | Change                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `youtubeTasks.shared.ts` | Add `PROFILE_FROM_VIDEO` enum value, state type, and `videosAmount` to context                           |
| `youtubeCrawlTasks.ts`   | Add new task, update `CrawlTaskIds`, import `youtubeProfileRunner`, remove broken code from `VIDEO_INFO` |
