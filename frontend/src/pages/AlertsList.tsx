import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { alertsApi } from '../services/api';
import apiRequest, { planApi, actionsApi } from '../services/api';

type Row = { id: number; createdAt: string; source: string; status: string; severity: string; assignedTo?: number|null };

export default function AlertsListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [params, setParams] = useSearchParams();
  const fParam = params.get('f');
  const [filter, setFilter] = useState<'all'|'me'|'unassigned'>(fParam === 'me' || fParam === 'unassigned' ? (fParam as any) : 'all');
  async function load() {
    try {
      const params: any = filter === 'all' ? {} : { assigned: filter === 'me' ? 'me' : 'unassigned' };
      const status = paramsFromUrl('status');
      const disp = paramsFromUrl('disposition');
      const escalated = paramsFromUrl('e') || paramsFromUrl('escalated');
      const handled = paramsFromUrl('handled');
      const severity = paramsFromUrl('severity');
      if (status) params.status = status;
      if (disp) params.disposition = disp;
      if (escalated) params.escalated = true;
      if (handled) params.handled = true;
      if (severity) params.severity = severity;
      const data = await alertsApi.queue(params);
      const list: Row[] = data.alerts || [];
      list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(list);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    }
  }
  function paramsFromUrl(key: string): string | null {
    const u = new URLSearchParams(window.location.search);
    return u.get(key);
  }
  useEffect(() => { void load(); }, [filter]);
  useEffect(() => { setParams({ f: filter }, { replace: true }); }, [filter]);
  useEffect(() => {
    // Sync state when URL param changes (e.g. via sidebar subnav)
    const v = fParam === 'me' ? 'me' : fParam === 'unassigned' ? 'unassigned' : 'all';
    setFilter(v);
  }, [fParam]);

  async function openDetail(id: number) {
    // Navigate to modern detail page; immediate route change provides timely feedback
    navigate(`/alerts/${id}`);
  }

  // detail interactions moved to the dedicated detail page for modern UI

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Triage</div>
          <div className="text-sm text-muted">Newest appear on top</div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <button
            aria-pressed={filter==='all'}
            className={`px-2 py-1 rounded-md border ${filter==='all' ? 'bg-primary text-primaryFg border-transparent' : 'border-border hover:bg-surfaceAlt'}`}
            onClick={()=>setFilter('all')}
          >All</button>
          <button
            aria-pressed={filter==='me'}
            className={`px-2 py-1 rounded-md border ${filter==='me' ? 'bg-primary text-primaryFg border-transparent' : 'border-border hover:bg-surfaceAlt'}`}
            onClick={()=>setFilter('me')}
          >Assigned to me</button>
          <button
            aria-pressed={filter==='unassigned'}
            className={`px-2 py-1 rounded-md border ${filter==='unassigned' ? 'bg-primary text-primaryFg border-transparent' : 'border-border hover:bg-surfaceAlt'}`}
            onClick={()=>setFilter('unassigned')}
          >Unassigned</button>
          <button className="ml-auto px-2 py-1 rounded-md border border-border hover:bg-surfaceAlt" onClick={()=>load()}>Refresh</button>
        </div>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      <div className="bg-surface rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surfaceAlt">
            <tr>
              <th className="text-left px-3 py-2 border-b border-border">ID</th>
              <th className="text-left px-3 py-2 border-b border-border">Time</th>
              <th className="text-left px-3 py-2 border-b border-border">Source</th>
              <th className="text-left px-3 py-2 border-b border-border">Status</th>
              <th className="text-left px-3 py-2 border-b border-border">Severity</th>
              <th className="text-left px-3 py-2 border-b border-border">Assigned</th>
              <th className="text-left px-3 py-2 border-b border-border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-3 py-2">{r.id}</td>
                <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{r.source}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.severity}</td>
                <td className="px-3 py-2">{r.assignedTo ? r.assignedTo : '-'}</td>
                <td className="px-3 py-2 flex gap-2">
                  <button className="px-2 py-1 border border-border rounded-md btn-gradient" onClick={() => openDetail(r.id)}>View</button>
                  <a className="px-2 py-1 border border-border rounded-md" href={`/alert-workspace?alertId=${r.id}`}>Workspace</a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={6}>No alerts</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted">Tip: Newest alerts are shown first. Refresh if you don't see recent data.</div>
      {/* Detailed view moved to dedicated page for modern UI with skeletons and actions */}
    </div>
  );
}
