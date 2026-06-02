# Notian Project Analysis

This document provides an overview of the Notian project's architecture, organization, and security model.

## Project Organization Patterns

The project follows a standard Tauri application structure, which combines a Rust backend for core logic with a web-based frontend for the user interface.

```
/
├── src/                # SvelteKit Frontend
│   ├── lib/            # Frontend logic and helpers
│   ├── routes/         # SvelteKit routes
│   └── app.html        # Main HTML shell
├── src-tauri/          # Rust Backend (Tauri)
│   ├── src/            # Rust source code
│   │   ├── main.rs     # Backend entry point
│   │   └── *.rs        # Backend modules (e.g., browser, youtube)
│   ├── capabilities/   # Tauri capabilities and permissions
│   └── tauri.conf.json # Tauri configuration
└── package.json        # Frontend dependencies and scripts
```

- **Frontend**: A SvelteKit single-page application (SPA) located in the `src` directory. It is responsible for rendering the UI and interacting with the backend.
- **Backend**: A Rust application using the Tauri framework, located in `src-tauri`. It handles system-level operations, external API calls, and heavy computation.

## Backend Structure (Rust)

The backend is a multi-module Rust application that exposes functions to the frontend via Tauri's command system.

**Core Modules:**

- `main.rs`: The entry point of the Rust application. It initializes the Tauri runtime and registers the backend commands.
- `browser.rs`: Manages browser automation tasks, likely using `chromiumoxide` to scrape web content.
- `youtube.rs`: Contains logic for fetching YouTube video transcripts using the `yt-transcript-rs` crate.
- `markdown.rs`: Handles the conversion of HTML content to Markdown.
- `inference_openrouter.rs`: Connects to the OpenRouter API for AI-powered inference tasks.

**Backend Architecture Diagram:**

```ascii
+--------------------------------+
|       SvelteKit Frontend       |
+--------------------------------+
             |
             | (Tauri API)
             |
+--------------------------------+
|          Tauri Core            |
|    (Event & Command System)    |
+--------------------------------+
             |
             | (Rust function calls)
             |
+--------------------------------------------------+
|                   Rust Backend                   |
|                                                  |
|  +-------------+  +-------------+  +-----------+ |
|  | browser.rs  |  | youtube.rs  |  | markdown.rs |
|  +-------------+  +-------------+  +-----------+ |
|                                                  |
+--------------------------------------------------+
```

## Frontend Structure (SvelteKit)

The frontend is built with SvelteKit, providing a modern and reactive user interface.

**Core Components:**

- `+page.svelte`: The main page of the application, which serves as the primary user interface.
- `lib/`: Contains reusable TypeScript modules.
  - `urlRouter.ts`: Determines how to handle a given URL, delegating to other modules.
  - `extractUrlToMarkdown.ts`: Orchestrates the process of fetching a URL's content and converting it to Markdown by calling backend commands.
  - `getYouTubeTranscript.ts`: Calls the backend to fetch a YouTube transcript.

**Frontend-Backend Interaction Diagram:**

```ascii
+------------------+      +-----------------+      +----------------------+
|  UI Component    |----->|  urlRouter.ts   |----->| extractUrlToMarkdown.ts|
| (+page.svelte)   |      +-----------------+      +----------------------+
+------------------+                                       |
                                                           | (invoke backend command)
                                                           v
                                                 +-----------------+
                                                 |  Rust Backend   |
                                                 +-----------------+
```

## Permissions and Capabilities

Tauri's security model is based on a "deny by default" approach. The `tauri.conf.json` file and the `src-tauri/capabilities/` directory define the specific permissions granted to the frontend.

- **`tauri.conf.json`**: This file configures which capabilities are enabled. It acts as a manifest for the application's security policies.
- **`src-tauri/capabilities/`**: Contains JSON files that define granular permissions. For example, `fs-custom.json` likely defines specific file system paths that the application is allowed to read from or write to.

This setup ensures that the webview (frontend) can only access the system resources that it has been explicitly granted permission for, mitigating the risk of unauthorized access.

**Capabilities Flow:**

```ascii
+--------------------+
| Frontend (WebView) |
+--------------------+
         |
         | (Wants to access a file)
         v
+--------------------+
|   Tauri Security   |
| (Checks capabilities) |
+--------------------+
         |
         | (Is permission granted in tauri.conf.json?)
         |
+--------v---------+   YES   +----------------+
| Access Denied    |<------->| Access Granted |
+------------------+         +----------------+
```
