# Download Panel: Folder Input & Playlist Toggle

## Context

The `POST /tracks/download` endpoint accepts an optional `folder_name` field. We need UI controls in the DownloadPanel to let the user set a download folder and toggle whether URL query params are kept.

## Requirements

1. Add `downloadFolder` (string) and `downloadPlaylist` (boolean) state to `musicState`
2. Add an input in DownloadPanel for folder name, bound to `musicState.downloadFolder`
3. Add a ToggleIcon in DownloadPanel for `musicState.downloadPlaylist`
4. If folder is not empty, send `folder_name` in the request body
5. If `downloadPlaylist` is false, strip query params from URLs (`?` onward) — everywhere (display, SSE matching, request)

## Changes

### 1. `src/stores/musicStore.svelte.ts`

- Add two new `$state` fields to `MusicState`:
  - `downloadFolder = $state('')`
  - `downloadPlaylist = $state(true)`
- In `downloadTracks(urls)`, at the top, process URLs:
  - If `!this.downloadPlaylist`, map each URL to `url.split('?')[0]`
- Use processed URLs for everything (downloads list entries, `submittedUrls`, SSE matching, fetch body)
- Build fetch body: always send `urls`; if `this.downloadFolder` is non-empty, also send `folder_name: this.downloadFolder`

### 2. `src/components/DownloadPanel.svelte`

- Import `Input` from `@/components/inputs/Input.component.svelte` and `ToggleIcon`
- Add a controls row between the panel header and the downloads list containing:
  - `<Input>` bound to `musicState.downloadFolder` with placeholder "folder name"
  - `<ToggleIcon>` bound to `musicState.downloadPlaylist` with tooltip "keep URL params"
- Add minimal styles for the controls row

## Verification

- `bun run check` on modified files
- `bun run lint`
- Manual: open downloads panel, type a folder name, toggle the playlist icon, paste a URL with query params and verify it's stripped when toggle is off
