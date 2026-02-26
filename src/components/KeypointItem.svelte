<script lang="ts">
import { invoke } from "@tauri-apps/api/core"
import MarkdownRenderer from "@/components/MarkdownRenderer.svelte"
import type {
	LlamaChatCompletionsRequest,
	LlamaChatCompletionsResponse,
} from "@/lib/utils/llama-completions"
import { chatCompletions } from "@/lib/utils/llama-completions"
import { viewState } from "@/stores/viewStore.svelte"
import { synthesizeSpeech } from "$lib/utils/tts"

const DEFAULT_COMPLETION_PARAMETERS: LlamaChatCompletionsRequest = {
	model: "ggml-alpaca-7b-q4.bin",
	temperature: 0.3,
	max_tokens: 500,
	messages: [
		{
			role: "system",
			content:
				"Eres un asistente encargado de resolver dudas. sé conciso y claro en tus respuestas.",
		},
	],
}

let { content, completionParameters = DEFAULT_COMPLETION_PARAMETERS } = $props()
let additionalInfo = $state<string | null>(null)
let posibleYoutubeQuery = $state<string | null>(null)

async function fetchAdditionalInfo(keypoint: string) {
	/*     posibleYoutubeQuery = await generateResponse({
      prompt: `context: "${viewState.content}" \n\n keypoint: "${keypoint}" \n\n generate a youtube search query that would help to find a video related to this keypoint.`,
      systemPrompt:
        'You are a youtube query generator. Answer only with the query, no additional text.',
      temperature: 0.5,
    })

    console.log('Generated YouTube Query:', posibleYoutubeQuery) */

	const prompt = `context: "${viewState.content}" \n\n profundiza en un resumen de un parrafo breve sobre: "${keypoint}".`

	const completionRequest: LlamaChatCompletionsRequest = {
		...completionParameters,
		model: "ggml-alpaca-7b-q4.bin",
		messages: [
			{
				role: "system",
				content:
					"Eres un asistente encargado de resolver dudas. sé conciso y claro en tus respuestas.",
			},
			{ role: "user", content: `CONTEXT: ${content} \n\n PROMPT: ${prompt} ` },
		],
	}

	const response = await chatCompletions(completionRequest, {
		onToken: (token) => {
			additionalInfo = additionalInfo ? additionalInfo + token : token
		},
	})

	const spech = await synthesizeSpeech(
		additionalInfo!,
		viewState.language,
		"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/voice_styles/F1.json",
		{
			speed: 1.4,
			onnx_dir:
				"/run/media/jhon/2ae745c3-9664-4fcc-a90a-586e6d5487a4/proyects/supertonic/assets/onnx/",
			total_step: 5,
		},
	)

	await invoke("play_tts_file", { filePath: spech.file_path })
}
</script>

<li>
  <button type="button" class="keypoint-item" onclick={() => fetchAdditionalInfo(content)}>
    <span style="color: {additionalInfo ? 'var(--primary-color)' : 'inherit'}">{content}</span>
    {#if posibleYoutubeQuery}
      <div
        class="youtube-query"
        style="font-size: 0.8em; margin-top: 0.5rem; color: var(--accent-color);"
      >
        Suggested YouTube Query: "{posibleYoutubeQuery}"
      </div>
    {/if}
    {#if additionalInfo}
      <div class="additional-info">
        <MarkdownRenderer content={additionalInfo} fontSize={0.8} />
      </div>
    {/if}
  </button>
</li>

<style>
  /* Keep the same visual styles previously applied to each keypoint <li> */
  .keypoint-item {
    /* remove li sryles */
    all: unset;
    color: white;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.2rem 0.75rem;
    border-left: 3px solid var(--primary-color);
    background-color: var(--card-bg-secondary, rgba(255, 255, 255, 0.05));
    border-radius: 4px;
    text-align: left;
  }

  .additional-info {
    font-size: 0.9em;
  }
</style>
