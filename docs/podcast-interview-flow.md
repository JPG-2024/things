# Podcast Interview Flow

Mermaid diagram showing the main functions called during an interview-mode podcast generation.

> **Note:** `interviewGenerator.ts` exports (`planInterviewTopic`, `buildInterviewPrompts`) are **not currently wired** into the active flow. The store builds turn plans and prompts inline.

```mermaid
flowchart TD
    Start["User clicks Start Podcast"] --> StartFn["podcastState.start()"]
    StartFn --> Stop["podcastState.stop()"]
    Stop --> StatusExtracting["status = 'extracting'"]

    StatusExtracting --> BuildQ{buildQuestionsSegments()}

    BuildQ -->|Questions task exists| ChunkSummary["generateChunkSummary() x N"]
    ChunkSummary --> TurnPlans["buildInterviewTurnPlans()"]
    TurnPlans --> PlayAll

    BuildQ -->|No questions| ResolveTopics["resolveTopics()"]
    ResolveTopics --> ExtractTopics{"Has source content?"}
    ExtractTopics -->|Yes| Extract["extractTopics()"]
    ExtractTopics -->|No| FreeTopics["generateFreeTopics()"]
    Extract --> PlayAll
    FreeTopics --> PlayAll

    PlayAll["playAllTopics()"] --> PreHooks{"Hooks enabled?"}
    PreHooks -->|Yes| PlayHookInitial["playHook('initial')"]
    PreHooks -->|No| TopicLoop
    PlayHookInitial --> GenExchangeHook["generateExchange(hookKind: 'initial')"]
    GenExchangeHook --> BuildSysHook["buildSystemMessage()"]
    BuildSysHook --> BuildUserHook["buildUserMessage()"]
    BuildUserHook --> LLMHook["chatCompletions()"]
    LLMHook --> CleanHook["cleanExchangeText()"]
    CleanHook --> AudioHook["generateExchangeAudio()"]
    AudioHook --> PlayHook["playBlobEntry()"]
    PlayHook --> TopicLoop

    TopicLoop["For each topic t"] --> ExchangeLoop["For each exchange e"]
    ExchangeLoop --> Prepare["prepareExchange(t, e)"]
    Prepare --> IsQuestion{"plan.role === 'question'?"}
    IsQuestion -->|Yes| DirectExchange["Direct exchange (no LLM)"]
    IsQuestion -->|No| BuildParams["buildExchangeParams()"]
    BuildParams --> EnsureSummary["ensureTopicSummary()"]
    EnsureSummary --> GenExchange["generateExchange(params)"]
    GenExchange --> BuildSys["buildSystemMessage()"]
    BuildSys --> BuildUser["buildUserMessage()"]
    BuildUser --> LLM["chatCompletions()"]
    LLM --> Clean["cleanExchangeText()"]
    Clean --> Audio["generateExchangeAudio()"]
    DirectExchange --> Audio
    Audio --> Speculative["Speculative pre-fetch next exchange"]
    Speculative --> PlayExchange["playExchange(t, e)"]
    PlayExchange --> WaitGap{"More exchanges?"}
    WaitGap -->|Yes| ExchangeLoop
    WaitGap -->|No| NextTopic{"More topics?"}
    NextTopic -->|Yes| TopicLoop
    NextTopic -->|No| PostHooks{"Hooks enabled?"}

    PostHooks -->|Yes| PlayHookFinal["playHook('final')"]
    PostHooks -->|No| Done["status = 'idle'"]
    PlayHookFinal --> GenExchangeFinal["generateExchange(hookKind: 'final')"]
    GenExchangeFinal --> BuildSysFinal["buildSystemMessage()"]
    BuildSysFinal --> BuildUserFinal["buildUserMessage()"]
    BuildUserFinal --> LLMFinal["chatCompletions()"]
    LLMFinal --> CleanFinal["cleanExchangeText()"]
    CleanFinal --> AudioFinal["generateExchangeAudio()"]
    AudioFinal --> PlayFinal["playBlobEntry()"]
    PlayFinal --> Done

    subgraph LLM Provider
        LLM --> Provider["chatCompletions()"]
        LLMHook --> Provider
        LLMFinal --> Provider
        Provider --> Router{"aiProvider?"}
        Router -->|openrouter| OpenRouter["openrouterChatCompletions()"]
        Router -->|local| Llama["llamaChatCompletions()"]
    end

    subgraph Files ["Key Files"]
        Store["podcastStore.svelte.ts"]
        DialogGen["dialogGenerator.ts"]
        TopicExt["topicExtractor.ts"]
        SummaryGen["summaryGenerator.ts"]
        ChatProv["chat-completions-provider.ts"]
    end
```

## Function Reference

| Function                    | File                           | Purpose                                                         |
| --------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `podcastState.start()`      | `podcastStore.svelte.ts`       | Entry point: validates config, resolves topics, starts playback |
| `buildQuestionsSegments()`  | `podcastStore.svelte.ts`       | Builds segments from a completed "questions" task               |
| `buildInterviewTurnPlans()` | `podcastStore.svelte.ts`       | Creates TurnPlan array from questions per chunk                 |
| `resolveTopics()`           | `podcastStore.svelte.ts`       | Falls back to LLM topic extraction if no questions task         |
| `extractTopics()`           | `topicExtractor.ts`            | LLM-based topic extraction from content                         |
| `generateFreeTopics()`      | `topicExtractor.ts`            | LLM generates topics from scratch (no content)                  |
| `generateChunkSummary()`    | `summaryGenerator.ts`          | Short topic label (max 10 words) from raw chunk                 |
| `generateTopicSummary()`    | `summaryGenerator.ts`          | Detailed summary of source material for a topic                 |
| `playAllTopics()`           | `podcastStore.svelte.ts`       | Iterates topics, generates and plays exchanges                  |
| `playHook()`                | `podcastStore.svelte.ts`       | Generates and plays opening/closing hooks                       |
| `prepareExchange()`         | `podcastStore.svelte.ts`       | Generates one exchange + audio (with caching)                   |
| `buildExchangeParams()`     | `podcastStore.svelte.ts`       | Constructs GenerateExchangeParams for a turn                    |
| `generateExchange()`        | `dialogGenerator.ts`           | Calls LLM to produce a single DialogExchange                    |
| `buildSystemMessage()`      | `dialogGenerator.ts`           | Constructs role-specific system prompt                          |
| `buildUserMessage()`        | `dialogGenerator.ts`           | Constructs user prompt with transcript history                  |
| `cleanExchangeText()`       | `dialogGenerator.ts`           | Strips formatting artifacts from raw LLM output                 |
| `generateExchangeAudio()`   | `podcastStore.svelte.ts`       | TTS for an exchange (splits into chunks)                        |
| `playExchange()`            | `podcastStore.svelte.ts`       | Plays audio for an exchange                                     |
| `playBlobEntry()`           | `podcastStore.svelte.ts`       | Decodes and plays audio via Web Audio API                       |
| `chatCompletions()`         | `chat-completions-provider.ts` | Routes LLM calls to OpenRouter or local Llama                   |
