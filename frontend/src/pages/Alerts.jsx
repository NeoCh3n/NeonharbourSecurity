import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertsApi } from '../services/api';

export default function Alerts() {
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadAlerts = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await alertsApi.list();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to load alerts', err);
      setError(err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const filtered = alerts.filter(a =>
    (!statusFilter || a.status === statusFilter) &&
    (!severityFilter || a.severity === severityFilter)
  );

  if (loading) return <div>Loading alerts...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h2>Alerts</h2>
      <div style={{ marginBottom: '20px' }}>
        <label>Status: </label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="investigating">Investigating</option>
          <option value="needs_review">Needs Review</option>
          <option value="benign">Benign</option>
          <option value="closed">Closed</option>
        </select>
        <label> Severity: </label>
        <select value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}>
          <option value="">All</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button onClick={loadAlerts} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      {filtered.length === 0 ? (
        <p>No alerts found</p>
      ) : (
        <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
              <tr 
                key={a.id} 
                onClick={()=>navigate(`/alerts/${a.id}`)} 
                style={{cursor:'pointer', backgroundColor: a.severity === 'high' ? '#ffebee' : a.severity === 'medium' ? '#fff3e0' : 'transparent'}}
              >
                <td>{a.id}</td>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.source}</td>
                <td>{a.status}</td>
                <td>
                  <span style={{ 
                    color: a.severity === 'high' ? '#d32f2f' : a.severity === 'medium' ? '#f57c00' : '#388e3c',
                    fontWeight: 'bold'
                  }}>
                    {a.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
