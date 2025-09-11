import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import apiRequest from '../services/api';

type CaseRow = { id: number; severity: string; status: string; owner?: string; alert_count: number; latest: string; context?: any };

export default function CasesPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [editingId, setEditingId] = useState<number|null>(null);
  const [briefDraft, setBriefDraft] = useState('');
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
              <th className="text-left px-3 py-2 border-b border-border">Brief</th>
              <th className="text-left px-3 py-2 border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="px-3 py-2">{r.id}</td>
                <td className="px-3 py-2">{r.severity}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.alert_count}</td>
                <td className="px-3 py-2">{new Date(r.latest || Date.now()).toLocaleString()}</td>
                <td className="px-3 py-2 w-[40%]">
                  {editingId===r.id ? (
                    <div className="flex items-start gap-2">
                      <textarea className="flex-1 px-2 py-1 border border-border rounded-md min-h-[60px]" value={briefDraft} onChange={e=>setBriefDraft(e.target.value)} maxLength={2000} />
                      <button className="px-2 py-1 border border-border rounded-md" onClick={async ()=>{
                        try {
                          const data = await apiRequest(`/cases/${r.id}/brief`, { method: 'POST', body: JSON.stringify({ brief: briefDraft }) });
                          const updated = rows.map(row => row.id===r.id ? { ...row, context: { ...(row.context||{}), brief: data.brief } } : row);
                          setRows(updated);
                          setEditingId(null);
                        } catch (e:any) {
                          alert(e?.message || 'Save failed');
                        }
                      }}>Save</button>
                      <button className="px-2 py-1 border border-border rounded-md" onClick={()=>{ setEditingId(null); setBriefDraft(''); }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-muted">{(r.context && r.context.brief) ? String(r.context.brief) : <span className="text-[11px]">No brief. Click Edit to add a short summary of scope, impact, and next steps.</span>}</div>
                  )}
                </td>
                <td className="px-3 py-2 flex gap-2">
                  <Link to={`/cases/${r.id}`} className="px-2 py-1 border border-border rounded-md">View</Link>
                  {editingId===r.id ? null : (
                    <button className="px-2 py-1 border border-border rounded-md" onClick={()=>{ setEditingId(r.id); setBriefDraft(String(r.context?.brief || '')); }}>Edit brief</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={7}>No cases</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
