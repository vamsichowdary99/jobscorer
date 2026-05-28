import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { chatTools } from '@/lib/chat/tool-definitions';
import { executeTool } from '@/lib/chat/tools';
import type { ChatRequest } from '@/lib/chat/types';
import { createClient } from '@/lib/supabase/server';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `You are a career assistant for ResuScore, a job matching platform. You help users find the right jobs and improve their chances of getting hired.

You have access to the user's resume, job scores, company research, and skill gaps via tools. Always respond with specific data from tools, not generic advice. Keep responses concise and actionable.

CRITICAL — FORMAT EVERY RESPONSE AS MARKDOWN. The UI renders your output with a markdown renderer (react-markdown + remark-gfm). Indentation alone does NOT create lists or sections — you must use real markdown syntax or the user sees flat prose.

Use:
- \`## Heading\` for section titles (two-level only: \`##\` for sections, \`###\` for sub-sections). NEVER use a leading \`#\` (h1) — the page already has one.
- \`- item\` (dash + space) for bullet lists. Indent nested bullets with two spaces.
- \`1. item\` for ordered lists when the order matters (steps, weekly plans, ranked recommendations).
- \`**word**\` for emphasis on key terms, company names, role titles, numbers ("**87% match**", "**Auxo AI**").
- \`\\\`inline code\\\`\` for skills, tech names, library names, file paths, env vars, command snippets ("install \\\`pandas\\\`", "edit \\\`.env.local\\\`").
- Triple-backtick fences with a language tag for any multi-line code or config (\\\`\\\`\\\`bash, \\\`\\\`\\\`python, \\\`\\\`\\\`json).
- \`> note\` for cautions or asides.
- \`[label](url)\` for explicit links — never bare URLs.
- Tables (pipe syntax) when comparing 3+ items across 2+ attributes.
- Blank lines BETWEEN every paragraph, list, heading, and code block. Markdown collapses without them.

Do NOT fake structure with indented spaces. Do NOT write "Week 1:" as a plain line — write "## Week 1: Python Foundations" on its own line, then a blank line, then \`-\` bullets.

CRITICAL — the UI auto-renders rich visual cards from tool results. NEVER include placeholder text like "[Job Matches Card]", "[Card]", "[See below]", "[Chart]" or any bracketed reference to UI elements — the user sees those literal brackets as text. Just write your 1–3 sentence intro and stop; the card renders on its own underneath.
- find_matching_jobs and get_job_scores → render as a job-matches card (logos, scores, matched/missing skill chips, action buttons). DO NOT re-list every job as text. Write 1–2 sentences naming the cluster/theme and what's pulling the top scores; the card is the artifact.
- recommend_skill_to_learn → renders as a skill-gap bar chart. DO NOT restate every gap with counts. Lead with the single highest-impact skill in 1–2 sentences; the chart shows the rest.
- get_company_research → renders as a company snapshot card. DO NOT re-list industry/size/HQ/tech stack. Write 1–3 sentences on what matters most for the user (hiring momentum, tech direction, fit signal).

For other tools, format with markdown as needed.

Tool routing:
- "What jobs match my profile?" / "best fits" / "strongest matches" / "find me jobs that fit" → ALWAYS prefer find_matching_jobs (live RAG against the user's currently-selected resume). Only use get_job_scores if the user explicitly asks about previously-scored or cached matches with AI reasoning ("what was the AI's reasoning on my last batch", "show me the scores from my last run").
- When the user names a city/region ("frontend roles in Hyderabad", "anything in Bangalore?"), pass the city as the \`location\` arg to find_matching_jobs — DO NOT call search_jobs unless the user explicitly asks to fetch/ingest new jobs.
- "What was my score for [company X]?" → get_cached_score with the job_id.
- "What skill should I learn?" / "what to pick up next?" → recommend_skill_to_learn.
- Specific company → get_company_research. If the tool returns no data for that company, do NOT offer to research it from chat (the chat is read-only for company research). Instead, tell the user EXACTLY this with the company name filled in: "I don't have research on **<Company>** yet. To pull it in, go to **AI Matches**, open the **<Company>** job card, and click **Optimize** — that runs the company research workflow and the result will be available here next time." Never suggest Glassdoor, LinkedIn, or any external site as a substitute.
- Specific job's missing skills → get_skill_gaps (use the job_id from earlier in the conversation; never ask the user).
- Follow-ups like "yes", "tell me more", "show details" about a job already mentioned → call get_job_details and/or get_skill_gaps using the job_id you already have.
- Resume questions → get_user_resume.
- New job ingestion request → search_jobs (only when user explicitly asks to fetch/scrape/find new jobs from the web).

search_jobs is ASYNC and slow (1-2 minutes server-side). Strict rules:
- Call it AT MOST ONCE per user request. Never call it twice in the same conversation, even on follow-ups.
- If the user says "wait", "is it done", "show me the results", "ok", "any updates", etc. after a prior search_jobs call: DO NOT call search_jobs again. Instead, call find_matching_jobs (optionally with the user's location) to surface whatever has landed so far.
- If the user asks for jobs in a specific city right after a search_jobs trigger, use find_matching_jobs with location=city. The freshly-ingested jobs are already in the index.

Important:
- The session resume is authoritative. Cached scores (get_job_scores) only return rows for that resume — if it returns nothing, fall back to find_matching_jobs.
- Never say you don't have access to a job_id if a previous tool call returned it — look back through history.
- If a tool returns an error, explain it helpfully and suggest what the user can do.`;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { message, conversationHistory, resumeId } = body;
  const userId = user.id;
  const sessionResumeId = typeof resumeId === 'string' && resumeId.length > 0 ? resumeId : null;

  if (!message || !userId) {
    return NextResponse.json({ error: 'Message and userId are required.' }, { status: 400 });
  }

  const openai = getOpenAI();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: message },
  ];

  const abortSignal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      // NDJSON: one JSON object per line. Simpler than SSE for our needs.
      const emit = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // controller may already be closed if the client aborted
        }
      };

      const toolCalls: { name: string; durationMs: number; result: string }[] = [];

      try {
        // Tool-call loop. Each iteration is NON-streaming because we need the
        // full tool_calls JSON before we can execute. After 5 iterations or
        // when the model returns content with no tool_calls, we move on to
        // streaming the final text.
        let iterations = 0;
        let assistantMessage: OpenAI.ChatCompletionMessage | null = null;

        while (iterations < 5) {
          if (abortSignal.aborted) throw new Error('aborted');

          const response = await openai.chat.completions.create(
            {
              model: 'gpt-4.1-mini',
              messages,
              tools: chatTools,
              tool_choice: 'auto',
              max_tokens: 2048,
            },
            { signal: abortSignal },
          );
          assistantMessage = response.choices[0].message;

          if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            break;
          }

          iterations++;
          messages.push(assistantMessage);

          for (const toolCall of assistantMessage.tool_calls as OpenAI.ChatCompletionMessageFunctionToolCall[]) {
            if (abortSignal.aborted) throw new Error('aborted');
            emit({ type: 'tool_start', name: toolCall.function.name });

            const args = JSON.parse(toolCall.function.arguments);
            const t0 = Date.now();
            const result = await executeTool(
              toolCall.function.name,
              args,
              userId,
              sessionResumeId,
            );
            const durationMs = Date.now() - t0;
            toolCalls.push({ name: toolCall.function.name, durationMs, result });
            emit({
              type: 'tool_end',
              name: toolCall.function.name,
              durationMs,
              result,
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        }

        // We now have a final assistantMessage with content + no further tool calls.
        // It's already been generated (and billed) by the tool-loop. Fake-stream it
        // at ~120 chars/sec to feel like real OpenAI streaming. Saves a second API
        // call that would have produced the same text and double-billed tokens.
        const finalText =
          (assistantMessage && assistantMessage.content) ||
          'Sorry, I could not generate a response.';

        const CHUNK_SIZE = 4;
        const DELAY_MS = 12;
        for (let i = 0; i < finalText.length; i += CHUNK_SIZE) {
          if (abortSignal.aborted) throw new Error('aborted');
          emit({ type: 'text_delta', delta: finalText.slice(i, i + CHUNK_SIZE) });
          if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS));
        }

        emit({ type: 'done', toolCalls });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        if (message === 'aborted' || (err as { name?: string })?.name === 'AbortError') {
          // Client cancelled — emit a clean "stopped" event and exit.
          emit({ type: 'stopped' });
        } else {
          console.error('Chat API error:', err);
          emit({ type: 'error', error: message });
        }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
