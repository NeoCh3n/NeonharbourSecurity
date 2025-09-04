import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiRequest, { hunterApi } from '../services/api';
import { ChartFrame } from '../components/charts/ChartFrame';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Event = { ts: string; text: string; sev: 'Low'|'Medium'|'High' };

export default function InvestigatePage({ alertIdOverride }: { alertIdOverride?: string } = {}) {
  const [params] = useSearchParams();
  const alertId = alertIdOverride || params.get('alertId');
  const [timeline, setTimeline] = useState<Event[]>([
    { ts: new Date(Date.now()-60*60*1000).toISOString(), text: 'Successful login to Azure – alice', sev: 'Low' },
    { ts: new Date(Date.now()-55*60*1000).toISOString(), text: 'Atypical location login – HK -> SG', sev: 'Medium' },
    { ts: new Date(Date.now()-50*60*1000).toISOString(), text: 'Host hk-core-srv-12 ran powershell.exe', sev: 'High' },
    { ts: new Date(Date.now()-48*60*1000).toISOString(), text: 'Suspicious outbound to 203.0.113.5:443', sev: 'Medium' },
  ]);
  const [inv, setInv] = useState<{ summary?: string; evidence?: any[] } | null>(null);
  const [qna, setQna] = useState<{q: string; a?: string; evidence?: any}[]>([
    { q: '用户是否近期异常登录？', a: '在 55 分钟前出现非常规地点登录。' },
  ]);
  const [digging, setDigging] = useState(false);

  const exfilData = useMemo(() => (
    [
      { name: 'GET', value: 12 },
      { name: 'POST', value: 4 },
      { name: 'PUT', value: 1 },
      { name: 'DELETE', value: 0 }
    ]
  ), []);

  useEffect(() => {
    (async () => {
      if (!alertId) return;
      try {
        const r = await apiRequest(`/alerts/${alertId}/investigation`);
        const tl: Event[] = Array.isArray(r.timeline) ? r.timeline.map((t: any, i: number) => ({
          ts: t.time || new Date(Date.now() - (i+1) * 5 * 60_000).toISOString(),
          text: `${t.step || t.action || '事件'} - ${t.evidence || ''}`,
          sev: (i === 0 ? 'Low' : i === 1 ? 'Medium' : 'High')
        })) : [];
        if (tl.length) setTimeline(tl);
        setInv({ summary: r.summary, evidence: r.evidence });
      } catch {}
    })();
  }, [alertId]);

  async function digDeeper() {
    if (digging) return;
    setDigging(true);
    // Try AI to suggest a non-duplicate next question based on context; fallback to a rotating pool
    const logs: string[] = [];
    if (inv?.summary) logs.push(`SUMMARY: ${inv.summary}`);
    if (timeline.length) logs.push(`TIMELINE:\n${timeline.slice(0, 6).map(t => `${t.ts} ${t.text}`).join('\n')}`);

    const asked = new Set(qna.map(x => x.q));
    let nextQ = '';
    try {
      const prompt = `Given the context, propose a new, non-repeating next investigation question. Output only the question. Already asked: ${Array.from(asked).join(' | ')}`;
      const resp = await hunterApi.query(prompt, logs);
      nextQ = (resp?.answer || '').trim();
    } catch {}

    if (!nextQ || asked.has(nextQ)) {
      const pool = [
        'Any suspicious outbound to unusual geo or risky IPs?',
        'Does the host show anomalous processes or parent-child chains?',
        'Any multi-geo logins or repeated failures for the account?',
        'Any persistence indicators (scheduled tasks/registry/services)?',
        'Any bulk data exfiltration or abnormal volume spikes?',
        'Any newly created privileged accounts or group changes?',
        'Any similar historical cases in EDR/SIEM for this fingerprint?'
      ];
      const candidate = pool.find(q => !asked.has(q));
      nextQ = candidate || `${pool[0]} (${qna.length + 1})`;
    }

    let answer = '';
    let evidence: any = undefined;
    try {
      const res = await hunterApi.query(nextQ, logs);
      answer = (res?.answer || '').trim();
      if (Array.isArray(res?.evidence) && res.evidence[0]) {
        evidence = { type: 'log', content: res.evidence[0] };
      }
    } catch {}

    setQna(prev => ([...prev, { q: nextQ, a: answer, evidence }]));
    setDigging(false);
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        Investigate: Left timeline, center Q&A with summary, right charts/table. Use “Dig Deeper” to add context-aware questions.
      </div>
      <div className="col-span-12 lg:col-span-3 bg-surface rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">时间线</div>
        <ul className="text-sm space-y-2">
          {timeline.map((e, i) => (
            <li key={i} className="flex items-start gap-2">
              <div className={`mt-1 w-1.5 h-5 rounded-sm ${e.sev==='High'?'bg-warning':e.sev==='Medium'?'bg-info':'bg-success'}`}></div>
              <div>
                <div className="text-muted text-xs">{new Date(e.ts).toLocaleString()}</div>
                <div>{e.text}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="col-span-12 lg:col-span-6">
        <div className="bg-surface rounded-lg border border-border p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Q&A Cards</div>
            <button className="px-3 py-1.5 border border-border rounded-md disabled:opacity-60" disabled={digging} onClick={digDeeper}>{digging ? 'Thinking…' : 'Dig Deeper'}</button>
          </div>
          <div className="mt-2 space-y-2">
            {qna.map((it, i) => (
              <div key={i} className="border border-border rounded-md p-2">
                <div className="text-xs text-muted">Q: {it.q}</div>
                {it.a && <div className="mt-1">A: {it.a}</div>}
                {it.evidence && <pre className="text-xs bg-surfaceAlt rounded-md p-2 mt-1 overflow-auto">{JSON.stringify(it.evidence, null, 2)}</pre>}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-1">Summary</div>
          <div className="text-sm text-muted">Key findings after cross-source correlation.</div>
          {inv?.summary && <div className="mt-2 text-sm">{inv.summary}</div>}
          {inv?.evidence && <pre className="mt-2 text-xs bg-surfaceAlt rounded-md p-2 overflow-auto">{JSON.stringify(inv.evidence, null, 2)}</pre>}
        </div>
      </div>
      <div className="col-span-12 lg:col-span-3 space-y-3">
        <ChartFrame title="Potential Exfiltration (HTTP Methods)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={exfilData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#60A5FA" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Events Table</div>
          <div className="text-sm text-muted">Use this panel to render key event details and export.</div>
        </div>
      </div>
    </div>
  );
}
