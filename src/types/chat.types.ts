interface Chat {
  id: number;
  articleId: number | null;
  name: string;
  createdAt: string;
}

interface ChatMessage {
  id?: number;
  chatId?: number;
  sender: string;
  content: string;
  createdAt?: string;
}