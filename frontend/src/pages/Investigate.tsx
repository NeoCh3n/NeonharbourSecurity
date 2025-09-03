import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiRequest, { hunterApi } from '../services/api';
import { ChartFrame } from '../components/charts/ChartFrame';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Event = { ts: string; text: string; sev: 'Low'|'Medium'|'High' };

export default function InvestigatePage() {
  const [params] = useSearchParams();
  const alertId = params.get('alertId');
  const [timeline, setTimeline] = useState<Event[]>([
    { ts: new Date(Date.now()-60*60*1000).toISOString(), text: '成功登录 azure – alice', sev: 'Low' },
    { ts: new Date(Date.now()-55*60*1000).toISOString(), text: '非常规地点登录 – 香港 -> 新加坡', sev: 'Medium' },
    { ts: new Date(Date.now()-50*60*1000).toISOString(), text: '主机 hk-core-srv-12 执行 powershell.exe', sev: 'High' },
    { ts: new Date(Date.now()-48*60*1000).toISOString(), text: '可疑外联到 203.0.113.5:443', sev: 'Medium' },
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
      const prompt = `基于以上上下文，提出一个全新的、未重复的下一步调查问题。只输出问题本身。已问：${Array.from(asked).join(' | ')}`;
      const resp = await hunterApi.query(prompt, logs);
      nextQ = (resp?.answer || '').trim();
    } catch {}

    if (!nextQ || asked.has(nextQ)) {
      const pool = [
        '是否存在可疑外联到非常规国家或高风险IP？',
        '当前主机是否出现异常进程或父子进程关系？',
        '账户是否在短时间内有多地登录或失败重试？',
        '是否有持久化机制（计划任务/注册表/服务）迹象？',
        '是否有批量文件外传或异常数据量峰值？',
        '是否有新建高权限账户或组成员变更？',
        'EDR/SIEM 中是否存在与该指纹相似的历史案例？'
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
        Investigate：左侧时间线，中部问答卡片与事件摘要，右侧图表/表格。可使用 “Dig Deeper” 追加问题或跨案联动。
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
            <div className="font-semibold">问答卡片</div>
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
          <div className="font-semibold mb-1">事件摘要</div>
          <div className="text-sm text-muted">跨源检索与关联后的关键事件摘要。</div>
          {inv?.summary && <div className="mt-2 text-sm">{inv.summary}</div>}
          {inv?.evidence && <pre className="mt-2 text-xs bg-surfaceAlt rounded-md p-2 overflow-auto">{JSON.stringify(inv.evidence, null, 2)}</pre>}
        </div>
      </div>
      <div className="col-span-12 lg:col-span-3 space-y-3">
        <ChartFrame title="潜在外泄动作（HTTP Methods）">
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
          <div className="font-semibold mb-2">事件表格</div>
          <div className="text-sm text-muted">右侧区域用于呈现关键事件明细（可导出）。</div>
        </div>
      </div>
    </div>
  );
}
