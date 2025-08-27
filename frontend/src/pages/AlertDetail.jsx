import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { alertsApi } from '../services/api';

export default function AlertDetail() {
  const { id } = useParams();
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    alertsApi.get(id)
      .then(data => setAlert(data))
      .catch(err => console.error('Failed to load alert', err));
  }, [id]);

  const handleExport = () => {
    window.print();
  };

  const sendFeedback = async fb => {
    await alertsApi.feedback(id, fb);
    alert(`Feedback submitted: ${fb}`);
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
        {alert.evidence.map((e, idx) => {
          const label = e.type || 'evidence';
          let detail = '';
          if (e.type === 'virustotal') {
            const intel = e.data || {};
            const malicious = intel?.malicious ?? intel?.data?.attributes?.last_analysis_stats?.malicious;
            detail = `${e.indicator || ''} - malicious: ${malicious ?? 'n/a'}`;
          } else if (typeof e.content === 'string') {
            detail = e.content;
          } else {
            detail = JSON.stringify(e);
          }
          return <li key={idx}>{label}: {detail}</li>;
        })}
      </ul>
      <button onClick={() => sendFeedback('accurate')}>✔️ Accurate Investigation</button>
      <button onClick={() => sendFeedback('inaccurate')}>❌ Inaccurate Investigation</button>
      <button onClick={handleExport}>导出 PDF</button>
    </div>
  );
}
