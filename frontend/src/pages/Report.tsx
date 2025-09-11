import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiRequest from '../services/api';

export default function ReportPage({ alertIdOverride }: { alertIdOverride?: string } = {}) {
  const [params] = useSearchParams();
  const alertId = alertIdOverride || params.get('alertId') || '';
  const [detail, setDetail] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!alertId) return;
    setLoading(true); setError(''); setDetail(null);
    try {
      const d = await apiRequest(`/alerts/${alertId}`);
      setDetail(d);
    } catch (e:any) { setError(e?.message || 'Load failed'); } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [alertId]);

  function diffMin(a?: string, b?: string): string {
    if (!a || !b) return '—';
    const ms = new Date(a).getTime() - new Date(b).getTime();
    if (!isFinite(ms)) return '—';
    return (ms/60000).toFixed(1) + ' min';
  }

  return (
    <div className="space-y-3">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Alert Report{alertId ? ` #${alertId}` : ''}</div>
          <div className="text-xs text-muted">This report summarizes the selected alert only.</div>
        </div>
        {!alertId && <div className="text-sm text-muted mt-2">No alert selected. Pick one in Workspace.</div>}
      </section>

      {error && <div className="text-danger text-sm" role="alert">{error}</div>}

      {detail && (
        <>
          {/* KPIs for this alert */}
          <section className="grid grid-cols-12 gap-3">
            <Kpi title="Status" valueLabel={String(detail.status || '-')} />
            <Kpi title="Severity" valueLabel={String(detail.severity || '-')} />
            <Kpi title="MTTA" valueLabel={diffMin(detail.ack_time, detail.created_at)} hint="Ack time" />
            <Kpi title="MTTI" valueLabel={diffMin(detail.investigate_start, detail.created_at)} hint="Investigate start" />
            <Kpi title="MTTR" valueLabel={diffMin(detail.resolve_time, detail.created_at)} hint="Resolve time" />
            <Kpi title="Disposition" valueLabel={String(detail.disposition || '—')} />
          </section>

          {/* Summary & Timeline */}
          <section className="grid grid-cols-12 gap-3">
            <div className="col-span-12 lg:col-span-7">
              <div className="bg-surface rounded-lg border border-border p-3 mb-3">
                <div className="font-semibold mb-1">Summary</div>
                <div className="text-sm whitespace-pre-wrap">{detail.summary || '—'}</div>
              </div>
              <div className="bg-surface rounded-lg border border-border p-3">
                <div className="font-semibold mb-1">Timeline</div>
                {Array.isArray(detail.timeline) && detail.timeline.length ? (
                  <ul className="text-sm space-y-2">
                    {detail.timeline.map((t:any,i:number)=>(
                      <li key={i} className="flex items-start gap-2">
                        <div className="text-xs text-muted mt-0.5">{t.time || '-'}</div>
                        <div>{t.step || t.action || 'Event'} — {t.evidence || ''}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-muted">None</div>
                )}
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5 space-y-3">
              <div className="bg-surface rounded-lg border border-border p-3">
                <div className="font-semibold mb-1">Entities</div>
                <pre className="text-xs bg-surfaceAlt rounded-md p-2 overflow-auto max-h-[200px]">{JSON.stringify(detail.entities, null, 2)}</pre>
              </div>
              <div className="bg-surface rounded-lg border border-border p-3">
                <div className="font-semibold mb-1">MITRE ATT&CK</div>
                {detail.mitre ? (
                  <div className="text-xs text-muted">
                    <div>Tactics: {(detail.mitre.tactics||[]).slice(0,4).map((t:any)=>t.id||t.name).join(', ')||'—'}</div>
                    <div>Techniques: {(detail.mitre.techniques||[]).slice(0,6).map((t:any)=>t.id||t.name).join(', ')||'—'}</div>
                    {typeof detail.mitre.confidence==='number' && (<div>Confidence: {Math.round(detail.mitre.confidence*100)}%</div>)}
                  </div>
                ) : (<div className="text-sm text-muted">None</div>)}
              </div>
              <div className="bg-surface rounded-lg border border-border p-3">
                <div className="font-semibold mb-1">Audit Timestamps</div>
                <ul className="text-xs text-muted space-y-1">
                  <li>Created: {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</li>
                  <li>Ack: {detail.ack_time ? new Date(detail.ack_time).toLocaleString() : '—'}</li>
                  <li>Investigate: {detail.investigate_start ? new Date(detail.investigate_start).toLocaleString() : '—'}</li>
                  <li>Resolved: {detail.resolve_time ? new Date(detail.resolve_time).toLocaleString() : '—'}</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ title, valueLabel, hint }: { title: string; valueLabel?: string; hint?: string }) {
  return (
    <div className="col-span-12 md:col-span-6 lg:col-span-2 bg-surface rounded-lg border border-border p-3 shadow-sm">
      <div className="text-sm text-muted">{title}</div>
      <div className="text-3xl font-semibold">{valueLabel || '—'}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
