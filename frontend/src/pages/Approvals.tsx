import { useEffect, useState } from 'react';
import { approvalsApi } from '../services/api';

export default function ApprovalsPage() {
  const [inbox, setInbox] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const d = await approvalsApi.list();
      setInbox(d.inbox || []);
      setMine(d.mine || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load approvals');
    }
  }

  useEffect(() => { refresh(); }, []);

  async function approve(id: number) {
    setBusy(true);
    try { await approvalsApi.approve(id); await refresh(); } catch (e:any) { setError(e?.message || 'Approve failed'); } finally { setBusy(false); }
  }
  async function deny(id: number) {
    const reason = prompt('Reason for denial?') || '';
    setBusy(true);
    try { await approvalsApi.deny(id, reason); await refresh(); } catch (e:any) { setError(e?.message || 'Deny failed'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center justify-between">
        <div className="font-semibold">Approvals</div>
        <button className="px-2 py-1 border border-border rounded" onClick={refresh} disabled={busy}>Refresh</button>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-6 bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Inbox (Pending)</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surfaceAlt"><tr>
                <th className="text-left px-2 py-2 border-b border-border">ID</th>
                <th className="text-left px-2 py-2 border-b border-border">Action</th>
                <th className="text-left px-2 py-2 border-b border-border">Alert</th>
                <th className="text-left px-2 py-2 border-b border-border">Reason</th>
                <th className="text-left px-2 py-2 border-b border-border">Ops</th>
              </tr></thead>
              <tbody>
                {inbox.map((r:any)=> (
                  <tr key={r.id} className="border-b border-border">
                    <td className="px-2 py-2">{r.id}</td>
                    <td className="px-2 py-2">{r.action}</td>
                    <td className="px-2 py-2">{r.alert_id}</td>
                    <td className="px-2 py-2">{r.reason || '-'}</td>
                    <td className="px-2 py-2 flex gap-2">
                      <button className="px-2 py-1 border border-border rounded" onClick={()=>approve(r.id)} disabled={busy}>Approve</button>
                      <button className="px-2 py-1 border border-border rounded" onClick={()=>deny(r.id)} disabled={busy}>Deny</button>
                    </td>
                  </tr>
                ))}
                {!inbox.length && <tr><td className="px-2 py-4 text-muted" colSpan={5}>No pending approvals</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">My Requests</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surfaceAlt"><tr>
                <th className="text-left px-2 py-2 border-b border-border">ID</th>
                <th className="text-left px-2 py-2 border-b border-border">Action</th>
                <th className="text-left px-2 py-2 border-b border-border">Status</th>
                <th className="text-left px-2 py-2 border-b border-border">Updated</th>
              </tr></thead>
              <tbody>
                {mine.map((r:any)=> (
                  <tr key={r.id} className="border-b border-border">
                    <td className="px-2 py-2">{r.id}</td>
                    <td className="px-2 py-2">{r.action}</td>
                    <td className="px-2 py-2">{r.status}</td>
                    <td className="px-2 py-2">{r.decided_at ? new Date(r.decided_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {!mine.length && <tr><td className="px-2 py-4 text-muted" colSpan={4}>No requests</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

