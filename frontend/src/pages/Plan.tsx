import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiRequest, { alertsApi, planApi } from '../services/api';
import { useSearchParams } from 'react-router-dom';

type Step = { id: string; title: string; done?: boolean; required?: boolean };

export default function PlanPage({ alertIdOverride }: { alertIdOverride?: string } = {}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [alertId, setAlertId] = useState('');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // preload latest alerts for quick selection
    alertsApi.list().then(d => setAlerts(d.alerts || [])).catch(()=>{});
  }, []);

  // When override or URL param is present, adopt it and auto-load
  useEffect(() => {
    const urlId = params.get('alertId') || '';
    const id = alertIdOverride || urlId;
    if (id && id !== alertId) {
      setAlertId(id);
    }
  }, [alertIdOverride, params]);

  useEffect(() => {
    if (alertId && !plan) {
      void loadPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  async function loadPlan() {
    setError('');
    setLoading(true);
    setDetail(null);
    setPlan(null);
    try {
      const idNum = Number(alertId);
      const d = await apiRequest(`/alerts/${idNum}`);
      const p = await planApi.get(idNum);
      setDetail(d);
      setPlan(p);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function toggleStep(stepId: string, done: boolean) {
    if (!alertId) return;
    try {
      const r = await planApi.update(Number(alertId), { stepId, done });
      setPlan({ ...(plan || {}), ...r });
    } catch (e: any) {
      setError(e?.message || '更新计划失败');
    }
  }

  const questions: string[] = useMemo(() => (
    Array.isArray(plan?.plan?.questions) && plan.plan.questions.length
      ? plan.plan.questions
      : ['这是否为真实威胁还是误报？', '哪些资产受到影响？', '是否存在持久化/横向渗透迹象？']
  ), [plan]);

  const steps: Step[] = useMemo(() => (
    Array.isArray(plan?.plan?.steps) ? plan.plan.steps : []
  ), [plan]);

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        Plan：与具体告警绑定，问题与步骤由后端（AI分析辅助）生成。选择 Alert ID 载入后，可勾选步骤并保存笔记；点击“开始调查”进入 Investigate。
      </div>

      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex flex-wrap items-end gap-2">
        {alertIdOverride ? (
          <div className="text-sm">
            <span className="text-muted">Alert:</span> <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">{alertId}</span>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-muted">选择最近告警</label>
              <select className="px-2 py-1.5 border border-border rounded-md min-w-[220px]" value={alertId} onChange={e=>setAlertId(e.target.value)}>
                <option value="">— 选择 —</option>
                {alerts.map(a => (
                  <option key={a.id} value={a.id}>{a.id} · {a.source} · {new Date(a.createdAt).toLocaleString()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted">或手动输入 Alert ID</label>
              <input className="px-2 py-1.5 border border-border rounded-md" placeholder="如 123" value={alertId} onChange={e=>setAlertId(e.target.value)} />
            </div>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={loadPlan} disabled={!alertId || loading}>载入计划</button>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => navigate(`/investigate?alertId=${alertId}`)} disabled={!alertId}>开始调查</button>
          </>
        )}
        <div className="ml-auto text-xs text-muted">{loading ? 'Loading…' : (plan ? 'AI 生成 / 可编辑' : '未载入')}</div>
      </section>

      {error && <div className="text-danger text-sm" role="alert">{error}</div>}

      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-8 space-y-2">
          {questions.map((text, idx) => (
            <div key={idx} className="bg-surface rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{text}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${plan ? 'bg-[#0f172a] text-muted border border-border' : 'bg-surfaceAlt'}`}>{plan ? 'Ready' : 'Planning…'}</span>
              </div>
            </div>
          ))}
          {steps.length > 0 && (
            <div className="bg-surface rounded-lg border border-border p-3">
              <div className="text-muted text-sm mb-1">步骤 / Steps</div>
              <ul>
                {steps.map(s => (
                  <li key={s.id} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={!!s.done} onChange={e=>toggleStep(s.id, e.target.checked)} />
                    <span>{s.title}</span>
                    {s.required && <span className="text-xs text-warning">(必选)</span>}
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted mt-2">
                <div>Ack: {plan?.ack_time || '-'}</div>
                <div>Investigate: {plan?.investigate_start || '-'}</div>
                <div>Resolve: {plan?.resolve_time || '-'}</div>
              </div>
            </div>
          )}
        </div>
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-surface rounded-lg border border-border p-3">
            <div className="font-semibold mb-2">提取的实体</div>
            {detail ? (
              <pre className="text-xs bg-surfaceAlt rounded-md p-2 overflow-auto max-h-[240px]">{JSON.stringify(detail.entities, null, 2)}</pre>
            ) : (
              <div className="text-sm text-muted">未载入</div>
            )}
          </div>
          <div className="bg-surface rounded-lg border border-border p-3 mt-3">
            <div className="font-semibold mb-2">AI 建议 / Suggested Queries</div>
            {Array.isArray(plan?.plan?.suggestedQueries) ? (
              <ul className="text-sm list-disc ml-5">
                {plan.plan.suggestedQueries.map((q: any, i: number) => (<li key={i}>{q.source}: {q.query}</li>))}
              </ul>
            ) : (
              <div className="text-sm text-muted">暂无</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
