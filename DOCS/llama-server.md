# Local llama-server (llama.cpp)

Things can run its AI features fully offline by launching two local
[`llama.cpp`](https://github.com/ggml-org/llama.cpp) servers and managing them as
child processes:

- **inference** — an OpenAI-compatible chat/completions server (default port `8080`).
- **embeddings** — an OpenAI-compatible embeddings server (default port `8083`).

On startup and on demand the app health-checks both, starts whichever is down,
and shows their state in the UI. Only the processes the app started are stopped
when the app exits; a server you launched yourself is left running.

This guide is about **setting it up**. The implementation details are compressed
into the [Reference](#reference) at the end.

---

## What it does

- Resolves a `llama.cpp` executable (the unified `llama` CLI) and two `.gguf`
  model files.
- Spawns `llama serve …` for each model and streams the output to a log file.
- Probes `GET /health` and `GET /v1/models` to decide if a server is online.
- Tracks the child processes and kills only those on app exit.

## Requirements

### Hardware

The app starts every model with full GPU offload (`--n-gpu-layers 99`) and a
32k context window with q8_0 KV cache. In practice:

- A **GPU** with enough VRAM for the model plus its KV cache is expected.
  A CPU-only `llama.cpp` build works but will be slow and may run out of memory
  with a 32k context.
- Enough **system RAM** for the model when it does not fully fit in VRAM.

The exact numbers depend on the model. See the
[gpt-oss memory table](https://github.com/ggml-org/llama.cpp/discussions) or the
model card on Hugging Face for reference figures.

### Software

- A `llama.cpp` executable that supports the `serve` subcommand (the unified
  `llama` CLI, v0.4+). See the note in
  [Make the binary discoverable](#2-make-the-binary-discoverable).
- One chat `.gguf` model and one embedding `.gguf` model.
- Write access to the app data dir (for log files).

---

## Installation (Linux)

> Other platforms are similar: install the `llama.cpp` CLI, then point the app at
> it. Only Linux paths are shown below.

### 1. Install the llama.cpp CLI

Pick one:

```bash
# Homebrew (Linux and macOS)
brew install llama.cpp

# Nix
nix profile install nixpkgs#llama-cpp

# conda-forge
conda install -c conda-forge llama.cpp
```

Or download the pre-built binaries for your GPU backend from the
[llama.cpp releases page](https://github.com/ggml-org/llama.cpp/releases) and
extract them somewhere on your `PATH`. The project also publishes install
instructions at <https://llama.app>.

Verify the CLI is available and supports `serve`:

```bash
llama --help        # should list a "serve" command
llama version
```

The example below assumes the binary is named `llama`
(typically `~/.local/bin/llama`).

### 2. Make the binary discoverable

The app looks for the executable in this order:

1. The `LLAMA_BIN` environment variable, if set (exact path, used as-is).
2. A binary named `llama` on `PATH`.
3. A binary named `llama-server` on `PATH`.

> **Important:** the app always runs `<binary> serve …`. This matches the unified
> `llama` CLI (`llama serve`). A standalone `llama-server` binary is launched
> **without** a subcommand, so if only `llama-server` is on your `PATH` the app's
> `serve` argument will be rejected and the server will not start. In that case,
> point `LLAMA_BIN` at the unified `llama` binary.

Set `LLAMA_BIN` if the binary is not named `llama` or is not on `PATH`:

```bash
export LLAMA_BIN="$HOME/.local/bin/llama"
```

Put this in your shell profile (e.g. `~/.bashrc` / `~/.zshrc`) or launch the app
with it set, so the child process inherits it.

### 3. Get GGUF models

Download GGUF files from Hugging Face (or any hosting site) **into a single
folder**. The app reads `.gguf` files **directly inside that folder** — it does
not scan subdirectories.

You need two kinds of model:

- **A chat/instruct model** for inference, e.g. `Qwen`, `Llama`, `Gemma`,
  `gpt-oss`, `LFM`.
- **An embedding model** for the embeddings server. Names containing `embed`,
  `bge`, `e5`, `nomic`, or `gte` are auto-detected as embedding models (e.g.
  `bge-m3`). The **Show all models** toggle in Settings overrides the guess.

```bash
mkdir -p ~/Downloads/models
# place your downloaded files here, e.g.
#   ~/Downloads/models/Qwen3.5-4B-Q4_K_M.gguf
#   ~/Downloads/models/bge-m3.gguf
```

### 4. Set the models folder

The app resolves the models folder in this order:

1. The **Models directory** field in Settings.
2. The `LLAMA_MODELS_DIR` environment variable.
3. `~/Downloads/models` (default).

```bash
export LLAMA_MODELS_DIR="$HOME/Downloads/models"
```

---

## Configure in the app

Open **Settings → Local models (llama.cpp)**:

| Field            | What to set                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| Models directory | Folder holding your `.gguf` files (use **Browse**).                     |
| Inference model  | The chat model dropdown (embedding-named files are hidden by default).  |
| Inference port   | Chat server port (default `8080`, must be ≥ `1024`).                    |
| Embeddings model | The embedding model dropdown.                                           |
| Embeddings port  | Embeddings server port (default `8083`, must be ≥ `1024`).              |
| Show all models  | Show every `.gguf`, so you can pick across categories.                  |
| Restart servers  | Force-kill the app's servers and relaunch them with the current config. |

Below the button the app lists each server with its state:
`online · :8080`, `starting… · :8080`, or the error message if it failed.
The main toolbar also shows inference/embeddings up/offline indicators.

Changing the models directory refreshes the dropdowns immediately. The app also
reconciles your saved selections on open: a model that no longer exists is
replaced by the matching `LLAMA_*_MODEL` default, or cleared so you must pick
again.

---

## What the app runs

### Command shape

For each server the app builds:

```
<llama binary> serve \
  -m <absolute path to .gguf> \
  <per-server flags> \
  --host <host> --port <port> \
  <extra args from LLAMA_*_EXTRA_ARGS>
```

The child inherits the parent environment (so GPU/toolkit variables such as
`HSA_OVERRIDE_GFX_VERSION`, `CUDA_*` keep working), except variables that look
like secrets: names starting with `VITE_`, or ending in `_API_KEY`, `_TOKEN`,
or `_SECRET`. This keeps keys from a `.env` file out of the server process.

### Launch flags

| Flag                    | Inference                                 | Embeddings                   |
| ----------------------- | ----------------------------------------- | ---------------------------- |
| Model                   | `-m <model>`                              | `-m <model>`                 |
| Context size            | `-c 32768`                                | `--ctx-size 8192`            |
| Batch size              | `-b 512`                                  | —                            |
| GPU offload             | `--n-gpu-layers 99`                       | `--n-gpu-layers 99`          |
| Embeddings mode         | —                                         | `--embedding --pooling mean` |
| Prompt cache (RAM, MiB) | `--cache-ram 4096`                        | —                            |
| Context checkpoints     | `--ctx-checkpoints 0`                     | —                            |
| KV cache quantization   | `--cache-type-k q8_0 --cache-type-v q8_0` | —                            |
| Host / port             | `--host --port`                           | `--host --port`              |

### Extra arguments

Anything in `LLAMA_INFERENCE_EXTRA_ARGS` / `LLAMA_EMBEDDINGS_EXTRA_ARGS` is
appended **after** the built-in flags, so it can add or override options. Values
are split on whitespace.

Example — enable tool calling (per `llama-completions.md`):

```bash
export LLAMA_INFERENCE_EXTRA_ARGS="--jinja"
```

Other useful flags: `--flash-attn` / `-fa`, `--mlock`, `--no-mmap`,
`--threads N`, `-ot/--ncmoe` for MoE offload, and custom sampling flags
(`--temp`, `--top-p`, …).

---

## Environment variables

| Variable                      | Default              | Purpose                                                    |
| ----------------------------- | -------------------- | ---------------------------------------------------------- |
| `LLAMA_BIN`                   | unset                | Exact path to the `llama` binary (bypasses `PATH` lookup). |
| `LLAMA_MODELS_DIR`            | `~/Downloads/models` | Folder containing the `.gguf` files.                       |
| `LLAMA_INFERENCE_HOST`        | `127.0.0.1`          | Bind host for the chat server.                             |
| `LLAMA_INFERENCE_PORT`        | `8080`               | Default chat server port (seeds the Settings field).       |
| `LLAMA_INFERENCE_MODEL`       | unset                | Default chat model file name.                              |
| `LLAMA_INFERENCE_EXTRA_ARGS`  | unset                | Extra flags appended to the chat server command.           |
| `LLAMA_EMBEDDINGS_HOST`       | `0.0.0.0`            | Bind host for the embeddings server.                       |
| `LLAMA_EMBEDDINGS_PORT`       | `8083`               | Default embeddings server port (seeds the Settings field). |
| `LLAMA_EMBEDDINGS_MODEL`      | unset                | Default embedding model file name.                         |
| `LLAMA_EMBEDDINGS_EXTRA_ARGS` | unset                | Extra flags appended to the embeddings server command.     |

Frontend/vite variables such as `VITE_LLAMA_URL` and `VITE_EMBEDDINGS_URL`
(in `viewStore.svelte.ts`) only set the default URLs the UI displays; the ports
above and the Settings fields ultimately decide what the app launches.

---

## Health and lifecycle

- **Polling:** the UI polls both servers every 15 seconds
  (`startLlamaHealthPolling`), probing `/health` and then `/v1/models`, and
  mirrors the result into the toolbar indicators.
- **Already running is respected:** before spawning, the app checks the port. If
  it is occupied or the service answers, the server is treated as running and no
  new process is started — so the app never double-launches a server you started
  yourself.
- **Only owned processes are killed:** a server the app spawned is tracked and
  killed on exit (`stop_llama_servers`). Externally started servers are untracked
  and left alone.
- **Restart:** `Restart servers` (and `ensureLlamaServers(true)`) kills the app's
  own servers and waits briefly for the ports to free before relaunching.
- **Logs:** each server's stdout/stderr is redirected to a per-server log file in
  the app data dir. On Linux this is typically:

  ```
  ~/.local/share/com.juangargiulo.things/llama-server-inference.log
  ~/.local/share/com.juangargiulo.things/llama-server-embeddings.log
  ```

---

## Troubleshooting

Errors appear in the Settings server list and in the toolbar tooltips. Below is
what each one means and how to fix it.

| Message                                              | Cause / fix                                                                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `failed to start llama-server (…)`                   | The binary could not be spawned. It is missing, not on `PATH`, or not the unified `serve`-capable `llama` CLI. Set `LLAMA_BIN`.              |
| Rejected `serve` argument / server exits immediately | You have a standalone `llama-server` binary but the app always passes `serve`. Point `LLAMA_BIN` at the unified `llama` binary.              |
| `no inference model selected`                        | No model chosen in Settings and no `LLAMA_INFERENCE_MODEL` / `LLAMA_EMBEDDINGS_MODEL` default. Pick a model.                                 |
| `model not found: <name>`                            | The selected file is not in the models directory, or the selection is stale. Re-pick, or check `LLAMA_MODELS_DIR`.                           |
| `model must be a .gguf file: <name>`                 | The file exists but is not `.gguf`.                                                                                                          |
| `invalid model name: <name>`                         | The selection contained a path (e.g. `dir/model.gguf`). Only a bare file name is allowed; files must sit directly in the folder.             |
| `models directory invalid: <dir> (…)`                | The models folder does not exist or cannot be read. Create it or fix the path.                                                               |
| `port <n> is privileged (minimum allowed is 1024)`   | The chosen port is below `1024`. Use `1024`–`65535`.                                                                                         |
| Status stuck on `starting…`                          | The process launched but never became healthy. Open the matching log file (see above) for the real error — often OOM or an unsupported flag. |
| Chat works but tool calls don't                      | Start the server with `--jinja` (and a tool-aware template): `export LLAMA_INFERENCE_EXTRA_ARGS="--jinja"`.                                  |
| "online" but wrong model                             | Another process already owns the port; the app treats a busy port as "already running". Free the port or change the configured one.          |

---

## Reference

### Tauri commands

Implemented in `src-tauri/src/llama_server.rs`, registered in
`src-tauri/src/lib.rs`, wrapped in `src/lib/utils/llamaHealth.ts`.

| Tauri command          | TS wrapper               | Purpose                                            |
| ---------------------- | ------------------------ | -------------------------------------------------- |
| `ensure_llama_servers` | `ensureLlamaServers()`   | Health-check both servers and start the down ones. |
| `list_llama_models`    | `listLlamaModels()`      | List `.gguf` files directly inside the models dir. |
| `llama_defaults`       | `reconcileLlamaModels()` | Env-backed defaults to seed Settings on first run. |

Entry points: `src/routes/+layout.svelte` calls `ensureLlamaServers()` on mount;
`src/routes/+page.svelte` starts health polling; `SettingsModal.svelte` exposes
the fields, status list, and **Restart servers**.

### Config types

`ensure_llama_servers` receives (camelCase from the frontend):

```rust
struct LlamaServersConfig {
    models_dir: String,
    inference:  LlamaServerTarget { model: String, port: u16 },
    embeddings: LlamaServerTarget { model: String, port: u16 },
    restart: bool, // default false
}
```

and returns one `LlamaServerStatus` per server:

```ts
interface LlamaServerStatus {
	name: 'inference' | 'embeddings';
	port: number;
	running: boolean;
	healthy: boolean;
	pid: number | null;
	error: string | null;
}
```

### Known gaps

- Model listing is **non-recursive**: only `.gguf` files directly in the models
  directory are seen.
- Model selections must be **bare file names**; paths and traversal are rejected
  for safety.
- The app always passes `serve`, so a plain `llama-server` binary is not usable
  without going through `LLAMA_BIN` pointing at the unified `llama` CLI.
