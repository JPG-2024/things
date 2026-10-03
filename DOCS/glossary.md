# Glosario

## Voz y selección

- **VoiceProfile**: perfil de voz (`id`, `name_prefix`, `image_src`, `language`). Fuente de verdad en el backend de voces.
- **Voice / chunk (de voz)**: muestra de audio de referencia de un perfil (`audio_file`, `text_reference`). No confundir con los _chunks de texto_ de `splitText`.
- **MiniProfilePicker**: selector único de voces de la app. Fila horizontal de perfiles + filtro; incluye gestión (Add/Edit/Record) y el acceso a settings en contexto TTS.
- **VoiceSettingsModal**: modal de configuración de síntesis. Parametrizado por contexto (TTS o Host A/B). No lista ni selecciona voces.
- **SynthParams**: `numStep`, `guidanceScale`, `speed`, `splitLevel`.
- **PauseSettings**: `minGapMs`, `maxGapMs`, `betweenParagraphs`. Solo aplican al TTS; el podcast no las usa.
- **Chunk (de texto)**: fragmento en que `splitText` divide el texto a sintetizar. `splitLevel` controla su granularidad.
- **WheelSelection**: contrato que combinaba perfil + chunk + synth + pauses. Sobrevive solo para el flujo live del TTS (`useVoiceProfiles`), ya no para el wheel.

## Podcast

- **Host A / Host B**: los dos hablantes del podcast, cada uno con perfil, chunk, randomChunk y `synthParams` propios (`hostASynthParams` / `hostBSynthParams`).
- **`hostsHydrated`**: marca de que el config del podcast vino de disco; evita randomizar hosts al cargar.

## Estado

- **voiceSettingsState**: estado global de apertura del modal de settings del TTS (toolbar y hotkey `,`).
- **mainVoiceState**: operaciones de gestión de voces del TTS (add/edit/record/delete) y carga de perfiles para el picker.
