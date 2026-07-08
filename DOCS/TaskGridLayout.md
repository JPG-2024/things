# Task Grid Layout

## Overview

TasksRender uses a **CSS Grid** layout with flexible wrapping for completed task components, and a **flex container** for loading/pending/failed task pills. This separation ensures clean visual hierarchy and predictable spacing.

---

## Layout Architecture

### Two-Zone Layout

| Zone          | Container            | Contents                                                                                   |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| Loading Pills | Flex (wrapping)      | Tasks that are `pending`, `running`, `failed`, `blocked`, or done tasks without a renderer |
| Tasks Grid    | CSS Grid (auto-fill) | Completed tasks (`done`) with a registered renderer component                              |

### Responsive Grid

The grid uses `auto-fill` with `minmax(300px, 1fr)`:

- **Wide screens (>900px):** 3 columns
- **Medium screens (600-900px):** 2 columns
- **Narrow screens (<600px):** 1 column

Tasks wrap automatically when there's not enough horizontal space.

---

## `gridSpan` Property

Tasks can control their width by setting the `gridSpan` field (type `1 | 2 | 3`).

| Value         | Behavior                     | Use Case                                         |
| ------------- | ---------------------------- | ------------------------------------------------ |
| `1` (default) | Occupies 1 grid column       | Small widgets: thumbnails, keywords, metadata    |
| `2`           | Spans 2 columns              | Medium content: video info, image galleries      |
| `3`           | Spans 3 columns (full width) | Large content: markdown text, players, summaries |

### Type Definition

```ts
interface TaskBase<TMap, TId> {
	id: TId;
	// ... other fields
	gridSpan?: 1 | 2 | 3;
	// ...
}
```

---

## Usage Examples

### Narrow Task (1 column)

```ts
{
  id: WebTaskNames.THUMBNAIL,
  name: 'Thumbnail',
  dependencies: [WebTaskNames.INIT_YOUTUBE_VIDEO],
  type: 'script',
  component: 'image',
  gridSpan: 1,  // narrow
  run: async () => { /* ... */ }
}
```

### Medium Task (2 columns)

```ts
{
  id: WebTaskNames.KEYWORDS,
  name: 'Keywords',
  dependencies: [WebTaskNames.CONTENT],
  type: 'script',
  component: 'keywords',
  gridSpan: 2,  // medium
  run: async () => { /* ... */ }
}
```

### Full-Width Task (3 columns)

```ts
{
  id: WebTaskNames.CONTENT,
  name: 'Content Summary',
  dependencies: [WebTaskNames.INIT_YOUTUBE_VIDEO],
  type: 'ia',
  component: 'taskBase',
  gridSpan: 3,  // full width
  systemMessage: 'Summarize the content.',
  userMessage: 'Provide a detailed summary.',
  completionOptions: { model: 'llama-server', stream: true }
}
```

---

## Component Registry

Renderers are registered in `taskRenderRegistry.ts`:

```ts
export const taskRenderRegistry: Record<string, Component> = {
	ask: AskComponent,
	taskBase: MarkdownTaskComponent,
	image: Image,
	player: Player,
	videoInfo: VideoInfo,
	keywords: Keywords,
	listItems: ListItems
};
```

The `component` field on a task must match one of these keys. If no match is found, the task only shows as a loading pill.

---

## Rendering Logic

### Loading Pills Zone

A task appears as a loading pill when:

- Status is `running` or `pending`
- Status is `failed` or `blocked`
- Status is `done` but `viewState.showAllTasks` is `true`
- Task has no registered renderer component

### Tasks Grid Zone

A task appears in the grid when:

- Status is `done`
- Task has a registered renderer component (`component` field matches registry key)

---

## CSS Structure

```css
.loading-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-bottom: 1rem;
}

.tasks-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	width: 100%;
}

.task-wrapper.span-2 {
	grid-column: span 2;
}

.task-wrapper.span-3 {
	grid-column: span 3;
}
```

---

## Design Rationale

### Why Separate Loading Pills from Grid?

Loading pills have `width: max-content` (very narrow), while completed tasks span multiple columns. Mixing them in the same grid creates:

- Awkward gaps and empty spans
- Unpredictable layout shifts
- Visual noise

By separating them:

- Loading pills flow naturally as small indicators
- Grid only contains actual content components
- Clean visual separation between "in progress" and "done"

### Why `auto-fill` Instead of Fixed Columns?

`auto-fill` adapts to screen width without media queries:

- Simpler CSS, fewer breakpoints
- Works across desktop and mobile
- Grid items wrap automatically when space runs out

---

## Migration Notes

Tasks without `gridSpan` default to `1` (single column). Existing tasks continue to work without changes. Add `gridSpan` to control width as needed.
