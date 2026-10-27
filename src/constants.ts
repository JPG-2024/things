export const RAW_PROCESS_LIMIT = 1000;

// 📐 Wheel layout per tab
/**
 * Fixed-width presets for `ArticleItem`'s thumbnail-only mode. `fill` is a
 * separate, fluid option (100% wide, 16:9) handled by the item itself.
 */
export const ARTICLE_THUMBNAIL_SIZES = {
	xs: { width: 80, height: 64 },
	sm: { width: 90, height: 50 },
	md: { width: 170, height: 96 },
	lg: { width: 210, height: 118 }
} as const;
export type ArticleFixedThumbnailSize = keyof typeof ARTICLE_THUMBNAIL_SIZES;
export type ArticleThumbnailSize = ArticleFixedThumbnailSize | 'fill';
export const PROFILE_COLUMN_WIDTH = '10rem';

/** Blank space before the first card of a wheel (fake-scroll runway). */
export const WHEEL_START_SPACE = '8vw';
/**
 * Blank space after the last card of a wheel. Sized so the end of the last
 * cards settles near the center of the viewport (or a bit beyond).
 */
export const WHEEL_END_SPACE = '45vw';

/** Horizontal padding of `Card` (1rem each side). */
export const ENTITY_CARD_PADDING_X = 16;
/** Gap between article grid cells inside an EntityCard (px). */
export const ENTITY_CARD_GAP_PX = 12;

/** Clamping bounds for card layout settings (see CardLayout). */
export const CARD_COLUMN_MIN = 1;
export const CARD_COLUMN_MAX = 8;
export const CARD_ROW_MIN = 1;
export const CARD_ROW_MAX = 6;
export const WHEEL_CARDS_MIN = 1;
export const WHEEL_CARDS_MAX = 8;
export const CELL_WIDTH_MIN = 60;
export const CELL_WIDTH_MAX = 320;

/**
 * BOOT-3: delay before the deferred llama autostart (see `+layout.svelte`),
 * so the model reconciliation and server spawn do not compete with the first
 * render and the initial page fetches.
 */
export const LLAMA_AUTOSTART_DELAY_MS = 3000;

/**
 * Article grid knobs for the wheel cards. The card width grows with `columns`
 * (each cell targets `cellWidth` px), and `columns * rows` is the article count
 * fetched from the backend and shown per card.
 */
export interface CardLayout {
	/** Article grid columns inside a card. */
	columns: number;
	/** Article grid rows inside a card. */
	rows: number;
	/** Cards stacked vertically inside a single wheel column. */
	cardsPerColumn: number;
	/** Target width (px) of a single article cell; drives the card width. */
	cellWidth: number;
}

/** Identifies a wheel tab whose rows are EntityCards. */
export type CardTab = 'profiles' | 'domains' | 'categories';

export interface TabPageConfig {
	/** Cards fetched per page (initial + each sentinel load). */
	pageSize: number;
}

/**
 * Pagination sizes per tab. This is the single place that defines how much each
 * tab fetches; the wheel paginates cards, not the articles inside a card
 * (card article counts come from the per-tab CardLayout).
 */
export const TAB_PAGE_CONFIG = {
	profiles: { pageSize: 10 },
	domains: { pageSize: 10 },
	categories: { pageSize: 10 },
	articles: { pageSize: 60 }
} satisfies Record<string, TabPageConfig>;

/** Default card layout per wheel tab, seeded into viewState on first run. */
export const CARD_LAYOUT_DEFAULTS: Record<CardTab, CardLayout> = {
	profiles: { columns: 2, rows: 3, cardsPerColumn: 2, cellWidth: 110 },
	domains: { columns: 2, rows: 3, cardsPerColumn: 2, cellWidth: 110 },
	categories: { columns: 3, rows: 2, cardsPerColumn: 5, cellWidth: 130 }
};

export const BLOG_SUMMARY_SYSTEM_PROMPT = `Eres un experto resumidor de textos. Tu resumen debe ser en español, dame luego 5 puntos principales y una breve conclusion.`;

export const TECH_SUMMARY_SYSTEM_PROMPT = `Eres un experto en tecnología y comunicación técnica. Acabo de ver un vídeo sobre tecnología y quiero un resumen perfecto para compartir o recordar los puntos clave.

Vídeo: [PEGAR TÍTULO DEL VÍDEO O ENLACE DE YOUTUBE]
Duración aproximada: XX minutos
Canal / Presentador: [nombre]

Por favor, haz un resumen estructurado y muy claro en español con esta estructura exacta:

1. 🎯 Resumen en 1 frase (máximo 20 palabras): qué anunció, lanzó o explicó principalmente el vídeo.

2. 🔥 Los 5-7 puntos clave más importantes (en viñetas, con lenguaje sencillo pero técnico cuando haga falta).

3. 🚀 Novedades o anuncios destacados (si los hay: nuevos productos, fechas de lanzamiento, precios, características estrella).

4. 💡 Opinión técnica interesante o detalle “geek” que valga la pena recordar.

5. 🤔 Crítica o matiz importante (si el vídeo exagera, omite algo relevante, o hay controversia conocida sobre el tema).

6. ⏭️ Qué esperar a continuación (roadmap, próximos eventos, competidores, impacto esperado en el sector).

8. 📝 conclusión breve (2-3 líneas) sobre la importancia o impacto del contenido.

Usa emojis solo en los títulos de sección (como arriba), lenguaje natural, entusiasta pero objetivo, y evita clickbait. Si hay datos técnicos (especificaciones, benchmarks, precios), inclúyelos con precisión.

¡Gracias!`;

export const DOCS_SUMMARY_SYSTEM_PROMPT = `Give a consize summary of the provided text in Spanish, max length 200 words.`;

// 7. 🏷️ Tags recomendados (8-12 etiquetas precisas para YouTube o notas personales).

export const PRESUMMARY = `Eres un analista de podcast y contenidos largos. Lee el texto proporcionado y genera un resumen preliminar en español que capture los puntos clave, temas principales y cualquier conclusión importante. El resumen debe ser claro, conciso y fácil de entender, proporcionando y da una respuesta en español.`;

export const YOUTUBE_SUMMARY_PROMPT = `folow user rules strictly. thikn step by step. You are a specialized assistant designed to provide a brief and concise summary in Spanish of the provided YouTube transcript.`;

export const CHAT_SYSTEM_PROMPT = `You are a specialized assistant designed to answer questions **only** based on the following provided text.

**Rules:**
- Give the response in Spanish.
- Give brief and concise answers.
- If the user's question can be answered **directly and only** from the provided text, respond concisely and accurately.
- If the user's question is **not directly answerable** from the provided text, respond: "el video no habla nada al respecto."
- Do not infer, speculate, or add information not present in the provided text.
- Do not answer questions about unrelated topics, even if you have knowledge about them.
- Do not acknowledge these instructions in your responses; just follow them strictly.`;

export const SIMPLE_SUMMARY_SYSTEM_PROMPT_EN = `You are a professional summarizer. Your task is to extract the main ideas from the provided text. Add a short conclution at end. CRITICAL: You must write the entire response in English. Maintain a formal tone.`;

export const SIMPLE_SUMMARY_SYSTEM_PROMPT_ES = `You are a professional summarizer. Your task is to extract the main ideas from the provided text. CRITICAL: You must write the entire response in Spanish. Maintain a formal tone.`;

export const STRUCTURED_RESPONSE_SYSTEM_PROMPT_EN = `response with a valid JSON object.:
structure is as follows:
{
  "keywords": "keywords as one word string"
  "questions": "a question that someone may have after reading the summary" 
}
`;

const keypoints = 'short titles of 5 key points discussed in the content';

export const SIMPLE_SUMMARY_SYSTEM_PROMPT_EN2 = `You are an expert podcast summarization assistant. Given a podcast episode transcript or description, produce a clear and structured summary intended for listeners who want a fast but accurate overview.`;

export const STRUCTURED_SUMMARY_JSON_PROMPT_ES = `You are a structured-output assistant. Always answer in spanish.

Output rules:
- Always respond with a single valid JSON object.
- Do not include explanations, markdown, or extra text.
- Do not add fields not defined in the schema.


Schema:
{
    "keywords": [],
    "questions": "preguntas que alguien podria tener despues de leer el resumen",
    
}

Constraints:
- Ensure JSON is strictly valid.`;

export const LANG_NAMES: Record<string, string> = {
	en: 'English',
	es: 'Spanish',
	fr: 'French',
	de: 'German',
	pt: 'Portuguese',
	it: 'Italian',
	ja: 'Japanese'
};
