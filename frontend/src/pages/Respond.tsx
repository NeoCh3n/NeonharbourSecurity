import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiRequest, { actionsApi } from '../services/api';

export default function RespondPage({ alertIdOverride }: { alertIdOverride?: string } = {}) {
  const [params] = useSearchParams();
  const [determination, setDetermination] = useState<'Malicious'|'Benign'|'Uncertain'>('Uncertain');
  const [severity, setSeverity] = useState<'Low'|'Medium'|'High'|'Critical'>('Medium');
  const [confidence, setConfidence] = useState(72);
  const [audit, setAudit] = useState<string[]>([
    'Analyst alice viewed evidence pack #123',
    'System linked similar case #77',
  ]);
  const [message, setMessage] = useState('');
  const [alertId, setAlertId] = useState<string>('');
  const [detail, setDetail] = useState<any | null>(null);

  async function requestAction(actionId: string) {
    try {
      // Example: require human approval – simulate via confirm()
      const ok = window.confirm(`Submit action "${actionId}" for approval?`);
      if (!ok) return;
      const idNum = alertId ? Number(alertId) : 0;
      const r = await actionsApi.request(idNum, actionId, 'UI requested');
      setMessage(`Submitted: ${r.traceId || 'trace-xxx'}`);
      setAudit(prev => [...prev, `Action request ${actionId} submitted (alert ${idNum || '-'})`]);
    } catch {
      setMessage('Submit failed');
    }
  }

  async function loadDetail() {
    setDetail(null);
    setMessage('');
    if (!alertId) return;
    try {
      const r = await apiRequest(`/alerts/${alertId}`);
      setDetail(r);
      setAudit(prev => [`Loaded alert ${alertId} details`, ...prev]);
    } catch (e: any) {
      setMessage(e?.message || 'Load failed');
    }
  }

  useEffect(() => {
    const q = alertIdOverride || params.get('alertId');
    if (q) setAlertId(q);
  }, [alertIdOverride, params]);

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-8 space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Overview</div>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <button className="px-3 py-1.5 border border-border rounded-md btn-gradient">Create Jira Issue</button>
              <div className="relative">
                <details>
                  <summary className="px-3 py-1.5 border border-border rounded-md cursor-pointer select-none">Actions ▾</summary>
                  <div className="absolute z-10 mt-1 bg-surface border border-border rounded-md p-2 w-[220px] shadow">
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('isolate-endpoint')}>Isolate endpoint</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('disable-account')}>Disable account</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('revoke-session')}>Revoke session</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('block-ip')}>Block IP</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('recall-email')}>Recall email</button>
                  </div>
                </details>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-end gap-2 text-sm">
            <div>
              <label className="block text-muted text-xs">Alert ID (for action audit)</label>
              <input className="px-2 py-1 border border-border rounded-md" value={alertId} onChange={e=>setAlertId(e.target.value)} placeholder="Optional: enter alert id" />
            </div>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={loadDetail}>Load Details</button>
            <div className="text-xs text-muted">Note: Actions trigger /actions to create an audit record.</div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted">Determination</div>
              <div className="text-xl font-semibold">{determination}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted">Severity</div>
              <div className="text-xl font-semibold">{severity}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted">Confidence</div>
              <div className="text-xl font-semibold">{confidence}%</div>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-muted">Rationale</div>
            <div className="text-sm">Based on evidence and similar cases, current determination is {determination}. Suggest minimal-risk actions and continued monitoring.</div>
          </div>
          {message && <div className="text-xs text-muted mt-2">{message}</div>}
        </div>

        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-1">Evidence & Timeline</div>
          <div className="text-sm text-muted">Expand to inspect evidence fragments, timeline nodes and sources.</div>
          {detail ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted">Entities</div>
                <pre className="mt-1 p-2 bg-surfaceAlt rounded-md overflow-auto text-xs">{JSON.stringify(detail.entities, null, 2)}</pre>
              </div>
              <div>
                <div className="text-muted">Timeline</div>
                <pre className="mt-1 p-2 bg-surfaceAlt rounded-md overflow-auto text-xs">{JSON.stringify(detail.timeline, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted mt-2">No alert loaded. Enter an Alert ID above.</div>
          )}
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4 space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Impacted Entities</div>
          <ul className="text-sm list-disc ml-5">
            <li>alice@corp</li>
            <li>hk-core-srv-12</li>
            <li>10.1.23.45</li>
          </ul>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">IOCs</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">203.0.113.5</span>
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">hash: e3b0…</span>
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Audit Log</div>
          <ul className="text-xs space-y-1">
            {audit.map((a,i)=>(<li key={i}>• {a}</li>))}
          </ul>
        </div>
      </div>
    </div>
  );
}
