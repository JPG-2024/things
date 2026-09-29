# ADR 0001 — Picker único de voces y modal de síntesis separado

- Estado: aceptado
- Contexto: TTS player, PodcastMode

## Contexto

La selección de voz estaba duplicada en tres superficies:

- `MiniProfilePicker`: rueda de perfiles, solo en el reproductor mini.
- `VoiceProfileWheel`: modal con config de síntesis **+** rueda de perfiles **+** gestión (Add/Edit/Record), abierto por el engranaje del full player (modo `main`) y por `VoiceSelector` (modo `select`).
- `VoiceSelector`: card grande que abría ese wheel para elegir voz en el full player y en podcast.

Elegir voz en el wheel era redundante respecto del picker, y los settings de síntesis no eran alcanzables desde el mini.

## Decisión

1. `MiniProfilePicker` es el **único selector de voces** de la app (TTS y podcast). Se elimina `VoiceSelector`.
2. El modal `VoiceProfileWheel` se reemplaza por `VoiceSettingsModal`: **solo** config de síntesis (Chunk / Synthesis / Pauses), **parametrizado** por contexto (TTS o Host A/B del podcast).
3. La **gestión** de voces (Add/Edit/Record) vive **dentro del picker**, solo en contexto TTS. El picker de podcast solo elige host/chunk.
4. El podcast obtiene **config de síntesis real por host** (`hostASynthParams` / `hostBSynthParams`), persistida y usada en la generación. Las `pauseSettings` quedan TTS-only porque el podcast no implementa pausas intra-exchange.
5. El botón de acción del picker se reutiliza para abrir settings cuando el contexto lo permite.

## Consecuencias

- Un solo punto de entrada para elegir voz evita estados divergentes.
- `voiceWheelState` desaparece; el modal de settings de TTS se controla con `voiceSettingsState` (global, para toolbar y hotkey `,`) y el de podcast con estado local de `PodcastMode`.
- El picker crece en responsabilidad (selección + gestión), pero mantiene `panelView` internos en lugar de un modal extra.
- La eliminación del modo full del TTS y el transporte on-hover quedan como fase separada (no incluida acá).

## Actualización — Fase 2 aplicada

- Se eliminó el modo full del TTS (`TTSPlayerFull`, `TTSPlayerControls`, `viewState.ttsPlayerMode`, `PlayerMode`). El player es siempre la barrita mini.
- El transporte (play/pause, stop, tiempo) vive en la barrita y se muestra on-hover; click en la zona del waveform abre el picker, los botones no.
- El botón de acción del picker de TTS (antes "expandir") desaparece: el acceso a settings queda en el engranaje del propio picker.
