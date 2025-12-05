export interface Chat {
  id: number;
  articleId: number | null;
  name: string;
  createdAt: string;
}

// Tipo para la base de datos
export interface DBChatMessage {
  id?: number;
  chatId?: number;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  toolCalls?: string; // JSON stringificado de tool_calls si existe
}

// Tipo para usar en memoria (compatible con Ollama)
export interface ChatMessageUI {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: Array<{
    id: string;
    function: string;
    arguments?: string;
  }>;
  images?: string[];
}