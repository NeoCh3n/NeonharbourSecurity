import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChartFrame, ChartSkeleton } from '../components/charts/ChartFrame';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Button } from '../components/ui/Button';
import { investigationsApi } from '../services/api';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function InvestigationMetricsPage() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState('7d');

  const statsQuery = useQuery({
    queryKey: ['investigation-stats', timeframe],
    queryFn: () => investigationsApi.getStats(timeframe),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const investigationsQuery = useQuery({
    queryKey: ['investigations-for-metrics'],
    queryFn: () => investigationsApi.list({ limit: 1000 }),
  });

  const stats = statsQuery.data?.summary || {};
  const distributions = statsQuery.data?.distributions || {};
  const investigations = investigationsQuery.data?.investigations || [];

  // Calculate trend data from investigations
  const trendData = useMemo(() => {
    if (!investigations.length) return [];

    const now = new Date();
    const days = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const byDay: Record<string, { total: number; completed: number; failed: number }> = {};
    
    // Initialize all days
    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = date.toISOString().split('T')[0];
      byDay[key] = { total: 0, completed: 0, failed: 0 };
    }

    // Aggregate investigations by day
    investigations
      .filter((inv: any) => new Date(inv.created_at) >= cutoff)
      .forEach((inv: any) => {
        const date = new Date(inv.created_at).toISOString().split('T')[0];
        if (byDay[date]) {
          byDay[date].total++;
          if (inv.status === 'complete') byDay[date].completed++;
          if (inv.status === 'failed') byDay[date].failed++;
        }
      });

    return Object.entries(byDay)
      .map(([date, counts]) => ({
        date,
        total: counts.total,
        completed: counts.completed,
        failed: counts.failed,
        successRate: counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [investigations, timeframe]);

  // Duration distribution
  const durationData = useMemo(() => {
    const durations = investigations
      .filter((inv: any) => inv.completed_at)
      .map((inv: any) => {
        const duration = new Date(inv.completed_at).getTime() - new Date(inv.created_at).getTime();
        return Math.round(duration / 60000); // Convert to minutes
      });

    const buckets = [
      { label: '< 1m', min: 0, max: 1 },
      { label: '1-5m', min: 1, max: 5 },
      { label: '5-15m', min: 5, max: 15 },
      { label: '15-30m', min: 15, max: 30 },
      { label: '30m+', min: 30, max: Infinity }
    ];

    return buckets.map(bucket => ({
      name: bucket.label,
      count: durations.filter(d => d >= bucket.min && d < bucket.max).length
    }));
  }, [investigations]);

  // Agent performance data
  const agentData = useMemo(() => {
    const agentStats: Record<string, { total: number; completed: number; failed: number; avgDuration: number }> = {};

    investigations.forEach((inv: any) => {
      // This would need to be enhanced with actual agent data from the timeline
      const agent = 'AI Agent'; // Placeholder - would come from investigation steps
      
      if (!agentStats[agent]) {
        agentStats[agent] = { total: 0, completed: 0, failed: 0, avgDuration: 0 };
      }
      
      agentStats[agent].total++;
      if (inv.status === 'complete') agentStats[agent].completed++;
      if (inv.status === 'failed') agentStats[agent].failed++;
      
      if (inv.completed_at) {
        const duration = new Date(inv.completed_at).getTime() - new Date(inv.created_at).getTime();
        agentStats[agent].avgDuration += duration / 60000; // Convert to minutes
      }
    });

    return Object.entries(agentStats).map(([agent, stats]) => ({
      agent,
      total: stats.total,
      successRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      avgDuration: stats.total > 0 ? Math.round(stats.avgDuration / stats.total) : 0
    }));
  }, [investigations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/investigations')}>
            ← Back to Investigations
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Investigation Metrics</h1>
            <p className="text-muted">Performance analytics and insights</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Timeframe:</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="border border-border rounded-md px-3 py-1 bg-surface text-text"
          >
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Total Investigations</div>
          <div className="text-3xl font-semibold">{stats.totalInvestigations || 0}</div>
          <div className="text-xs text-muted mt-1">
            {timeframe === '1d' ? 'Last 24 hours' : timeframe === '7d' ? 'Last 7 days' : 'Last 30 days'}
          </div>
        </div>
        
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Success Rate</div>
          <div className="text-3xl font-semibold text-green-600">{stats.successRate || 0}%</div>
          <div className="text-xs text-muted mt-1">
            {stats.completedInvestigations || 0} completed
          </div>
        </div>
        
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Avg Duration</div>
          <div className="text-3xl font-semibold text-blue-600">{stats.averageDurationMinutes || 0}m</div>
          <div className="text-xs text-muted mt-1">
            Mean time to completion
          </div>
        </div>
        
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Active Now</div>
          <div className="text-3xl font-semibold text-orange-600">{stats.activeInvestigations || 0}</div>
          <div className="text-xs text-muted mt-1">
            Currently running
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Investigation Trend */}
        <ChartFrame title="Investigation Trend" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            {statsQuery.isLoading ? (
              <ChartSkeleton />
            ) : (
              <LineChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis width={40} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value, name) => [value, name === 'total' ? 'Total' : name === 'completed' ? 'Completed' : 'Failed']}
                />
                <Line type="monotone" dataKey="total" stroke="#8884d8" strokeWidth={2} name="total" />
                <Line type="monotone" dataKey="completed" stroke="#82ca9d" strokeWidth={2} name="completed" />
                <Line type="monotone" dataKey="failed" stroke="#ff7c7c" strokeWidth={2} name="failed" />
              </LineChart>
            )}
          </ResponsiveContainer>
        </ChartFrame>

        {/* Status Distribution */}
        <ChartFrame title="Status Distribution" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            {statsQuery.isLoading ? (
              <ChartSkeleton />
            ) : (
              <PieChart>
                <Pie
                  data={distributions.byStatus || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {(distributions.byStatus || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            )}
          </ResponsiveContainer>
        </ChartFrame>

        {/* Duration Distribution */}
        <ChartFrame title="Duration Distribution" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            {investigationsQuery.isLoading ? (
              <ChartSkeleton />
            ) : (
              <BarChart data={durationData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis width={40} />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartFrame>

        {/* Success Rate Trend */}
        <ChartFrame title="Success Rate Trend" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            {statsQuery.isLoading ? (
              <ChartSkeleton />
            ) : (
              <LineChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis width={40} domain={[0, 100]} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value) => [`${value}%`, 'Success Rate']}
                />
                <Line type="monotone" dataKey="successRate" stroke="#00C49F" strokeWidth={3} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      {/* Performance Insights */}
      <div className="bg-surface rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium">Performance Insights</h2>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-blue-800 font-medium">Investigation Volume</div>
              <div className="text-sm text-blue-600 mt-1">
                {stats.totalInvestigations > 0 
                  ? `${Math.round(stats.totalInvestigations / (timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : 30))} investigations per day average`
                  : 'No investigations in selected period'
                }
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-green-800 font-medium">Efficiency</div>
              <div className="text-sm text-green-600 mt-1">
                {stats.successRate >= 90 
                  ? 'Excellent success rate' 
                  : stats.successRate >= 70 
                  ? 'Good success rate' 
                  : 'Success rate needs improvement'
                }
              </div>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="text-purple-800 font-medium">Speed</div>
              <div className="text-sm text-purple-600 mt-1">
                {(stats.averageDurationMinutes || 0) < 5 
                  ? 'Very fast investigations' 
                  : (stats.averageDurationMinutes || 0) < 15 
                  ? 'Fast investigations' 
                  : 'Consider optimization'
                }
              </div>
            </div>
          </div>
          
          {stats.activeInvestigations > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-yellow-800 text-sm">
                <strong>Active Investigations:</strong> {stats.activeInvestigations} investigations are currently running. 
                Monitor their progress in the <button 
                  onClick={() => navigate('/investigations')}
                  className="underline hover:no-underline"
                >
                  investigations list
                </button>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}