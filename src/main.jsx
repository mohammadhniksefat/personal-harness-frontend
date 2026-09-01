import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const EVENT_LABELS = {
  run_started: 'Run started',
  tool_requested: 'Tool requested',
  tool_started: 'Tool started',
  tool_output: 'Tool output',
  tool_finished: 'Tool finished',
  tool_failed: 'Tool failed',
  approval_required: 'Approval required',
  run_completed: 'Run completed',
  run_failed: 'Run failed',
  run_cancelled: 'Run cancelled',
  client_error: 'Client error',
};

function Icon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    stop: <><rect x="6" y="6" width="12" height="12" rx="2" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 16V5a2 2 0 0 1 2-2h9" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
    bot: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M9 7V5a3 3 0 0 1 6 0v2M9 13h.01M15 13h.01M9 16h6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function formatEvent(event) {
  if (event.type === 'tool_requested') return `${event.tool || 'tool'} requested`;
  if (event.type === 'tool_started') return `${event.tool || 'Tool'} started`;
  if (event.type === 'tool_finished') return `Execution ${event.status || 'finished'}`;
  if (event.type === 'tool_failed') return event.error || 'Tool failed';
  if (event.type === 'tool_output') return typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  if (event.type === 'approval_required') return event.reason || 'Approval required';
  if (event.error) return event.error;
  return EVENT_LABELS[event.type] || event.type;
}

function Message({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <article className={`message message--${message.role} ${message.streaming ? 'message--streaming' : ''}`}>
      <div className="message__avatar">
        {isUser ? 'Y' : isTool ? 'T' : <Icon name="bot" />}
      </div>
      <div className="message__body">
        <div className="message__meta">
          <span>{isUser ? 'You' : isTool ? 'Tool' : 'Harness'}</span>
          {!isUser && !isTool && <span className="message__badge">Agent</span>}
          <button className="icon-button icon-button--tiny" onClick={copy} title="Copy message" aria-label="Copy message">
            <Icon name="copy" />
          </button>
          {copied && <span className="copied">Copied</span>}
        </div>
        <div className="message__content">{message.content || ''}{message.streaming && <span className="cursor" />}</div>
      </div>
    </article>
  );
}

function App() {
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);
  const [approval, setApproval] = useState(null);
  const [events, setEvents] = useState([]);
  const [sessionQuery, setSessionQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const conversationRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  const selectedSession = sessions.find((s) => s.id === sid);
  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => `${s.title} ${s.status}`.toLowerCase().includes(q));
  }, [sessions, sessionQuery]);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch(`${API}/sessions`);
      if (!response.ok) throw new Error(`Failed to load sessions (${response.status})`);
      const data = await response.json();
      setSessions(data);
      setSid((current) => current || data[0]?.id || null);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`${API}/sessions/${sessionId}/messages`);
      if (!response.ok) throw new Error(`Failed to load conversation (${response.status})`);
      setMsgs(await response.json());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!sid) {
      setMsgs([]);
      return;
    }
    setEvents([]);
    loadMessages(sid);
    setSidebarOpen(false);
  }, [sid, loadMessages]);

  useEffect(() => {
    const container = conversationRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [msgs, events, approval]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        textareaRef.current?.focus();
      }
      if (event.key === 'Escape' && sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  async function newSession() {
    try {
      const response = await fetch(`${API}/sessions`, { method: 'POST' });
      if (!response.ok) throw new Error(`Could not create session (${response.status})`);
      const session = await response.json();
      setSessions((current) => [session, ...current]);
      setSid(session.id);
      setMsgs([]);
      setEvents([]);
      setInput('');
      setError('');
      setSidebarOpen(false);
      textareaRef.current?.focus();
    } catch (e) {
      setError(e.message);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || running || !sid) return;

    setInput('');
    setRunning(true);
    setSending(true);
    setError('');
    setEvents([]);
    setApproval(null);

    const controller = new AbortController();
    abortRef.current = controller;

    setMsgs((current) => [...current, { role: 'user', content: text }]);

    try {
      const response = await fetch(`${API}/sessions/${sid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;

          let event;
          try {
            event = JSON.parse(part.slice(6));
          } catch {
            continue;
          }

          setEvents((current) => [...current, event]);
          if (event.run_id) setRun(event.run_id);

          if (event.type === 'assistant_delta') {
            setMsgs((current) => {
              const last = current[current.length - 1];
              if (last?.role === 'assistant' && last.streaming) {
                return [...current.slice(0, -1), { ...last, content: last.content + event.content }];
              }
              return [...current, { role: 'assistant', content: event.content, streaming: true }];
            });
          }

          if (event.type === 'approval_required') setApproval(event);

          if (['run_completed', 'run_failed', 'run_cancelled'].includes(event.type)) {
            setMsgs((current) => current.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
          }

          if (event.type === 'done') {
            setRun(null);
            setApproval(null);
            await loadMessages(sid);
            await loadSessions();
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message);
        setEvents((current) => [...current, { type: 'client_error', error: e.message }]);
      }
    } finally {
      setRunning(false);
      setSending(false);
      abortRef.current = null;
      setRun(null);
    }
  }

  async function approve(action) {
    if (!approval) return;
    try {
      const response = await fetch(`${API}/approvals/${approval.approval_id}?action=${action}`, { method: 'POST' });
      if (!response.ok) throw new Error(`Approval request failed (${response.status})`);
      setApproval(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function cancel() {
    try {
      if (run) await fetch(`${API}/runs/${run}/cancel`, { method: 'POST' });
      abortRef.current?.abort();
    } catch (e) {
      setError(e.message);
    }
  }

  function clearEvents() {
    setEvents([]);
  }

  const toolEvents = events.filter((event) => event.type.startsWith('tool_') || event.type === 'approval_required');
  const hasConversation = msgs.length > 0;

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop--visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <div className="brand-mark"><Icon name="activity" /></div>
          <div>
            <strong>Personal Harness</strong>
            <span>Agent workspace</span>
          </div>
          <button className="icon-button sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <Icon name="x" />
          </button>
        </div>

        <button className="new-session" onClick={newSession}>
          <Icon name="plus" />
          <span>New session</span>
          <kbd>Ctrl K</kbd>
        </button>

        <label className="session-search">
          <Icon name="search" />
          <input value={sessionQuery} onChange={(e) => setSessionQuery(e.target.value)} placeholder="Search sessions..." />
        </label>

        <div className="session-list">
          <div className="session-list__label">Sessions <span>{sessions.length}</span></div>
          {loading ? (
            <div className="skeleton-list">{[1, 2, 3].map((x) => <div className="skeleton-session" key={x} />)}</div>
          ) : filteredSessions.length ? filteredSessions.map((session) => (
            <button
              className={`session-item ${session.id === sid ? 'session-item--selected' : ''}`}
              onClick={() => setSid(session.id)}
              key={session.id}
            >
              <span className={`session-dot session-dot--${session.status}`} />
              <span className="session-item__body">
                <strong>{session.title || 'Untitled session'}</strong>
                <small>{session.status || 'idle'}</small>
              </span>
              {session.id === sid && <Icon name="chevron" />}
            </button>
          )) : (
            <div className="empty-sessions">No sessions found.</div>
          )}
        </div>

        <div className="sidebar__footer">
          <span className="connection-dot" />
          <span>API connected</span>
          <button className="icon-button" onClick={loadSessions} title="Refresh sessions" aria-label="Refresh sessions">
            <Icon name="refresh" />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <span className="menu-lines"><i /><i /><i /></span>
            </button>
            <div>
              <div className="topbar__eyebrow">WORKSPACE</div>
              <h1>{selectedSession?.title || 'Personal Harness Agent'}</h1>
            </div>
          </div>
          <div className="topbar__right">
            <div className={`run-status ${running ? 'run-status--running' : ''}`}>
              <span className="status-pulse" />
              {running ? 'Running' : 'Ready'}
            </div>
            <button className="icon-button" onClick={() => sid && loadMessages(sid)} title="Refresh conversation" aria-label="Refresh conversation">
              <Icon name="refresh" />
            </button>
          </div>
        </header>

        <section className="conversation" ref={conversationRef}>
          <div className="conversation__inner">
            {!hasConversation && !loading ? (
              <div className="welcome">
                <div className="welcome__icon"><Icon name="bot" /></div>
                <span className="welcome__label">PERSONAL HARNESS</span>
                <h2>What should we work on?</h2>
                <p>Give your harness a task. It can reason, use tools, stream progress, and pause when an action needs your approval.</p>
                <div className="suggestions">
                  {['Inspect the project structure', 'Explain the current architecture', 'Check the development setup'].map((suggestion) => (
                    <button key={suggestion} onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {msgs.map((message, index) => <Message message={message} key={message.id || `${message.role}-${index}`} />)}
                {running && !msgs.some((m) => m.streaming) && (
                  <div className="thinking">
                    <div className="thinking__avatar"><Icon name="bot" /></div>
                    <div className="thinking__bubble"><span /><span /><span /></div>
                    <small>Harness is working…</small>
                  </div>
                )}
              </>
            )}

            {toolEvents.length > 0 && (
              <div className="activity-panel">
                <div className="activity-panel__header">
                  <div><Icon name="activity" /><strong>Run activity</strong><span>{toolEvents.length} events</span></div>
                  <button onClick={clearEvents}>Clear</button>
                </div>
                <div className="activity-list">
                  {toolEvents.map((event, index) => (
                    <div className={`activity-item activity-item--${event.type}`} key={`${event.type}-${index}`}>
                      <span className="activity-item__marker" />
                      <div>
                        <strong>{event.tool || EVENT_LABELS[event.type] || event.type}</strong>
                        <p>{formatEvent(event)}</p>
                      </div>
                      <small>{index + 1}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="error-banner">
                <span>{error}</span>
                <button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="x" /></button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </section>

        {approval && (
          <div className="approval-overlay">
            <div className="approval-card" role="dialog" aria-modal="true">
              <div className="approval-card__icon"><Icon name="activity" /></div>
              <div className="approval-card__content">
                <div className="approval-card__eyebrow">ACTION REQUIRES APPROVAL</div>
                <h2>Allow this operation?</h2>
                <p>{approval.reason}</p>
                {approval.arguments?.command && (
                  <pre>{approval.arguments.command}</pre>
                )}
                <div className="approval-card__actions">
                  <button className="button button--danger" onClick={() => approve('reject')}><Icon name="x" /> Reject</button>
                  <button className="button button--primary" onClick={() => approve('approve')}><Icon name="check" /> Approve</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="composer">
          <div className="composer__inner">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={sid ? 'Ask your harness anything…' : 'Create a session to get started'}
              disabled={!sid || running}
              rows={1}
            />
            <div className="composer__bottom">
              <span>Enter to send · Shift + Enter for a new line</span>
              <div>
                {running ? (
                  <button className="send-button send-button--stop" onClick={cancel}><Icon name="stop" /> Stop</button>
                ) : (
                  <button className="send-button" onClick={send} disabled={!input.trim() || !sid || sending}><Icon name="send" /> Send</button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
