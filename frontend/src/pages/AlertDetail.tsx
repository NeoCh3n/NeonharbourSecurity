import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import apiRequest, { actionsApi, planApi } from '../services/api';

export default function AlertDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const [error, setError] = useState<string>('');
  const [actionMsg, setActionMsg] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<string>('');
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  const [reanalyzeMsg, setReanalyzeMsg] = useState('');
  const [autoTried, setAutoTried] = useState(false);
  const mitre = detail?.mitre || null;

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [d, p] = await Promise.all([
        apiRequest(`/alerts/${id}`),
        planApi.get(Number(id)).catch(() => null)
      ]);
      setDetail(d);
      setPlan(p);
      // Auto re-run analysis if previous attempt failed or summary missing (only once)
      const summaryText = String(d?.summary || '');
      if (!autoTried && (/^analysis failed/i.test(summaryText) || summaryText.trim().length === 0)) {
        setAutoTried(true);
        try { await reanalyze(); } catch {}
      }
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, [id]);

  async function reanalyze() {
    if (!id) return;
    setReanalyzeBusy(true);
    setReanalyzeMsg('');
    try {
      const r = await apiRequest(`/alerts/${id}/reanalyze`, { method: 'POST' });
      if (r?.success) {
        await loadAll();
        setReanalyzeMsg('Re-analysis completed');
        setTimeout(()=>setReanalyzeMsg(''), 2500);
      } else {
        setReanalyzeMsg('Re-analysis failed');
      }
    } catch (e:any) {
      setReanalyzeMsg(e?.message || 'Re-analysis failed');
    } finally {
      setReanalyzeBusy(false);
    }
  }

  async function toggleStep(stepId: string, done: boolean) {
    if (!id) return;
    try {
      const r = await planApi.update(Number(id), { stepId, done });
      setPlan({ ...(plan || {}), ...r });
    } catch (e: any) {
      setError(e?.message || '更新计划失败');
    }
  }

  async function requestAction(actionId: string) {
    if (!id) return;
    setActionMsg('');
    setPendingAction(actionId);
    try {
      const ok = window.confirm(`提交动作 ${actionId}，需审批，确认提交？`);
      if (!ok) { setPendingAction(''); return; }
      const r = await actionsApi.request(Number(id), actionId, 'Alert detail requested');
      setActionMsg(`已提交：${r.traceId}`);
    } catch (e: any) {
      setActionMsg('提交失败');
    } finally {
      setPendingAction('');
    }
  }

  const headerChips = useMemo(() => {
    const sev = detail?.severity || '-';
    const status = detail?.status || '-';
    const source = detail?.source || '-';
    return [
      { label: 'Severity', value: sev },
      { label: 'Status', value: status },
      { label: 'Source', value: source }
    ];
  }, [detail]);

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center gap-3 sticky top-0 z-10">
        <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>navigate('/alerts-list')}>Back to Alerts</button>
        <div className="font-semibold">Alert Detail #{id}</div>
        <div className="flex items-center gap-2 text-xs ml-2">
          {headerChips.map((c,i)=>(
            <span key={i} className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">{c.label}: {c.value}</span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link className="px-3 py-1.5 border border-border rounded-md btn-gradient" to={`/alert-workspace?alertId=${id}&tab=investigate`}>Start Investigate</Link>
          <Link className="px-3 py-1.5 border border-border rounded-md" to={`/alert-workspace?alertId=${id}`}>Open Workspace</Link>
        </div>
      </div>

      {error && <div className="text-danger text-sm" role="alert">{error}</div>}

      {loading && (
        <div className="grid grid-cols-12 gap-3 animate-pulse">
          <div className="col-span-12 lg:col-span-8 space-y-3">
            <div className="h-32 bg-surface rounded-lg border border-border" />
            <div className="h-48 bg-surface rounded-lg border border-border" />
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <div className="h-64 bg-surface rounded-lg border border-border" />
            <div className="h-40 bg-surface rounded-lg border border-border" />
          </div>
        </div>
      )}

      {!loading && detail && (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8 space-y-3">
            <section className="bg-surface rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold">Summary</div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 border border-border rounded-md" onClick={reanalyze} disabled={reanalyzeBusy}>{reanalyzeBusy ? 'Re-analyzing…' : 'Re-run Analysis'}</button>
                  {reanalyzeMsg && <div className="text-xs text-muted">{reanalyzeMsg}</div>}
                </div>
              </div>
              <div className="text-sm text-muted whitespace-pre-wrap">{detail.summary || '—'}</div>
            </section>

            <section className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold mb-2">Timeline</div>
              {Array.isArray(detail.timeline) && detail.timeline.length > 0 ? (
                <ul className="text-sm space-y-2">
                  {detail.timeline.map((t:any,i:number)=>(
                    <li key={i} className="flex items-start gap-2">
                      <div className="text-xs text-muted mt-0.5">{t.time || '-'}</div>
                      <div>{t.step || t.action || '事件'} – {t.evidence || ''}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">暂无</div>
              )}
            </section>

            <section className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold">Plan (AI generated)</div>
              {plan ? (
                <div className="mt-2">
                  <div className="text-sm text-muted">步骤 / Steps</div>
                  <ul>
                    {(plan.plan?.steps || []).map((s: any) => (
                      <li key={s.id} className="flex items-center gap-2 py-1 text-sm">
                        <input type="checkbox" checked={!!s.done} onChange={(e) => toggleStep(s.id, e.target.checked)} />
                        <span>{s.title}</span>
                        {s.required && <span className="text-xs text-warning">(必选)</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted mt-2">
                    <div>Ack: {plan.ack_time || '-'}</div>
                    <div>Investigate: {plan.investigate_start || '-'}</div>
                    <div>Resolve: {plan.resolve_time || '-'}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted">未加载计划</div>
              )}
            </section>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-3">
            <section className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold mb-1">Entities</div>
              <pre className="mt-1 p-2 bg-surfaceAlt rounded-md overflow-auto text-xs max-h-[260px]">{JSON.stringify(detail.entities, null, 2)}</pre>
            </section>

            <section className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold mb-2">MITRE ATT&CK</div>
              {mitre ? (
                <div className="text-sm">
                  {Array.isArray(mitre.tactics) && mitre.tactics.length>0 && (
                    <div className="mb-2">
                      <div className="text-muted text-xs">Tactics</div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {mitre.tactics.slice(0,4).map((t:any,i:number)=>(<span key={i} className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">{t.id || t.name} {t.confidence!=null?`(${Math.round(t.confidence*100)}%)`:''}</span>))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(mitre.techniques) && mitre.techniques.length>0 && (
                    <div>
                      <div className="text-muted text-xs">Techniques</div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {mitre.techniques.slice(0,6).map((t:any,i:number)=>(<span key={i} className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">{t.id || t.name} {t.confidence!=null?`(${Math.round(t.confidence*100)}%)`:''}</span>))}
                      </div>
                    </div>
                  )}
                  {mitre.rationale && <div className="text-xs text-muted mt-2">{mitre.rationale}</div>}
                </div>
              ) : (
                <div className="text-sm text-muted">No MITRE mapping.</div>
              )}
            </section>

            <section className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold mb-2">Recommendations</div>
              <div className="flex flex-wrap gap-2 text-sm">
                {(detail.recommendations || []).map((r: any) => (
                  <button key={r.id} className="px-2 py-1 border border-border rounded-md disabled:opacity-60" disabled={pendingAction===r.id} onClick={() => requestAction(r.id)}>
                    {pendingAction===r.id ? 'Submitting…' : r.title}
                  </button>
                ))}
              </div>
              {actionMsg && <div className="text-xs text-muted mt-2">{actionMsg}</div>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
