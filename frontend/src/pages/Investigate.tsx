import { useMemo, useState } from 'react';
import { ChartFrame } from '../components/charts/ChartFrame';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Event = { ts: string; text: string; sev: 'Low'|'Medium'|'High' };

export default function InvestigatePage() {
  const [timeline] = useState<Event[]>([
    { ts: new Date(Date.now()-60*60*1000).toISOString(), text: '成功登录 azure – alice', sev: 'Low' },
    { ts: new Date(Date.now()-55*60*1000).toISOString(), text: '非常规地点登录 – 香港 -> 新加坡', sev: 'Medium' },
    { ts: new Date(Date.now()-50*60*1000).toISOString(), text: '主机 hk-core-srv-12 执行 powershell.exe', sev: 'High' },
    { ts: new Date(Date.now()-48*60*1000).toISOString(), text: '可疑外联到 203.0.113.5:443', sev: 'Medium' },
  ]);
  const [qna, setQna] = useState<{q: string; a?: string; evidence?: any}[]>([
    { q: '用户是否近期异常登录？', a: '在 55 分钟前出现非常规地点登录。' },
  ]);

  const exfilData = useMemo(() => (
    [
      { name: 'GET', value: 12 },
      { name: 'POST', value: 4 },
      { name: 'PUT', value: 1 },
      { name: 'DELETE', value: 0 }
    ]
  ), []);

  function digDeeper() {
    setQna(prev => ([...prev, { q: 'Dig Deeper: 最近 2 小时同用户是否有提权事件？', a: '发现 1 次管理员组成员查询，暂无直接提权证据。' }]));
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
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={digDeeper}>Dig Deeper</button>
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
        </div>
      </div>
      <div className="col-span-12 lg:col-span-3 space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">潜在外泄动作</div>
          <div style={{ height: 160 }}>
            <ChartFrame title="HTTP Methods">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={exfilData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#60A5FA" />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">事件表格</div>
          <div className="text-sm text-muted">右侧区域用于呈现关键事件明细（可导出）。</div>
        </div>
      </div>
    </div>
  );
}
