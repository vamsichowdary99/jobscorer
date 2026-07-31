import type { ChatMessage } from './types';

/**
 * Caps conversation history sent to OpenAI. Both /api/chat and
 * /api/resume-edit/chat resend full history every turn with no cap found in
 * code — a 30-turn conversation costs ~15x a 2-turn one while consuming the
 * same single quota unit (see docs/AI_COST_OPTIMIZATION_AUDIT.md §1, §9).
 *
 * ponytail: plain "keep the last N messages" — no summarization of the
 * dropped turns. Add summarization if users report losing earlier context
 * mid-conversation.
 */
export function truncateHistory<T extends ChatMessage>(
  history: T[],
  maxMessages = 12,
): T[] {
  if (history.length <= maxMessages) return history;
  return history.slice(-maxMessages);
}
