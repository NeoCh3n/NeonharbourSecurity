import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import apiRequest from '../services/api';

type CaseRow = { id: number; severity: string; status: string; owner?: string; alert_count: number; latest: string };

export default function CasesPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    apiRequest('/cases').then(d => setRows(d.cases || [])).catch((e:any)=>{
      if (e?.status === 401) {
        setError('Not signed in or token expired. Please sign in.');
      } else {
        setError(e?.message || 'Failed to load');
      }
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 shadow-sm flex items-center justify-between">
        <div className="font-semibold">Cases</div>
        <div className="text-sm text-muted">Aggregated deduplicated view</div>
      </div>
      {error && (
        <div className="text-danger text-sm flex items-center gap-2" role="alert">
          <span>{error}</span>
          {error.toLowerCase().includes('sign in') && (
            <button className="px-2 py-1 border border-border rounded-md" onClick={()=>navigate('/login')}>Go to Sign In</button>
          )}
        </div>
      )}
      <div className="bg-surface rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surfaceAlt">
            <tr>
              <th className="text-left px-3 py-2 border-b border-border">Case ID</th>
              <th className="text-left px-3 py-2 border-b border-border">Severity</th>
              <th className="text-left px-3 py-2 border-b border-border">Status</th>
              <th className="text-left px-3 py-2 border-b border-border">Alerts</th>
              <th className="text-left px-3 py-2 border-b border-border">Latest</th>
              <th className="text-left px-3 py-2 border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-3 py-2">{r.id}</td>
                <td className="px-3 py-2">{r.severity}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.alert_count}</td>
                <td className="px-3 py-2">{new Date(r.latest || Date.now()).toLocaleString()}</td>
                <td className="px-3 py-2 flex gap-2">
                  <Link to={`/cases/${r.id}`} className="px-2 py-1 border border-border rounded-md">View</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={6}>No cases</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
