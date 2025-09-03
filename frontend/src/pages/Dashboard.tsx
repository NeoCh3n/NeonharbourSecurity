import { useQuery } from '@tanstack/react-query';
import { ChartFrame, ChartSkeleton, downsample } from '../components/charts/ChartFrame';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useUI } from '../store/ui';
import { alertsApi, metricsApi } from '../services/api';

type TrendPoint = { day: string; alerts: number };

export default function DashboardPage() {
  const setRight = useUI(s => s.setRightPanelOpen);

  const metricsQ = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => metricsApi.get(),
  });

  const alertsQ = useQuery({
    queryKey: ['alerts-for-trend'],
    queryFn: async () => alertsApi.list(),
  });

  const unauthorized = (metricsQ.error as any)?.status === 401 || (alertsQ.error as any)?.status === 401;

  // Build last 30-day trend from alerts
  const trend: TrendPoint[] = (() => {
    const arr = alertsQ.data?.alerts || [];
    const byDay: Record<string, number> = {};
    arr.forEach((a: any) => {
      const d = new Date(a.createdAt);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    const days: string[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days.map(day => ({ day, alerts: byDay[day] || 0 }));
  })();

  const severityRows = (() => {
    const obj = metricsQ.data?.severityCounts || {};
    return Object.keys(obj).map(k => ({ name: k, count: obj[k] }));
  })();

  const statusRows = (() => {
    const obj = metricsQ.data?.statusCounts || {};
    return Object.keys(obj).map(k => ({ name: k, count: obj[k] }));
  })();

  const cards = [
    { label: 'Total Alerts', value: metricsQ.data?.totalAlerts ?? 0 },
    { label: 'Avg Analysis Time', value: (metricsQ.data?.avgAnalysisTime ?? 0) + ' ms' },
    { label: 'MTTI', value: formatMin(metricsQ.data?.mttiSec) },
    { label: 'MTTR', value: formatMin(metricsQ.data?.mttrSec) },
    { label: 'Investigated', value: metricsQ.data?.investigatedCount ?? 0 },
    { label: 'Feedback Score', value: (metricsQ.data?.feedbackScore ?? 0) + '%' },
  ];

  function formatMin(seconds?: number) {
    const s = Math.max(0, Math.round(seconds || 0));
    const m = (s / 60).toFixed(1);
    return `${m} min`;
  }

  return (
    <div className="space-y-4">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex items-center gap-2">
        <span className="text-sm text-muted">全局过滤：</span>
        <select aria-label="时间范围" className="border border-border rounded-md px-2 py-1 bg-surface text-text">
          <option>近 30 天</option>
          <option>近 7 天</option>
          <option>近 90 天</option>
        </select>
        <button className="ml-auto px-3 py-1.5 border border-border rounded-md" onClick={() => setRight(true)}>打开情报侧栏</button>
      </section>

      {unauthorized && (
        <div role="alert" className="bg-surface rounded-lg border border-border p-3 text-sm">
          未登录或令牌失效。请前往“验证/写入”完成登录：菜单 → 验证/写入。
        </div>
      )}

      <section className="grid grid-cols-12 gap-3">
        {cards.map((c, idx) => (
          <div key={idx} className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface rounded-lg border border-border p-3 shadow-sm">
            <div className="text-xs text-muted">{c.label}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-7">
          <ChartFrame title="告警趋势（近 30 天）">
            <ResponsiveContainer width="100%" height="100%">
              {alertsQ.isLoading ? (
                <ChartSkeleton />
              ) : (
                <AreaChart data={downsample(trend, 1)}>
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
              )}
            </ResponsiveContainer>
          </ChartFrame>
        </div>
        <div className="col-span-12 lg:col-span-5">
          <ChartFrame title="严重度分布">
            <ResponsiveContainer width="100%" height="100%">
              {metricsQ.isLoading ? (
                <ChartSkeleton />
              ) : (
                <BarChart data={severityRows}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0}/>
                  <YAxis width={40}/>
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#2D6AE3" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-6">
          <ChartFrame title="状态分布">
            <ResponsiveContainer width="100%" height="100%">
              {metricsQ.isLoading ? (
                <ChartSkeleton />
              ) : (
                <BarChart data={statusRows}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0}/>
                  <YAxis width={40}/>
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#90caf9" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </section>
    </div>
  );
}
