export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  userId: string;
  conversationHistory: ChatMessage[];
  /**
   * The resume the user picked for this chat session. Server-side tools
   * (get_user_resume, find_matching_jobs, recommend_skill_to_learn,
   * get_cached_score) operate against this resume. If omitted the server
   * falls back to the latest resume by created_at.
   */
  resumeId?: string;
}

export interface ChatToolCall {
  name: string;
  durationMs: number;
  /** Raw JSON string returned by the tool. The client uses this to render
   * rich cards (job matches, skill gap chart, company snapshot). */
  result?: string;
}

export interface ChatResponse {
  reply: string;
  toolCalls?: ChatToolCall[];
  error?: string;
}
