import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = 'http://localhost:8000/api';

function App() {
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);
  const [approval, setApproval] = useState(null);
  const [events, setEvents] = useState([]);
  const abortRef = useRef(null);

  const load = async () => {
    const data = await fetch(`${API}/sessions`).then((r) => r.json());
    setSessions(data);
    if (!sid && data[0]) setSid(data[0].id);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (sid) {
      fetch(`${API}/sessions/${sid}/messages`).then((r) => r.json()).then(setMsgs);
    }
  }, [sid]);

  async function newSession() {
    const s = await fetch(`${API}/sessions`, { method: 'POST' }).then((r) => r.json());
    setSessions((x) => [s, ...x]);
    setSid(s.id);
    setMsgs([]);
  }

  async function send() {
    if (!input.trim() || running || !sid) return;
    const text = input;
    setInput('');
    setRunning(true);
    setEvents([]);
    setApproval(null);

    const controller = new AbortController();
    abortRef.current = controller;

    // Optimistically render the user's message. The canonical history is
    // refreshed from the backend when the run finishes.
    setMsgs((current) => [...current, { role: 'user', content: text }]);

    try {
      const response = await fetch(`${API}/sessions/${sid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(`Chat request failed: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamingAssistant = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const event = JSON.parse(part.slice(6));
          setEvents((current) => [...current, event]);
          if (event.run_id) setRun(event.run_id);

          if (event.type === 'assistant_delta') {
            streamingAssistant = true;
            setMsgs((current) => {
              const last = current[current.length - 1];
              if (last?.role === 'assistant' && last.streaming) {
                return [...current.slice(0, -1), { ...last, content: last.content + event.content }];
              }
              return [...current, { role: 'assistant', content: event.content, streaming: true }];
            });
          }

          if (event.type === 'approval_required') setApproval(event);

          if (event.type === 'run_completed' || event.type === 'run_failed' || event.type === 'run_cancelled') {
            setMsgs((current) => current.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
            streamingAssistant = false;
          }

          if (event.type === 'done') {
            setRunning(false);
            setRun(null);
            setApproval(null);
            fetch(`${API}/sessions/${sid}/messages`).then((r) => r.json()).then(setMsgs);
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setEvents((current) => [...current, { type: 'client_error', error: error.message }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  async function approve(action) {
    if (!approval) return;
    await fetch(`${API}/approvals/${approval.approval_id}?action=${action}`, { method: 'POST' });
    setApproval(null);
  }

  async function cancel() {
    if (run) await fetch(`${API}/runs/${run}/cancel`, { method: 'POST' });
  }

  return (
    <div className="app">
      <aside>
        <h2>Harness</h2>
        <button onClick={newSession}>+ New session</button>
        {sessions.map((s) => (
          <button className={s.id === sid ? 'sel' : ''} onClick={() => setSid(s.id)} key={s.id}>
            {s.title} <small>{s.status}</small>
          </button>
        ))}
      </aside>
      <main>
        <header><b>Personal Harness Agent</b><span>{running ? '● Running' : '● Idle'}</span></header>
        <section className="chat">
          {msgs.map((m, i) => (
            <div className={`msg ${m.role}`} key={i}>
              <b>{m.role}</b>
              <div>{m.content}</div>
            </div>
          ))}
          {events.filter((e) => e.type.startsWith('tool_')).map((e, i) => (
            <div className="event" key={i}>{e.type}: {e.tool || e.status || e.data || e.error || ''}</div>
          ))}
        </section>
        {approval && (
          <div className="approval">
            <b>Approval required</b>
            <p>{approval.reason}</p>
            <code>{approval.arguments?.command}</code>
            <div>
              <button onClick={() => approve('approve')}>Approve</button>
              <button onClick={() => approve('reject')}>Reject</button>
            </div>
          </div>
        )}
        <footer>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask your harness..." />
          <button onClick={send} disabled={running}>Send</button>
          {running && <button onClick={cancel}>Cancel</button>}
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
