/**
 * Chat Service
 * Manages chat conversations using Ollama Chat API with database persistence
 */

import { ConversationManager } from '@/lib/utils/ollama/chat';
import type { ChatMessage as OllamaChatMessage } from '@/lib/utils/ollama/chat';
import { 
  saveMessage, 
  getMessagesByChat, 
  getChatById
} from '@/lib/utils/database/chatDB';
import type { DBChatMessage, ChatMessageUI } from '@/types/chat.types';
import { getArticleById } from '../utils/database/articleDB';

// Configuración del modelo
const DEFAULT_MODEL = 'ministral-3:3b';
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

export class ChatService {
  private conversationManager: ConversationManager;
  private chatId: number;
  private articleId: number | undefined;
  private systemPrompt: string;

  constructor(
    chatId: number,
    systemPrompt?: string | undefined,
    articleId?: number,
    model: string = DEFAULT_MODEL
  ) {
    this.chatId = chatId;
    this.articleId = articleId;
    this.systemPrompt = systemPrompt || "";
    this.conversationManager = new ConversationManager(
      model,
      DEFAULT_BASE_URL,
      undefined, // sin tools por ahora
      {
        temperature: 0.2,
        num_predict: 2000,
      }
    );
  }

  /**
   * Inicializa el chat cargando el historial desde la BD
   */
  async initialize(fullContent: boolean = false): Promise<ChatMessageUI[]> {
    // 1. Agregar system message primero
    this.conversationManager.addMessage('system', this.systemPrompt);
    
    // 2. Si existe articleId, agregar el contenido del artículo como user message
    if (fullContent && this.articleId) {
      const article = await getArticleById(this.articleId);
      if (article && article.content) {
        this.conversationManager.addMessage('user', article.content);
      }
    }
    
    // 3. Cargar mensajes de user y assistant desde la BD
    const dbMessages = await getMessagesByChat(this.chatId);
    
    // Convertir mensajes de DB a formato Ollama y cargar en el manager
    for (const msg of dbMessages) {
      const ollamaMsg: OllamaChatMessage = {
        role: msg.sender as 'user' | 'assistant' | 'system',
        content: msg.content,
      };
      
      // Agregar al manager sin hacer llamada al API
      this.conversationManager.addMessage(
        ollamaMsg.role,
        ollamaMsg.content
      );
    }
    
    return dbMessages.map(this.dbToUI);
  }

  /**
   * Agregar mensaje del sistema (opcional)
   */
  async addSystemMessage(content: string): Promise<void> {
    await saveMessage({
      chatId: this.chatId,
      sender: 'system',
      content,
    });
    
    this.conversationManager.addMessage('system', content);
  }

  /**
   * Enviar mensaje del usuario y obtener respuesta streaming
   * @param userMessage - El mensaje del usuario
   * @param context - Contexto adicional que se envía al modelo pero no se guarda en DB
   */
  async *sendMessage(userMessage: string, context?: string): AsyncGenerator<{
    chunk: string;
    fullContent: string;
    done: boolean;
  }> {
    // Guardar mensaje del usuario en DB
    await saveMessage({
      chatId: this.chatId,
      sender: 'user',
      content: userMessage,
    });

    // Preparar mensaje con contexto si existe
    const messageToSend = context 
      ? `${context}\n\nUser question: ${userMessage}`
      : userMessage;

    // Stream de respuesta del asistente
    let fullResponse = '';
    
    for await (const chunk of this.conversationManager.sendMessage(messageToSend)) {
      fullResponse += chunk.message.content;
      
      yield {
        chunk: chunk.message.content,
        fullContent: fullResponse,
        done: chunk.done,
      };

      // Cuando termina, guardar en DB
      if (chunk.done) {
        await saveMessage({
          chatId: this.chatId,
          sender: 'assistant',
          content: fullResponse,
        });
      }
    }
  }

  /**
   * Obtener el historial completo de mensajes
   */
  getHistory(): ChatMessageUI[] {
    return this.conversationManager.getHistory().map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));
  }

  /**
   * Obtener número de mensajes en la conversación
   */
  getMessageCount(): number {
    return this.conversationManager.getMessageCount();
  }



  /**
   * Convertir mensaje de DB a UI
   */
  private dbToUI(msg: DBChatMessage): ChatMessageUI {
    return {
      role: msg.sender as 'user' | 'assistant' | 'system',
      content: msg.content,
    };
  }
}
