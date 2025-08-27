import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function AlertDetail() {
  const { id } = useParams();
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`http://localhost:3000/alerts/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setAlert(data))
      .catch(err => console.error('Failed to load alert', err));
  }, [id]);

  const handleExport = () => {
    window.print();
  };

  const sendFeedback = async fb => {
    const token = localStorage.getItem('token');
    await fetch(`http://localhost:3000/alerts/${id}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ feedback: fb })
    });
    alert(`反馈已提交: ${fb}`);
  };

  if (!alert) return <div>Loading...</div>;

  return (
    <div>
      <h2>Alert {id} Detail</h2>
      <h3>AI Summary</h3>
      <p>{alert.summary} (Severity: {alert.severity})</p>
      <h3>Timeline</h3>
      <ul>
        {alert.timeline.map((t, idx) => (
          <li key={idx}>{t.step} - {new Date(t.time).toLocaleString()} - {t.action} - {t.evidence}</li>
        ))}
      </ul>
      <h3>Evidence</h3>
      <ul>
        {alert.evidence.map((e, idx) => (
          <li key={idx}>{e.type}: {e.content}</li>
        ))}
      </ul>
      <button onClick={() => sendFeedback('confirmed')}>确认威胁</button>
      <button onClick={() => sendFeedback('false_positive')}>误报</button>
      <button onClick={handleExport}>导出 PDF</button>
    </div>
  );
}
