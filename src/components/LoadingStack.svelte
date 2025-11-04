<script lang="ts">
  import type { UnlistenFn } from '@tauri-apps/api/event'

  import { listen } from '@tauri-apps/api/event'
  import type { FlowStatusEvent, MetadataPayload } from '../lib/types/flowStatus'

  type FlowPayload = {
    key: string
    status: string
    // ...any other fields...
  }

  type Pill = { key: string; status: string }

  let pills = $state<Pill[]>([])

  function upsertPill(payload: FlowPayload) {
    const idx = pills.findIndex((p) => p.key === payload.key)
    if (idx === -1) {
      pills = [...pills, { key: payload.key, status: payload.status }]
    } else {
      pills = pills.map((p, i) => (i === idx ? { ...p, status: payload.status } : p))
    }
    console.log('Updated pills:', pills)
  }

  $effect.pre(() => {
    listen<FlowStatusEvent<FlowPayload>>('flow-status', (event) => {
      const payload = event?.payload as FlowPayload
      debugger
      if (!payload || typeof payload.key !== 'string' || typeof payload.status !== 'string') return
      upsertPill(payload)
    })
  })
</script>

<div class="stack">
  {#each pills as pill (pill.key)}
    <span class="pill {pill.status === 'done' ? 'done' : ''}">
      {pill.status === 'done' ? pill.key : pill.status}
      {pill.status === 'done' ? '✔' : ''}
    </span>
  {/each}
</div>

<style>
  .stack {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .pill {
    border-radius: 999px;
    background: var(--pill-bg, #e5e7eb);
    padding: 0.3rem 0.6rem;
    color: var(--pill-fg, #111827);
    font-size: 0.75rem;
    line-height: 1.2;
  }
  .pill.done {
    opacity: 0.5;
  }
</style>
