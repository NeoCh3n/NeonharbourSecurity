import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChartFrame, ChartSkeleton, downsample } from '../components/charts/ChartFrame';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/datatable/DataTable';
import { useUI } from '../store/ui';
import { useNavigate } from 'react-router-dom';
import { alertsApi, metricsApi } from '../services/api';

type TrendPoint = { day: string; alerts: number };

export default function DashboardPage() {
  const setRight = useUI(s => s.setRightPanelOpen);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [sev, setSev] = useState<'all'|'critical'|'high'|'medium'|'low'>('all');
  const navigate = useNavigate();

  const metricsQ = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => metricsApi.get(),
  });

  const alertsQ = useQuery({
    queryKey: ['alerts-for-trend'],
    queryFn: async () => alertsApi.list(),
  });

  const unauthorized = (metricsQ.error as any)?.status === 401 || (alertsQ.error as any)?.status === 401;

  // Build last N-day trend from alerts
  const trend: TrendPoint[] = useMemo(() => {
    const arr = alertsQ.data?.alerts || [];
    const cutoff = Date.now() - rangeDays * 24 * 3600 * 1000;
    const byDay: Record<string, number> = {};
    arr
      .filter((a: any) => new Date(a.createdAt).getTime() >= cutoff)
      .filter((a: any) => sev === 'all' || String(a.severity || '').toLowerCase() === sev)
      .forEach((a: any) => {
        const d = new Date(a.createdAt);
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
      });
    const days: string[] = [];
    const now = new Date();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days.map(day => ({ day, alerts: byDay[day] || 0 }));
  }, [alertsQ.data, rangeDays]);

  const severityRows = useMemo(() => {
    // Range-limited severity based on alerts list for more immediate feedback
    const arr = alertsQ.data?.alerts || [];
    const cutoff = Date.now() - rangeDays * 24 * 3600 * 1000;
    const by: Record<string, number> = {};
    arr.filter((a:any)=> new Date(a.createdAt).getTime() >= cutoff)
      .filter((a:any)=> sev === 'all' || String(a.severity||'').toLowerCase() === sev)
      .forEach((a:any)=>{
      const k = a.severity || 'unknown';
      by[k] = (by[k] || 0) + 1;
    });
    return Object.keys(by).map(k => ({ name: k, count: by[k] }));
  }, [alertsQ.data, rangeDays]);

  // Note: status distribution available via metrics if needed for future panels

  // KPI hero values (clickable)
  const filteredArr = useMemo(() => {
    const arr = alertsQ.data?.alerts || [];
    const cutoff = Date.now() - rangeDays * 24 * 3600 * 1000;
    return arr.filter((a:any)=> new Date(a.createdAt).getTime() >= cutoff)
              .filter((a:any)=> sev==='all' || String(a.severity||'').toLowerCase() === sev);
  }, [alertsQ.data, rangeDays, sev]);
  const totalInvestigations = filteredArr.length;
  const handledCount = filteredArr.filter((a:any)=> a.status==='resolved' || a.status==='closed').length;
  const activeCount = filteredArr.filter((a:any)=> a.status!=='resolved' && a.status!=='closed').length;
  const escalatedCount = filteredArr.filter((a:any)=> !!a.escalated).length;
  const uncertainCount = filteredArr.filter((a:any)=> String(a.disposition||'')==='uncertain').length;

  // Simple N-day over previous-N-day delta from trend
  function pctDeltaFromTrend(points: TrendPoint[]): number {
    const n = rangeDays;
    if (!points || points.length < n * 2) return 0;
    const lastN = points.slice(-n).reduce((s, p) => s + (p.alerts || 0), 0);
    const prevN = points.slice(-(n * 2), -n).reduce((s, p) => s + (p.alerts || 0), 0);
    if (prevN === 0) return lastN > 0 ? 100 : 0;
    return ((lastN - prevN) / prevN) * 100;
  }
  const kpiDelta = pctDeltaFromTrend(trend);

  function formatMin(seconds?: number) {
    const s = Math.max(0, Math.round(seconds || 0));
    const m = (s / 60).toFixed(1);
    return `${m} min`;
  }

  // Alerts by source aggregation for the bottom-right panel
  const sourceRows = useMemo(() => {
    const arr = alertsQ.data?.alerts || [];
    const cutoff = Date.now() - rangeDays * 24 * 3600 * 1000;
    const by: Record<string, number> = {};
    arr.filter((a:any)=> new Date(a.createdAt).getTime() >= cutoff)
      .filter((a:any)=> sev === 'all' || String(a.severity||'').toLowerCase() === sev)
      .forEach((a: any) => {
      const key = a.source || 'unknown';
      by[key] = (by[key] || 0) + 1;
    });
    return Object.keys(by).map(k => ({ name: k, count: by[k] }));
  }, [alertsQ.data, rangeDays]);

  // Top 10 alerts table data (latest 10)
  type AlertRow = { id: number; createdAt: string; severity: string; source: string; status: string };
  const top10: AlertRow[] = (alertsQ.data?.alerts || [])
    .filter((a:any)=> sev==='all' || String(a.severity||'').toLowerCase() === sev)
    .slice(0, 10);
  const columns: ColumnDef<AlertRow, any>[] = [
    { accessorKey: 'id', header: 'ID', cell: info => info.getValue() },
    { accessorKey: 'createdAt', header: 'Created', cell: info => new Date(info.getValue()).toLocaleString() },
    { accessorKey: 'severity', header: 'Severity' },
    { accessorKey: 'source', header: 'Source' },
    { accessorKey: 'status', header: 'Status' },
  ];

  return (
    <div className="space-y-4">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted">Global filter:</span>
        <select
          aria-label="Time range"
          className="border border-border rounded-md px-2 py-1 bg-surface text-text"
          value={rangeDays}
          onChange={(e) => setRangeDays(parseInt(e.target.value, 10))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button className="ml-auto px-3 py-1.5 border border-border rounded-md" onClick={() => setRight(true)}>Open Intel Panel</button>
        <div className="w-full" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Severity:</span>
          <button aria-pressed={sev==='all'} className={`px-2 py-1 rounded-md border ${sev==='all'?'bg-primary text-primaryFg border-transparent':'border-border hover:bg-surfaceAlt'}`} onClick={()=>setSev('all')}>All</button>
          <button aria-pressed={sev==='critical'} className={`px-2 py-1 rounded-md border ${sev==='critical'?'bg-primary text-primaryFg border-transparent':'border-border hover:bg-surfaceAlt'}`} onClick={()=>setSev('critical')}>Critical</button>
          <button aria-pressed={sev==='high'} className={`px-2 py-1 rounded-md border ${sev==='high'?'bg-primary text-primaryFg border-transparent':'border-border hover:bg-surfaceAlt'}`} onClick={()=>setSev('high')}>High</button>
          <button aria-pressed={sev==='medium'} className={`px-2 py-1 rounded-md border ${sev==='medium'?'bg-primary text-primaryFg border-transparent':'border-border hover:bg-surfaceAlt'}`} onClick={()=>setSev('medium')}>Medium</button>
          <button aria-pressed={sev==='low'} className={`px-2 py-1 rounded-md border ${sev==='low'?'bg-primary text-primaryFg border-transparent':'border-border hover:bg-surfaceAlt'}`} onClick={()=>setSev('low')}>Low</button>
          <button className="ml-2 px-2 py-1 rounded-md border border-border hover:bg-surfaceAlt" onClick={()=>{
            const q = sev==='all' ? '' : `&severity=${sev}`;
            navigate(`/alerts-list?f=all${q}`);
          }}>Open Triage</button>
        </div>
      </section>

      {unauthorized && (
        <div role="alert" className="bg-surface rounded-lg border border-border p-3 text-sm">
          Not signed in or token expired. Please sign in via Menu → Data Sources.
        </div>
      )}

      {/* KPI cards (clickable) */}
      <section className="grid grid-cols-12 gap-3">
        <KpiCard
          className="col-span-12 md:col-span-3"
          title="Active"
          value={activeCount}
          hint={`${totalInvestigations} total`}
          onClick={() => navigate(`/alerts-list?f=all&active=1${sev==='all'?'':`&severity=${sev}`}`)}
          spark={buildSpark(alertsQ.data?.alerts || [], rangeDays, sev, { mode: 'active' })}
        />
        <KpiCard
          className="col-span-12 md:col-span-3"
          title="Handled"
          value={handledCount}
          hint={`${handledCount} resolved/closed`}
          onClick={() => navigate(`/alerts-list?f=all&handled=1${sev==='all'?'':`&severity=${sev}`}`)}
          spark={buildSpark(alertsQ.data?.alerts || [], rangeDays, sev, { mode: 'handled' })}
        />
        <KpiCard
          className="col-span-12 md:col-span-3"
          title="Escalated"
          value={escalatedCount}
          onClick={() => navigate(`/alerts-list?f=all&e=1${sev==='all'?'':`&severity=${sev}`}`)}
          spark={buildSpark(alertsQ.data?.alerts || [], rangeDays, sev, { mode: 'escalated' })}
        />
        <KpiCard
          className="col-span-12 md:col-span-3"
          title="Uncertain"
          value={uncertainCount}
          onClick={() => navigate(`/alerts-list?f=all&disposition=uncertain${sev==='all'?'':`&severity=${sev}`}`)}
          spark={buildSpark(alertsQ.data?.alerts || [], rangeDays, sev, { mode: 'uncertain' })}
        />
      </section>

      {/* 2x2 layout for core insights */}
      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-6">
          <ChartFrame title="Total Investigations" actions={<a className="text-xs underline" href="/alerts-list">View list</a>} height={260}>
            <ResponsiveContainer width="100%" height="100%">
              {alertsQ.isLoading ? (
                <ChartSkeleton />
              ) : (
                <LineChart data={downsample(trend, 1)}>
                  <XAxis dataKey="day" hide />
                  <YAxis width={40} />
                  <Tooltip />
                  <Line type="monotone" dataKey="alerts" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <ChartFrame title="Alerts by Source" actions={<a className="text-xs underline" href="/alerts-list">View list</a>} height={260}>
            <ResponsiveContainer width="100%" height="100%">
              {alertsQ.isLoading ? (
                <ChartSkeleton />
              ) : (
                <BarChart data={sourceRows}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0}/>
                  <YAxis width={40}/>
                  <Tooltip />
                  <Bar dataKey="count" fill="#2D6AE3" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <ChartFrame title="Ingested Alerts" actions={<a className="text-xs underline" href="/alerts-list">View list</a>} height={260}>
            <ResponsiveContainer width="100%" height="100%">
              {alertsQ.isLoading ? (
                <ChartSkeleton />
              ) : (
                <AreaChart data={downsample(trend, 1)}>
                  <defs>
                    <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.7}/>
                      <stop offset="95%" stopColor="#22D3EE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" hide />
                  <YAxis width={40} />
                  <Tooltip />
                  <Area type="monotone" dataKey="alerts" stroke="#22D3EE" fillOpacity={1} fill="url(#colorAlerts)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <section className="bg-surface rounded-lg border border-border p-3 shadow-sm">
            <div className="flex items-center mb-2">
              <div className="text-sm text-muted">Top 10 Alerts</div>
              <a className="ml-auto text-xs underline" href="/alerts-list">View list</a>
            </div>
            <DataTable columns={columns} data={top10} height={260} />
          </section>
        </div>
      </section>
    </div>
  );
}

type SparkPoint = { day: string; value: number };

function KpiCard({ title, value, hint, className = '', onClick, spark }: { title: string; value: number; hint?: string; className?: string; onClick?: () => void; spark?: SparkPoint[] }) {
  return (
    <div className={`${className} bg-surface rounded-lg border border-border p-4 shadow-sm cursor-pointer hover:bg-surfaceAlt transition`} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e)=>{ if (e.key==='Enter') onClick?.(); }}>
      <div className="text-sm text-muted mb-1 flex items-center gap-2">
        <span>{title}</span>
        {hint && <span className="ml-auto text-xs text-muted">{hint}</span>}
      </div>
      <div className="text-5xl leading-none font-semibold">{value}</div>
      {spark && spark.length > 1 && (
        <div className="mt-2 w-full h-[36px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={[0, 'auto']} />
              <Line type="monotone" dataKey="value" stroke="#6EE7B7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function buildSpark(alerts: any[], rangeDays: number, sev: 'all'|'critical'|'high'|'medium'|'low', { mode }: { mode: 'active'|'handled'|'escalated'|'uncertain' }): { day: string; value: number }[] {
  const cutoff = Date.now() - rangeDays * 24 * 3600 * 1000;
  const map: Record<string, number> = {};
  const days: string[] = [];
  const now = new Date();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).toISOString().slice(0, 10);
    days.push(d);
    map[d] = 0;
  }
  const filtered = (alerts || [])
    .filter((a:any)=> new Date(a.createdAt).getTime() >= cutoff)
    .filter((a:any)=> sev==='all' || String(a.severity||'').toLowerCase() === sev);
  for (const a of filtered) {
    const d = new Date(a.createdAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
    let ok = false;
    if (mode === 'handled') ok = (a.status === 'resolved' || a.status === 'closed');
    else if (mode === 'escalated') ok = !!a.escalated;
    else if (mode === 'uncertain') ok = String(a.disposition||'') === 'uncertain';
    else if (mode === 'active') ok = (a.status !== 'resolved' && a.status !== 'closed');
    if (ok) map[day] = (map[day] || 0) + 1;
  }
  return days.map(day => ({ day, value: map[day] || 0 }));
}
