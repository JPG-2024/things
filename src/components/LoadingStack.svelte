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
  }

  export function resetStack() {
    pills = []
  }

  $effect.pre(() => {
    listen<FlowStatusEvent<FlowPayload>>('flow-status', (event) => {
      const payload = event?.payload as FlowPayload
      if (!payload || typeof payload.key !== 'string' || typeof payload.status !== 'string') return
      upsertPill(payload)
    })
  })
</script>

<div class="stack">
  {#each pills as pill (pill.key)}
    <span class="pill {pill.status === 'done' ? 'done' : ''}">
      {pill.status === 'done' ? pill.key : pill.status}
    </span>
  {/each}
</div>

<style>
  .stack {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
  }
  .pill {
    border: 1px solid #555;
    border-radius: 999px;
    background-color: rgb(154, 154, 154, 0.1);
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1.2;
  }

  .pill::before {
    display: inline-block;
    margin-right: 0.3rem;
    border-radius: 50%;
    background-color: var(--pill-indicator, #6b7280);
    width: 0.5rem;
    height: 0.5rem;
    content: '';
  }

  .pill.done::before {
    background-color: var(--pill-indicator-done, #57f234);
  }

  .pill.done {
    opacity: 0.5;
  }
</style>
