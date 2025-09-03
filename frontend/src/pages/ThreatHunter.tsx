import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/datatable/DataTable';
import { downloadCSV, toCSV } from '../components/datatable/csv';
import { hunterApi } from '../services/api';
import { planApi } from '../services/api';

type AlertRow = {
  id: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  title: string;
  source: string;
  asset: string;
  tactic: string;
  firstSeen: string;
  lastSeen: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  owner: string;
  confidence: number;
  risk: number;
};

function genData(n = 1000): AlertRow[] {
  const severities = ['Low', 'Medium', 'High', 'Critical'] as const;
  const statuses = ['Open', 'In Progress', 'Resolved'] as const;
  const arr: AlertRow[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      id: 'AL-' + (100000 + i),
      severity: severities[i % 4],
      title: `Suspicious activity ${i}`,
      source: ['Sentinel', 'Splunk', 'Defender'][i % 3],
      asset: 'host-' + (i % 200),
      tactic: ['TA0001', 'TA0002', 'TA0003'][i % 3],
      firstSeen: new Date(Date.now() - i * 3600_000).toISOString(),
      lastSeen: new Date(Date.now() - i * 1800_000).toISOString(),
      status: statuses[i % 3],
      owner: ['alice', 'bob', 'carol'][i % 3],
      confidence: Math.round((50 + (i % 50)) / 10) * 10,
      risk: Math.min(100, (i % 100))
    });
  }
  return arr;
}

export default function ThreatHunterPage() {
  const [rows] = useState(() => genData(5000));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'results' | 'plan'>('results');
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState('');
  const [messages, setMessages] = useState<{ from: 'user'|'ai'; text: string; evidence?: any }[]>([]);
  const [assocAlertId, setAssocAlertId] = useState('');
  const [assocPlan, setAssocPlan] = useState<any | null>(null);
  const [lastFinding, setLastFinding] = useState<any | null>(null);

  const columns = useMemo<ColumnDef<AlertRow>[]>(() => [
    {
      id: 'select',
      header: () => <input aria-label="Select all" type="checkbox" onChange={(e) => {
        if (e.target.checked) setSelected(new Set(rows.map(r => r.id)));
        else setSelected(new Set());
      }} />,
      cell: ({ row }) => <input aria-label="Select row" type="checkbox" checked={selected.has(row.original.id)} onChange={(e) => {
        const cp = new Set(selected);
        if (e.target.checked) cp.add(row.original.id); else cp.delete(row.original.id);
        setSelected(cp);
      }} />,
      size: 40
    },
    {
      id: 'severity',
      header: 'Severity',
      cell: ({ row }) => {
        const color = row.original.severity === 'Critical' ? 'bg-danger' : row.original.severity === 'High' ? 'bg-warning' : row.original.severity === 'Medium' ? 'bg-info' : 'bg-success';
        return <div className="flex items-center gap-2"><div className={`w-1.5 h-5 rounded-sm ${color}`}></div>{row.original.severity}</div>;
      }
    },
    { id: 'id', header: 'Alert ID', cell: ({ row }) => row.original.id },
    { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
    { id: 'source', header: 'Source', cell: ({ row }) => row.original.source },
    { id: 'asset', header: 'Asset/User', cell: ({ row }) => row.original.asset },
    { id: 'tactic', header: 'Tactic/Technique', cell: ({ row }) => row.original.tactic },
    { id: 'firstSeen', header: 'First Seen', cell: ({ row }) => new Date(row.original.firstSeen).toLocaleString() },
    { id: 'lastSeen', header: 'Last Seen', cell: ({ row }) => new Date(row.original.lastSeen).toLocaleString() },
    { id: 'status', header: 'Status', cell: ({ row }) => row.original.status },
    { id: 'owner', header: 'Owner', cell: ({ row }) => row.original.owner },
    { id: 'confidence', header: 'Confidence', cell: ({ row }) => row.original.confidence },
    { id: 'risk', header: 'Risk Score', cell: ({ row }) => row.original.risk }
  ], [rows, selected]);

  const selectedRows = rows.filter(r => selected.has(r.id));

  async function runQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!input) return;
    const userMsg = { from: 'user' as const, text: input };
    setMessages(prev => [...prev, userMsg]);
    try {
      const data = await hunterApi.query(input, logs ? [logs] : []);
      const evidence = Array.isArray(data.evidence) && data.evidence[0]
        ? { type: 'log', content: data.evidence[0] }
        : null;
      const aiMsg = { from: 'ai' as const, text: data.answer || '无响应', evidence };
      setMessages(prev => [...prev, aiMsg]);
      setLastFinding({ answer: data.answer, evidence: data.evidence });
    } catch (err) {
      const aiMsg = { from: 'ai' as const, text: '请求失败', evidence: null };
      setMessages(prev => [...prev, aiMsg]);
    }
    setInput('');
    setLogs('');
  }

  async function loadPlan() {
    setAssocPlan(null);
    if (!assocAlertId) return;
    try {
      const r = await planApi.get(Number(assocAlertId));
      setAssocPlan(r);
    } catch (e) {
      setAssocPlan({ error: '加载失败' });
    }
  }

  async function saveFindingToPlan() {
    if (!assocAlertId || !lastFinding) return;
    try {
      const current = assocPlan?.plan || { steps: [], questions: [], notes: [] };
      const notes = Array.isArray(current.notes) ? current.notes.slice() : [];
      notes.push({ ts: new Date().toISOString(), answer: lastFinding.answer, evidence: (lastFinding.evidence || []).slice(0, 3) });
      const updated = { ...current, notes };
      const r = await planApi.update(Number(assocAlertId), { plan: updated });
      setAssocPlan({ ...(assocPlan || {}), plan: r.plan, ack_time: r.ack_time, investigate_start: r.investigate_start, resolve_time: r.resolve_time });
    } catch {}
  }

  return (
    <div className="space-y-3">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex flex-wrap items-center gap-2">
        <input className="px-3 py-1.5 rounded-md border border-border bg-surface text-text w-[360px]" placeholder="搜索 / Search" />
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Severity</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Status</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Source</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Asset</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Tactic/Technique</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Playbook Tag</option></select>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">已选 {selected.size} 条</span>
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => alert('批量指派 / Bulk Assign')}>指派</button>
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => alert('更改状态')}>改状态</button>
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => downloadCSV(toCSV(selectedRows), 'alerts.csv')}>导出 CSV</button>
        </div>
      </section>

      <div className="bg-surface rounded-lg border border-border">
        <div className="p-2 flex items-center gap-2 border-b border-border">
          <button className={`px-3 py-1.5 border rounded-md ${tab==='results'?'bg-surfaceAlt':''}`} onClick={()=>setTab('results')}>Results</button>
          <button className={`px-3 py-1.5 border rounded-md ${tab==='plan'?'bg-surfaceAlt':''}`} onClick={()=>setTab('plan')}>Plan</button>
        </div>
        {tab==='results' ? (
          <div className="p-3 space-y-3">
            <form className="flex flex-col gap-2" onSubmit={runQuery}>
              <input className="px-3 py-1.5 rounded-md border border-border bg-surface text-text" placeholder="输入问题 / Ask a question" value={input} onChange={e=>setInput(e.target.value)} />
              <textarea className="px-3 py-1.5 rounded-md border border-border bg-surface text-text" placeholder="可选日志 / Optional logs" value={logs} onChange={e=>setLogs(e.target.value)} />
              <div className="flex gap-2">
                <button className="px-3 py-1.5 border border-border rounded-md" type="submit">Run</button>
                {lastFinding && <span className="text-xs text-muted">最近结果可保存到 Plan</span>}
              </div>
            </form>
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div key={i} className="border border-border rounded-md p-2">
                  <div className="text-xs text-muted mb-1">{m.from === 'user' ? 'You' : 'AI'}</div>
                  <div>{m.text}</div>
                  {m.evidence && <pre className="mt-1 p-2 bg-surfaceAlt rounded-md overflow-auto text-xs">{JSON.stringify(m.evidence, null, 2)}</pre>}
                </div>
              ))}
            </div>
            <DataTable columns={columns} data={rows} height={360} />
          </div>
        ) : (
          <div className="p-3 space-y-2 text-sm">
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-muted text-xs">关联 Alert ID</label>
                <input className="px-2 py-1 border border-border rounded-md" value={assocAlertId} onChange={e=>setAssocAlertId(e.target.value)} placeholder="输入告警ID" />
              </div>
              <button className="px-3 py-1.5 border border-border rounded-md" onClick={loadPlan}>加载计划</button>
              <button disabled={!lastFinding || !assocPlan} className="px-3 py-1.5 border border-border rounded-md" onClick={saveFindingToPlan}>保存最近结果到计划</button>
            </div>
            {assocPlan ? (
              <div className="bg-surfaceAlt rounded-md p-2">
                <div className="text-muted">步骤</div>
                <ul className="list-disc ml-5">
                  {(assocPlan.plan?.steps || []).map((s:any)=>(<li key={s.id}>{s.title} {s.required && '(必选)'} {s.done? '✅':''}</li>))}
                </ul>
                {Array.isArray(assocPlan.plan?.notes) && assocPlan.plan.notes.length>0 && (
                  <>
                    <div className="text-muted mt-2">笔记 / Findings</div>
                    <ul className="list-disc ml-5">
                      {assocPlan.plan.notes.map((n:any,i:number)=>(<li key={i}>{new Date(n.ts).toLocaleString()} - {n.answer}</li>))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <div className="text-muted">未加载计划</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
