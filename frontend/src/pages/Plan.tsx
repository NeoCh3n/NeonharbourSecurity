import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Question = { id: string; text: string; status: 'planning' | 'ready'; answer?: string };

export default function PlanPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([
    { id: 'q1', text: '这是否为真实威胁还是误报？', status: 'planning' },
    { id: 'q2', text: '哪些资产受到影响？', status: 'planning' },
    { id: 'q3', text: '是否存在持久化/横向渗透迹象？', status: 'planning' },
  ]);
  const [entities] = useState<{ label: string; value: string }[]>([
    { label: 'User', value: 'alice@corp' },
    { label: 'IP', value: '10.1.23.45' },
    { label: 'Host', value: 'hk-core-srv-12' },
    { label: 'Session', value: 'sess-78af' },
    { label: 'Process', value: 'powershell.exe (pid 4920)' },
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuestions(prev => prev.map(q => ({ ...q, status: 'ready' })));
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        Plan：将告警摘要为关键问题与实体。问题卡会从“Planning…”过渡为“Ready”。点击“开始调查”进入 Investigate。
      </div>
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex items-center gap-2">
        <div className="text-sm text-muted">状态</div>
        <div className="px-2 py-0.5 text-xs rounded-full bg-surfaceAlt border border-border">Planning…</div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => navigate('/investigate')}>开始调查</button>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-8 space-y-2">
          {questions.map(q => (
            <div key={q.id} className="bg-surface rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{q.text}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${q.status==='planning' ? 'bg-surfaceAlt' : 'bg-[#0f172a] text-muted border border-border'}`}>{q.status==='planning' ? 'Planning…' : 'Ready'}</span>
              </div>
              {q.answer && (
                <div className="mt-2 text-sm">{q.answer}</div>
              )}
            </div>
          ))}
        </div>
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-surface rounded-lg border border-border p-3">
            <div className="font-semibold mb-2">提取的实体</div>
            <ul className="text-sm space-y-1">
              {entities.map((e, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-muted">{e.label}</span>
                  <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">{e.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface rounded-lg border border-border p-3 mt-3">
            <div className="font-semibold mb-2">调查计划</div>
            <ol className="list-decimal ml-5 text-sm space-y-1">
              <li>检查登录/会话是否异常</li>
              <li>回溯 24 小时内相关资产通信</li>
              <li>检索持久化与横向移动迹象</li>
              <li>汇总证据，进入 Respond 评估</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
