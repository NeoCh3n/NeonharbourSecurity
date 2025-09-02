import { useQuery } from '@tanstack/react-query';
import { ChartFrame, ChartSkeleton, downsample } from '../components/charts/ChartFrame';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useUI } from '../store/ui';

export default function DashboardPage() {
  const { data: kpi } = useQuery({
    queryKey: ['kpi'],
    queryFn: async () => {
      return {
        mtta: 5.4,
        mtti: 12.1,
        mttr: 38.7,
        backlog: 124,
        fpr: 0.07,
        throughput: 10.2
      };
    },
    placeholderData: {
      mtta: 0,
      mtti: 0,
      mttr: 0,
      backlog: 0,
      fpr: 0,
      throughput: 0
    }
  });
  const setRight = useUI(s => s.setRightPanelOpen);

  const trend = Array.from({ length: 180 }, (_, i) => ({ day: i + 1, alerts: Math.round(50 + Math.sin(i / 10) * 20 + Math.random() * 10) }));
  const types = [
    { type: 'Phishing', count: 120 },
    { type: 'Malware', count: 80 },
    { type: 'Credential Stuffing', count: 64 },
    { type: 'Data Exfiltration', count: 22 }
  ];

  return (
    <div className="space-y-4">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex items-center gap-2">
        <span className="text-sm text-muted">全局过滤：</span>
        <select aria-label="时间范围" className="border border-border rounded-md px-2 py-1 bg-surface text-text">
          <option>近 7 天</option>
          <option>近 30 天</option>
          <option>近 90 天</option>
        </select>
        <select aria-label="业务线" className="border border-border rounded-md px-2 py-1 bg-surface text-text">
          <option>全部业务</option>
        </select>
        <select aria-label="环境" className="border border-border rounded-md px-2 py-1 bg-surface text-text">
          <option>Prod</option>
          <option>Stage</option>
        </select>
        <button className="ml-auto px-3 py-1.5 border border-border rounded-md" onClick={() => setRight(true)}>打开情报侧栏</button>
      </section>

      <section className="grid grid-cols-12 gap-3">
        {[
          { label: 'MTTA', value: kpi?.mtta + ' min' },
          { label: 'MTTI', value: kpi?.mtti + ' min' },
          { label: 'MTTR', value: kpi?.mttr + ' min' },
          { label: 'Backlog', value: kpi?.backlog },
          { label: 'FPR', value: (kpi?.fpr ?? 0) * 100 + '%' },
          { label: 'Throughput', value: kpi?.throughput + 'x' }
        ].map((c, idx) => (
          <div key={idx} className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface rounded-lg border border-border p-3 shadow-sm">
            <div className="text-xs text-muted">{c.label}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-muted mt-1">点击可钻取至 Threat Hunter</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-7">
          <ChartFrame title="告警趋势（近 7/30 天）">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={downsample(trend, 2)}>
                <defs>
                  <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#60A5FA" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis width={40} />
                <Tooltip />
                <Area type="monotone" dataKey="alerts" stroke="#60A5FA" fillOpacity={1} fill="url(#colorAlerts)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <ChartFrame title="攻击类型分布">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={types}>
                <XAxis dataKey="type" tick={{ fontSize: 12 }} interval={0}/>
                <YAxis width={40}/>
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#2D6AE3" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </section>

      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm">
        <div className="text-sm text-muted mb-2">工作队列摘要（我负责 / 团队待办）</div>
        <div className="grid grid-cols-2 gap-3 text-sm text-muted">
          <div className="bg-surfaceAlt rounded-md p-3">我负责：12</div>
          <div className="bg-surfaceAlt rounded-md p-3">团队待办：34</div>
        </div>
      </section>
    </div>
  );
}

