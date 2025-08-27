import React, { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input) return;
    const userMsg = { from: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    const token = localStorage.getItem('token');
    try {
      const resp = await fetch('http://localhost:3000/hunter/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ question: input, logs: [] })
      });
      const data = await resp.json();
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
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
