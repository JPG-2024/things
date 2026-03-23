
Avoid fix biome linter.

# AGENTS.md - Agents intructions

## Tech stack
frontend: svelte 5 with runes.

## Ignore folders
LEGACY,PLANS
  

### Svelte 5 implementations

#### Example of using component props
```
  let {
    baseUrl = 'http://localhost:8080',
    completionParameters = DEFAULT_COMPLETION_PARAMETERS,
    content = '',
  }: Props = $props()
```

#### Example of use state
```
  type Pill = { key: string; status: string }

  let pills = $state<Pill[]>([])
```

