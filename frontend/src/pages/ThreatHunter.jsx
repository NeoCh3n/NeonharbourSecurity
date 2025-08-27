import React, { useState } from 'react';
import { hunterApi } from '../services/api';

export default function ThreatHunter() {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState('');
  const [messages, setMessages] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input) return;
    const userMsg = { from: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    try {
      const data = await hunterApi.query(input, logs ? [logs] : []);
      const evidence = Array.isArray(data.evidence) && data.evidence[0]
        ? { type: 'log', content: data.evidence[0] }
        : null;
      const aiMsg = { from: 'ai', text: data.answer || '无响应', evidence };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const aiMsg = { from: 'ai', text: '请求失败', evidence: null };
      setMessages(prev => [...prev, aiMsg]);
    }
    setInput('');
    setLogs('');
  };

  return (
    <div>
      <h2>Threat Hunter</h2>
      <div>
        {messages.map((m, idx) => (
          <div key={idx}>
            <b>{m.from === 'user' ? 'You' : 'AI'}:</b> {m.text}
            {m.evidence && (
              <div style={{border:'1px solid #ccc', margin:'5px', padding:'5px'}}>
                Evidence: {m.evidence.content}
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask a question" />
        <textarea value={logs} onChange={e=>setLogs(e.target.value)} placeholder="Optional logs" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
