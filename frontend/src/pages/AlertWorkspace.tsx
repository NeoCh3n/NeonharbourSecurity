import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlanPage from './Plan';
import InvestigatePage from './Investigate';
import RespondPage from './Respond';
import ReportPage from './Report';
import ThreatHunterPage from './ThreatHunter';
import { alertsApi } from '../services/api';

type Tab = 'plan'|'investigate'|'respond'|'adapt'|'report'|'hunt';

export default function AlertWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const [alertId, setAlertId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('plan');
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    alertsApi.list().then(d => setAlerts(d.alerts || [])).catch(()=>{});
    const id = params.get('alertId') || '';
    const t = (params.get('tab') as Tab) || 'plan';
    if (id) setAlertId(id);
    setTab(t);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(params);
    if (alertId) p.set('alertId', alertId); else p.delete('alertId');
    p.set('tab', tab);
    setParams(p, { replace: true });
  }, [alertId, tab]);

  return (
    <div className="space-y-3">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-muted">Select Alert</label>
          <select className="px-2 py-1.5 border border-border rounded-md min-w-[260px]" value={alertId} onChange={e=>setAlertId(e.target.value)}>
            <option value="">— Select —</option>
            {alerts.map(a => (<option key={a.id} value={a.id}>{a.id} · {a.source} · {new Date(a.createdAt).toLocaleString()}</option>))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {(['plan','investigate','respond','report','hunt'] as Tab[]).map(t => (
            <button key={t} className={`px-3 py-1.5 border rounded-md ${tab===t?'bg-surfaceAlt border-border':''}`} onClick={()=>setTab(t)}>
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {!alertId && (
        <div className="bg-surface rounded-lg border border-border p-6 text-sm text-muted">Please select an alert to start (Plan / Investigate / Respond / Report / Hunt).</div>
      )}

      {alertId && (
        <div>
          {tab==='plan' && <PlanPage alertIdOverride={alertId} />}
          {tab==='investigate' && <InvestigatePage alertIdOverride={alertId} />}
          {tab==='respond' && <RespondPage alertIdOverride={alertId} />}
          {tab==='report' && <ReportPage />}
          {tab==='hunt' && <ThreatHunterPage />}
        </div>
      )}
    </div>
  );
}
