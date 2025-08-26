import React from 'react';
import { useParams } from 'react-router-dom';

const detailData = {
  1: {
    summary: 'Possible brute force attack detected',
    severity: 'high',
    timeline: [
      { step: 'Initial detection', time: '2024-04-01T00:00:00Z', action: 'Alert generated', evidence: 'Multiple login failures' },
      { step: 'IP reputation', time: '2024-04-01T00:05:00Z', action: 'Checked IP', evidence: 'Malicious IP found' }
    ],
    evidence: [
      { type: 'log', content: 'Failed login from 10.0.0.1' },
      { type: 'ip', content: 'VirusTotal score: 80' }
    ]
  },
  2: {
    summary: 'Suspicious file upload',
    severity: 'medium',
    timeline: [
      { step: 'File uploaded', time: '2024-04-01T01:00:00Z', action: 'User uploaded file', evidence: 'upload.exe' }
    ],
    evidence: [
      { type: 'log', content: 'upload.exe hashed to abc123' }
    ]
  }
};

export default function AlertDetail() {
  const { id } = useParams();
  const data = detailData[id] || { summary: 'N/A', severity: 'low', timeline: [], evidence: [] };

  const handleExport = () => {
    window.print();
  };

  return (
    <div>
      <h2>Alert {id} Detail</h2>
      <h3>AI Summary</h3>
      <p>{data.summary} (Severity: {data.severity})</p>
      <h3>Timeline</h3>
      <ul>
        {data.timeline.map((t, idx) => (
          <li key={idx}>{t.step} - {new Date(t.time).toLocaleString()} - {t.action} - {t.evidence}</li>
        ))}
      </ul>
      <h3>Evidence</h3>
      <ul>
        {data.evidence.map((e, idx) => (
          <li key={idx}>{e.type}: {e.content}</li>
        ))}
      </ul>
      <button onClick={()=>alert('Threat confirmed')}>确认威胁</button>
      <button onClick={()=>alert('Marked as false positive')}>误报</button>
      <button onClick={handleExport}>导出 PDF</button>
    </div>
  );
}
