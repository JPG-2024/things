<script lang="ts">
import { viewState } from "@/stores/viewStore.svelte";
import { primaryColor } from "@/stores/uiStore";
import { onMount } from "svelte";
import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
import { invoke } from "@tauri-apps/api/core";
import { urlRouter } from "@/lib/urlRouter/urlRouter";
import { navigate } from "@/lib/utils/url";

const CLIPBOARD_POLL_INTERVAL_MS = 5000;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

let { children } = $props();

let flashy = $state(false);
let mainElement: HTMLElement | undefined = $state();
let processingUrl = $state(false);

function extractValidUrl(value: string): string | null {
	const trimmedValue = value.trim();

	if (!trimmedValue || !HTTP_URL_REGEX.test(trimmedValue)) {
		return null;
	}

	try {
		const parsedUrl = new URL(trimmedValue);
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			return null;
		}

		return parsedUrl.toString();
	} catch {
		return null;
	}
}

async function handlePasteUrl(url: string) {
	const validUrl = extractValidUrl(url);
	if (!validUrl || processingUrl) return;

	processingUrl = true;

	try {
		viewState.lastHandledClipboardUrl = validUrl;
		navigate(`/youtube/${encodeURIComponent(validUrl)}`);
		await urlRouter(validUrl);
	} finally {
		processingUrl = false;
	}
}

$effect(() => {
	if (mainElement) {
		mainElement.style.setProperty("--primary-color", $primaryColor);
	}
});

// scroll effect
/*   $effect(() => {
    if (mainElement === undefined) return

    mainElement.scrollTop = 100

    if (viewState.loaded && mainElement) {
      setTimeout(() => {
        if (mainElement === undefined) return
        // scroll mainElement to top of page

        mainElement.scrollTop = 0
      }, 200) // Delay to allow the flashy animation to complete
    }
  }) */

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5,
		},
	},
});

onMount(() => {
	let stopFlow: undefined | (() => void);
	viewState.initFlowStatusListeners().then((stop) => (stopFlow = stop));
	viewState.initMediaBasePath();

	const pollClipboard = async () => {
		if (!viewState.clipboardPollingEnabled || processingUrl) return;

		try {
			const clipboardText = await invoke<string>("read_clipboard_text");
			const validUrl = extractValidUrl(clipboardText ?? "");

			if (!validUrl || validUrl === viewState.lastHandledClipboardUrl) {
				return;
			}

			await handlePasteUrl(validUrl);
		} catch {
			viewState.clipboardPollingEnabled = false;
		}
	};

	void pollClipboard();
	const clipboardInterval = setInterval(() => {
		void pollClipboard();
	}, CLIPBOARD_POLL_INTERVAL_MS);

	const flashyInterval = setInterval(() => {
		if (viewState.loading) return;

		flashy = true;
		setTimeout(() => {
			flashy = false;
		}, 2000);
	}, 40000);

	return () => {
		stopFlow?.();
		clearInterval(flashyInterval);
		clearInterval(clipboardInterval);
	};
});

// Global View Transitions wrapper for all client navigations
/*   onNavigate((navigation) => {
    const anyDoc: any = document
    if (!anyDoc || typeof anyDoc.startViewTransition !== 'function') return

    if (document.hidden) {
      return
    }

    return new Promise((resolve) => {
      anyDoc.startViewTransition(async () => {
        // Allow SvelteKit to proceed with navigation
        resolve()
        // Wait until the new route is fully rendered so the "new" snapshot has the elements
        await navigation.complete
      })
    })
  }) */
</script>

<QueryClientProvider client={queryClient}>
  <main
    id="layout-main"
    bind:this={mainElement}
    class="container"
    class:flashy={flashy}
    class:loaded={viewState.loaded}
  >
    {@render children()}
  </main>
</QueryClientProvider>

<style>
  :global(body) {
    margin: 0;
    font-size: 14px;
    font-family: 'CaskaydiaCove NFM Light', monospace;
  }

  @font-face {
    font-family: 'Oswald'; /* Give it any name you want */
    src: url('static/Oswald-VariableFont_wght.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
  }


  *,
  *::before,
  *::after {
    box-sizing: border-box;
    @view-transition {
      navigation: auto;
    }
  }
  

  :root {
    color: #ffffff;
    line-height: 24px;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;

 
  }

  main {
    display: flex;
    position: relative;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    box-sizing: border-box;
    margin: 0;
    background-image: linear-gradient(-45deg, var(--primary-color) 10%, rgba(0, 0, 0, 0.68) 90%);
    background-size: 400% 400%;
    background-attachment: fixed;
    background-color: #000000;
    overflow-y: auto;
    height: 100vh;
    padding: 1.5rem;
    scroll-behavior: smooth;
    scroll-padding-top: 2rem;
  }

  /* Overlay que barre el viewport cuando .flashy está activo */
  main.loaded::after {
    position: fixed;
    transform: translateY(-120%);
    z-index: 9999;
    /* opcional para efecto “sheen”: */
    mix-blend-mode: screen;
    animation: sweep-overlay 1s ease-in-out forwards; /* 5s = tu ventana de flashy */
    inset: 0;
    background: linear-gradient(
      0deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0) 20%,
      rgba(255,255,255, 0.275) 50%,
      rgba(255, 255, 255, 0) 70%,
      rgba(255, 255, 255, 0) 100%
        );
    pointer-events: none; /* que no bloquee clicks */
    content: '';
  }

  .loading {
    animation: gradient 2s ease infinite;
  }

  .flashy {
    animation: flashy 2s ease-in-out infinite;
  }

  @keyframes sweep-overlay {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(100%);
    }
  }

  @keyframes gradient {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 10% 10%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  @keyframes flashy {
    0% {
      background-position: 0% 0%;
    }
    50% {
      background-position: 8% 5%;
    }
    100% {
      background-position: 0% 0%;
    }
  }

/*   main::before {
    position: fixed;
    inset: 0;
    z-index: 0;
    opacity: 0.4;
    mix-blend-mode: soft-light;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='540' height='540' viewBox='0 0 240 240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.3' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 240px 240px;
    pointer-events: none;
    content: '';
  } */

  main > * {
    position: relative;
    z-index: 1;
  }
</style>
