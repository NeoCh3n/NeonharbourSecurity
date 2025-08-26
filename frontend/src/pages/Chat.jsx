import React, { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input) return;
    const userMsg = { from: 'user', text: input };
    let reply = '我无法回答该问题';
    let evidence = null;
    if (input.includes('恶意 IP')) {
      reply = '未发现恶意 IP 连接。';
      evidence = { type: 'log', content: 'No suspicious IPs in logs' };
    } else {
      reply = '收到：' + input;
    }
    const aiMsg = { from: 'ai', text: reply, evidence };
    setMessages([...messages, userMsg, aiMsg]);
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
