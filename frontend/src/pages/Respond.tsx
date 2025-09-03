import { useState } from 'react';
import apiRequest, { actionsApi } from '../services/api';

export default function RespondPage() {
  const [determination, setDetermination] = useState<'Malicious'|'Benign'|'Uncertain'>('Uncertain');
  const [severity, setSeverity] = useState<'Low'|'Medium'|'High'|'Critical'>('Medium');
  const [confidence, setConfidence] = useState(72);
  const [audit, setAudit] = useState<string[]>([
    'Analyst alice 查看证据包 #123',
    'System 关联相似案例 #77',
  ]);
  const [message, setMessage] = useState('');
  const [alertId, setAlertId] = useState<string>('');
  const [detail, setDetail] = useState<any | null>(null);

  async function requestAction(actionId: string) {
    try {
      // Example: require human approval – simulate via confirm()
      const ok = window.confirm(`提交动作 ${actionId}，需审批，确认提交？`);
      if (!ok) return;
      const idNum = alertId ? Number(alertId) : 0;
      const r = await actionsApi.request(idNum, actionId, 'UI requested');
      setMessage(`已提交：${r.traceId || 'trace-xxx'}`);
      setAudit(prev => [...prev, `请求动作 ${actionId} 已提交 (alert ${idNum || '-'})`]);
    } catch {
      setMessage('提交失败');
    }
  }

  async function loadDetail() {
    setDetail(null);
    setMessage('');
    if (!alertId) return;
    try {
      const r = await apiRequest(`/alerts/${alertId}`);
      setDetail(r);
      setAudit(prev => [`载入告警 ${alertId} 详情`, ...prev]);
    } catch (e: any) {
      setMessage(e?.message || '加载失败');
    }
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-8 space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <div className="font-semibold">概览</div>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <button className="px-3 py-1.5 border border-border rounded-md">Create Jira Issue</button>
              <div className="relative">
                <details>
                  <summary className="px-3 py-1.5 border border-border rounded-md cursor-pointer select-none">Actions ▾</summary>
                  <div className="absolute z-10 mt-1 bg-surface border border-border rounded-md p-2 w-[220px] shadow">
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('isolate-endpoint')}>隔离端点</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('disable-account')}>禁用账号</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('revoke-session')}>撤销会话</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('block-ip')}>IP 封禁</button>
                    <button className="block w-full text-left px-2 py-1 hover:bg-surfaceAlt rounded" onClick={()=>requestAction('recall-email')}>邮件召回</button>
                  </div>
                </details>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-end gap-2 text-sm">
            <div>
              <label className="block text-muted text-xs">上下文 Alert ID（用于动作审计）</label>
              <input className="px-2 py-1 border border-border rounded-md" value={alertId} onChange={e=>setAlertId(e.target.value)} placeholder="可选：输入告警ID" />
            </div>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={loadDetail}>载入详情</button>
            <div className="text-xs text-muted">说明：提交 Actions 将调用 /actions 生成审计记录。</div>
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
            <div className="text-sm">基于证据链与历史相似案例，当前倾向判断为 {determination}，建议执行最小化风险动作并持续监控。</div>
          </div>
          {message && <div className="text-xs text-muted mt-2">{message}</div>}
        </div>

        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-1">证据与时间线</div>
          <div className="text-sm text-muted">可展开查看证据片段、时间线节点与来源。</div>
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
            <div className="text-xs text-muted mt-2">未载入具体告警。可在上方输入 Alert ID。</div>
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
