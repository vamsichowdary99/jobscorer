'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/lib/chat/types';
import { useAuth } from '@/components/providers/AuthProvider';
import { fetchResumes, setPrimaryResumeId } from '@/lib/api';
import type { Resume } from '@/lib/types';

const SUGGESTIONS = [
  'Which job is my best match?',
  'What does my resume say?',
  'Tell me about TCS',
];

/* ─── Typing Indicator ───────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: '#135bec',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 12, color: '#fff',
        boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
      }}>✦</div>
      <div style={{
        background: '#f1f5f9', border: '1px solid #e2e8f0',
        borderRadius: '4px 16px 16px 16px',
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 5,
      }}>
        {[0, 200, 400].map((delay) => (
          <span key={delay} style={{
            width: 6, height: 6, borderRadius: '50%', background: '#135bec',
            display: 'inline-block',
            animation: 'chatBounce 1.2s ease-in-out infinite',
            animationDelay: `${delay}ms`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Message Bubble ─────────────────────────────────────────── */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div style={{
          maxWidth: '78%',
          background: '#135bec',
          borderRadius: '16px 4px 16px 16px',
          padding: '10px 14px',
          fontSize: '0.875rem', lineHeight: 1.55, color: '#fff',
          boxShadow: '0 2px 8px rgba(19,91,236,0.25)',
          wordBreak: 'break-word',
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 mb-3">
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: '#135bec',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 12, color: '#fff',
        boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
      }}>✦</div>
      <div style={{
        maxWidth: '82%',
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: '4px 16px 16px 16px',
        padding: '10px 14px', fontSize: '0.875rem', lineHeight: 1.6,
        color: '#0f172a', wordBreak: 'break-word',
      }} className="chat-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </div>
  );
}

/* ─── Resume Picker (first-message-of-session) ───────────────── */
function ResumePickerBubble({
  resumes,
  onPick,
  disabled,
}: {
  resumes: Resume[];
  onPick: (r: Resume) => void;
  disabled: boolean;
}) {
  function parsed(r: Resume): Record<string, unknown> | null {
    let v: unknown = r.structured_data;
    if (!v) return null;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
    return (v && typeof v === 'object') ? (v as Record<string, unknown>) : null;
  }
  function label(r: Resume): string {
    const sd = parsed(r);
    const pi = (sd?.personal_info as Record<string, string> | undefined) ?? undefined;
    const name = pi?.full_name?.trim() || (typeof sd?.name === 'string' ? (sd.name as string).trim() : '');
    const file = r.original_filename?.trim();
    const candidate = name || file || '';
    return candidate && candidate.toLowerCase() !== 'unknown'
      ? candidate
      : `Resume ${r.id.slice(0, 8)}`;
  }
  function sub(r: Resume): string {
    const sd = parsed(r);
    const pi = (sd?.personal_info as Record<string, string> | undefined) ?? undefined;
    const role = pi?.title?.trim() || (typeof sd?.professional_title === 'string' ? (sd.professional_title as string).trim() : '');
    const file = r.original_filename?.trim();
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
    const parts: string[] = [];
    if (role) parts.push(role);
    if (file && file !== label(r)) parts.push(file);
    if (date) parts.push(`Uploaded ${date}`);
    return parts.join(' · ');
  }
  return (
    <div className="flex items-end gap-2 mb-3">
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: '#135bec',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 12, color: '#fff',
        boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
      }}>✦</div>
      <div style={{
        maxWidth: '88%',
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: '4px 16px 16px 16px',
        padding: '10px 14px', fontSize: '0.875rem', lineHeight: 1.6,
        color: '#0f172a', wordBreak: 'break-word',
      }}>
        <p style={{ marginBottom: 8 }}>
          Which resume should I use for this session?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resumes.map((r) => (
            <button
              key={r.id}
              disabled={disabled}
              onClick={() => onPick(r)}
              style={{
                background: '#ffffff', border: '1px solid #cbd5e1',
                borderRadius: 10, padding: '8px 12px',
                fontSize: '0.8125rem', color: '#0f172a',
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                opacity: disabled ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (disabled) return;
                const el = e.currentTarget;
                el.style.background = '#e8f0fe';
                el.style.borderColor = '#135bec';
              }}
              onMouseLeave={(e) => {
                if (disabled) return;
                const el = e.currentTarget;
                el.style.background = '#ffffff';
                el.style.borderColor = '#cbd5e1';
              }}
            >
              <div style={{ fontWeight: 600 }}>{label(r)}</div>
              {sub(r) && (
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                  {sub(r)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Empty State ────────────────────────────────────────────── */
function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', gap: 20,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%', background: '#135bec',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, color: '#fff',
        boxShadow: '0 4px 20px rgba(19,91,236,0.3)',
        animation: 'chatPulse 3s ease-in-out infinite',
      }}>✦</div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
          Your AI Career Advisor
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
          Ask me anything about your resume,<br />jobs, or career strategy.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
        {SUGGESTIONS.map((s, i) => (
          <button key={s} onClick={() => onSuggestion(s)} style={{
            background: '#f1f5f9', border: '1px solid #e2e8f0',
            borderRadius: 10, padding: '9px 14px',
            fontSize: '0.8125rem', color: '#135bec',
            cursor: 'pointer', textAlign: 'left',
            transition: 'all 0.18s ease',
            animation: 'chatFadeUp 0.4s ease both',
            animationDelay: `${i * 80}ms`,
          }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.background = '#e8f0fe';
              el.style.borderColor = '#135bec';
              el.style.transform = 'translateX(3px)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.background = '#f1f5f9';
              el.style.borderColor = '#e2e8f0';
              el.style.transform = 'translateX(0)';
            }}
          >
            <span style={{ marginRight: 8, opacity: 0.5 }}>→</span>{s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Main ChatPanel Component ───────────────────────────────── */
export default function ChatPanel() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, []);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session-scoped resume selection. The user picks once per chat session
  // (or once after Clear) and every tool call uses that resume.
  const [sessionResumeId, setSessionResumeId] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<{ message: string; resumes: Resume[] } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, pendingPick]);

  useEffect(() => {
    if (isOpen && inputRef.current && !pendingPick) {
      setTimeout(() => inputRef.current?.focus(), 280);
    }
  }, [isOpen, pendingPick]);

  // ChatPanel is mounted once in the layout and survives client-side navigation.
  // Without this, logging out and back in (or switching accounts) on the same
  // tab leaves the previous user's conversation and session resume visible.
  useEffect(() => {
    setMessages([]);
    setError(null);
    setSessionResumeId(null);
    setPendingPick(null);
    setInput('');
  }, [user?.id]);

  function resumeLabel(r: Resume): string {
    let v: unknown = r.structured_data;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    const sd = (v && typeof v === 'object') ? (v as Record<string, unknown>) : null;
    const pi = (sd?.personal_info as Record<string, string> | undefined) ?? undefined;
    const name = pi?.full_name?.trim() || (typeof sd?.name === 'string' ? (sd.name as string).trim() : '');
    const file = r.original_filename?.trim();
    const candidate = name || file || '';
    return candidate && candidate.toLowerCase() !== 'unknown'
      ? candidate
      : `Resume ${r.id.slice(0, 8)}`;
  }

  async function callChatApi(text: string, rid: string, history: ChatMessage[]) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        userId: user?.id ?? '',
        conversationHistory: history,
        resumeId: rid,
      }),
    });
    // /api/chat streams newline-delimited JSON on success; it only returns a
    // plain JSON body (e.g. { error: 'Unauthorized' }) for pre-stream failures.
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    if (!res.body) throw new Error('Streaming not supported in this environment.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';
    try {
      for (; ;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let evt: { type?: string; delta?: string; error?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue; // skip partial/non-JSON lines
          }
          if (evt.type === 'text_delta' && typeof evt.delta === 'string') assembled += evt.delta;
          else if (evt.type === 'error') throw new Error(evt.error || 'Assistant error');
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
    }
    return assembled;
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading || pendingPick) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };

    // First message of the session: ask which resume to use before processing.
    if (!sessionResumeId) {
      setMessages([...messages, userMsg]);
      setInput('');
      setError(null);
      setIsLoading(true);
      try {
        const list = await fetchResumes(user?.id ?? '');
        if (list.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "I don't see any resumes uploaded yet. Head to **Upload Resume** in the sidebar, then come back and ask me again.",
          }]);
          return;
        }
        if (list.length === 1) {
          // Only one resume — auto-pick, persist, and proceed.
          const only = list[0];
          setSessionResumeId(only.id);
          setPrimaryResumeId(only.id);
          const reply = await callChatApi(trimmed, only.id, [...messages, userMsg]);
          setMessages(prev => [...prev,
            { role: 'assistant', content: `Using **${resumeLabel(only)}** for this session.` },
            { role: 'assistant', content: reply },
          ]);
          return;
        }
        // 2+ resumes — defer the message and show the picker.
        setPendingPick({ message: trimmed, resumes: list });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load your resumes.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Normal path: session resume already chosen.
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const reply = await callChatApi(trimmed, sessionResumeId, messages);
      setMessages([...updatedHistory, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function pickResumeForSession(resume: Resume) {
    if (!pendingPick) return;
    const { message: deferred } = pendingPick;
    setSessionResumeId(resume.id);
    setPrimaryResumeId(resume.id);
    setPendingPick(null);
    setIsLoading(true);
    setError(null);

    const confirmation: ChatMessage = {
      role: 'assistant',
      content: `Using **${resumeLabel(resume)}** for this session.`,
    };
    const historyWithConfirm = [...messages, confirmation];
    setMessages(historyWithConfirm);

    try {
      const reply = await callChatApi(deferred, resume.id, historyWithConfirm);
      setMessages([...historyWithConfirm, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setSessionResumeId(null);
    setPendingPick(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  const hasMessages = messages.length > 0;

  // Hide the floating widget on the dedicated AI Chat page — that page is the chat.
  if (pathname?.startsWith('/dashboard/chat')) {
    return null;
  }

  /* Panel dimensions */
  const panelWidth = isMaximized ? 'min(780px, calc(100vw - 48px))' : 400;
  const panelHeight = isMaximized ? 'min(680px, calc(100vh - 120px))' : 560;

  return (
    <>
      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes chatPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(19,91,236,0.3); }
          50% { box-shadow: 0 4px 28px rgba(19,91,236,0.5); }
        }
        @keyframes chatFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatPanelIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatGlowPulse {
          0%, 100% { box-shadow: 0 4px 16px rgba(19,91,236,0.5); }
          50%       { box-shadow: 0 4px 24px rgba(19,91,236,0.75); }
        }
        @keyframes chatMsgIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-markdown p { margin-bottom: 0.45em; }
        .chat-markdown p:last-child { margin-bottom: 0; }
        .chat-markdown ul, .chat-markdown ol { padding-left: 1.25em; margin-bottom: 0.5em; }
        .chat-markdown li { margin-bottom: 0.2em; color: #0f172a; }
        .chat-markdown strong { color: #0f172a; font-weight: 600; }
        .chat-markdown em { color: #475569; font-style: italic; }
        .chat-markdown code {
          background: #e8f0fe; border: 1px solid #c7d7fb;
          border-radius: 4px; padding: 1px 5px;
          font-size: 0.8em; color: #135bec;
        }
        .chat-markdown pre {
          background: #f1f5f9; border: 1px solid #e2e8f0;
          border-radius: 8px; padding: 10px 12px;
          overflow-x: auto; margin: 0.5em 0;
        }
        .chat-markdown pre code { background: transparent; border: none; padding: 0; color: #0f172a; }
        .chat-markdown table { border-collapse: collapse; width: 100%; margin: 0.5em 0; font-size: 0.8125em; }
        .chat-markdown th, .chat-markdown td { border: 1px solid #e2e8f0; padding: 5px 10px; text-align: left; }
        .chat-markdown th { background: #f1f5f9; color: #0f172a; font-weight: 600; }
        .chat-markdown a { color: #135bec; text-decoration: underline; text-underline-offset: 2px; }
        .chat-markdown h1, .chat-markdown h2, .chat-markdown h3 {
          color: #0f172a; font-weight: 600; margin-bottom: 0.35em; margin-top: 0.5em;
        }
        .chat-markdown blockquote {
          border-left: 3px solid #135bec; padding-left: 10px;
          color: #64748b; margin: 0.5em 0; font-style: italic;
        }
        .chat-msg-animate { animation: chatMsgIn 0.25s ease both; }
        .chat-input-area::-webkit-scrollbar { width: 0; }
        .chat-messages-scroll::-webkit-scrollbar { width: 4px; }
        .chat-messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-messages-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .chat-messages-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      {/* ── Floating Panel ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="AI Career Advisor Chat"
          aria-modal="true"
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: panelWidth,
            height: panelHeight,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 16,
            overflow: 'hidden',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)',
            animation: 'chatPanelIn 0.25s cubic-bezier(0.16,1,0.3,1) both',
            transition: 'width 0.25s cubic-bezier(0.16,1,0.3,1), height 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#ffffff', flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #135bec 0%, #2563eb 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(19,91,236,0.3)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 18 L9 12 L13 15 L20 6" />
                <path d="M15 6 L20 6 L20 11" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                JobScorer AI
              </p>
              <p style={{ fontSize: '0.7rem', color: isLoading ? '#135bec' : '#10b981', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: isLoading ? '#135bec' : '#10b981',
                  display: 'inline-block',
                  boxShadow: isLoading ? '0 0 5px #135bec' : '0 0 5px #10b981',
                }} />
                {isLoading ? 'Thinking...' : 'Online'}
              </p>
            </div>

            {/* Clear history */}
            {hasMessages && (
              <button onClick={clearChat} title="Clear chat" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: 15, padding: '4px 6px',
                borderRadius: 6, transition: 'color 0.15s', lineHeight: 1,
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
              >↺</button>
            )}

            {/* Maximize / Restore */}
            <button
              onClick={() => setIsMaximized((v) => !v)}
              title={isMaximized ? 'Restore' : 'Maximize'}
              aria-label={isMaximized ? 'Restore chat size' : 'Maximize chat'}
              style={{
                background: 'transparent', border: '1px solid #e2e8f0',
                borderRadius: 7, width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#64748b', fontSize: 13, lineHeight: 1,
                transition: 'all 0.15s ease', flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = '#f1f5f9'; el.style.borderColor = '#cbd5e1'; el.style.color = '#0f172a';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'transparent'; el.style.borderColor = '#e2e8f0'; el.style.color = '#64748b';
              }}
            >
              {isMaximized ? '⊡' : '⊞'}
            </button>

            {/* Close */}
            <button onClick={() => setIsOpen(false)} aria-label="Close chat" style={{
              background: 'transparent', border: '1px solid #e2e8f0',
              borderRadius: 7, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#64748b', fontSize: 15, lineHeight: 1,
              transition: 'all 0.15s ease', flexShrink: 0,
            }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = '#fef2f2'; el.style.borderColor = '#fecaca'; el.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'transparent'; el.style.borderColor = '#e2e8f0'; el.style.color = '#64748b';
              }}
            >✕</button>
          </div>

          {/* Messages / Empty State */}
          <div className="chat-messages-scroll" style={{
            flex: 1, overflowY: 'auto',
            padding: hasMessages ? '14px 14px 4px' : 0,
            display: 'flex', flexDirection: 'column',
            background: '#ffffff',
          }}>
            {!hasMessages ? (
              <EmptyState onSuggestion={sendMessage} />
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className="chat-msg-animate" style={{ animationDelay: `${Math.min(i * 25, 120)}ms` }}>
                    <MessageBubble message={msg} />
                  </div>
                ))}
                {pendingPick && (
                  <ResumePickerBubble
                    resumes={pendingPick.resumes}
                    onPick={pickResumeForSession}
                    disabled={isLoading}
                  />
                )}
                {isLoading && !pendingPick && <TypingIndicator />}
                <div ref={messagesEndRef} style={{ height: 4 }} />
              </>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{
              margin: '0 12px 8px',
              padding: '8px 12px',
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 8,
              fontSize: '0.775rem', color: '#dc2626', flexShrink: 0,
            }}>
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#dc2626', fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7,
              }}>✕</button>
            </div>
          )}

          {/* Input bar */}
          <div style={{
            padding: '10px 12px 12px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc', flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              background: '#ffffff', border: '1px solid #e2e8f0',
              borderRadius: 12, padding: '8px 8px 8px 14px',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            }}
              onFocusCapture={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = '#135bec';
                el.style.boxShadow = '0 0 0 3px rgba(19,91,236,0.1)';
              }}
              onBlurCapture={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = '#e2e8f0';
                el.style.boxShadow = 'none';
              }}
            >
              <textarea
                ref={inputRef}
                className="chat-input-area"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={pendingPick ? 'Pick a resume above to continue…' : 'Ask about your resume or jobs…'}
                rows={1}
                disabled={isLoading || !!pendingPick}
                aria-label="Chat message input"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  resize: 'none', fontSize: '0.875rem', color: '#0f172a',
                  lineHeight: 1.5, maxHeight: 100, overflowY: 'auto', fontFamily: 'inherit',
                }}
                onInput={(e) => {
                  const el = e.currentTarget as HTMLTextAreaElement;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading || !!pendingPick}
                aria-label="Send message"
                style={{
                  width: 34, height: 34, borderRadius: 9, border: 'none',
                  cursor: input.trim() && !isLoading && !pendingPick ? 'pointer' : 'not-allowed',
                  background: input.trim() && !isLoading && !pendingPick ? '#135bec' : '#e2e8f0',
                  color: input.trim() && !isLoading && !pendingPick ? '#fff' : '#94a3b8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.18s ease',
                  boxShadow: input.trim() && !isLoading ? '0 2px 8px rgba(19,91,236,0.35)' : 'none',
                  fontSize: 15,
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  if (!btn.disabled) { btn.style.background = '#0f4cc7'; btn.style.transform = 'scale(1.05)'; }
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  if (!btn.disabled) { btn.style.background = '#135bec'; btn.style.transform = 'scale(1)'; }
                }}
              >↑</button>
            </div>
            <p style={{ fontSize: '0.675rem', color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}

      {/* ── Floating Toggle Button ── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
        aria-expanded={isOpen}
        style={{
          position: 'fixed', bottom: isMobile ? 90 : 24, right: isMobile ? 16 : 24,
          width: 54, height: 54, borderRadius: '50%',
          border: 'none', cursor: 'pointer', zIndex: 10000,
          background: isOpen ? '#64748b' : '#135bec',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: isOpen ? 18 : 22,
          transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: isOpen
            ? '0 4px 16px rgba(0,0,0,0.2)'
            : '0 4px 16px rgba(19,91,236,0.5)',
          animation: isOpen ? 'none' : 'chatGlowPulse 2.5s ease-in-out infinite',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08) translateY(-2px)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1) translateY(0)'; }}
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </>
  );
}
