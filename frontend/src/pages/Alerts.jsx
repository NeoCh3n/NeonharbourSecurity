import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import sampleAlerts from '../sampleAlerts.js';

export default function Alerts() {
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const navigate = useNavigate();

  const filtered = sampleAlerts.filter(a =>
    (!statusFilter || a.status === statusFilter) &&
    (!severityFilter || a.severity === severityFilter)
  );

  return (
    <div>
      <h2>Alerts</h2>
      <div>
        <label>Status: </label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <label> Severity: </label>
        <select value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}>
          <option value="">All</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <table border="1">
        <thead>
          <tr>
            <th>ID</th>
            <th>Time</th>
            <th>Source</th>
            <th>Status</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(a => (
            <tr key={a.id} onClick={()=>navigate(`/alerts/${a.id}`)} style={{cursor:'pointer'}}>
              <td>{a.id}</td>
              <td>{new Date(a.time).toLocaleString()}</td>
              <td>{a.source}</td>
              <td>{a.status}</td>
              <td>{a.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
