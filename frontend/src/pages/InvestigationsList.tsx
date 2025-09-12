import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/datatable/DataTable';
import { Button } from '../components/ui/Button';
import { investigationsApi } from '../services/api';

type Investigation = {
  id: string;
  alert_id: number;
  case_id?: number;
  status: 'planning' | 'executing' | 'analyzing' | 'responding' | 'complete' | 'failed' | 'paused' | 'expired';
  priority: number;
  created_at: string;
  completed_at?: string;
  alert_summary?: string;
  alert_severity?: string;
};

const statusColors = {
  planning: 'text-blue-600 bg-blue-50',
  executing: 'text-yellow-600 bg-yellow-50',
  analyzing: 'text-purple-600 bg-purple-50',
  responding: 'text-orange-600 bg-orange-50',
  complete: 'text-green-600 bg-green-50',
  failed: 'text-red-600 bg-red-50',
  paused: 'text-gray-600 bg-gray-50',
  expired: 'text-gray-600 bg-gray-50'
};

const priorityLabels = {
  1: 'Critical',
  2: 'High', 
  3: 'Medium',
  4: 'Low',
  5: 'Info'
};

export default function InvestigationsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const investigationsQuery = useQuery({
    queryKey: ['investigations', statusFilter, priorityFilter, limit, offset],
    queryFn: () => investigationsApi.list({
      status: statusFilter === 'all' ? undefined : statusFilter,
      priority: priorityFilter === 'all' ? undefined : parseInt(priorityFilter),
      limit,
      offset
    }),
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const statsQuery = useQuery({
    queryKey: ['investigation-stats'],
    queryFn: () => investigationsApi.getStats('7d'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const investigations = investigationsQuery.data?.investigations || [];
  const total = investigationsQuery.data?.total || 0;
  const hasMore = investigationsQuery.data?.hasMore || false;
  const stats = statsQuery.data?.summary || {};

  const columns: ColumnDef<Investigation, any>[] = useMemo(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="font-mono text-sm">{getValue()}</span>
      ),
    },
    {
      accessorKey: 'alert_id',
      header: 'Alert',
      cell: ({ getValue, row }) => (
        <div className="space-y-1">
          <div className="font-medium">#{getValue()}</div>
          {row.original.alert_summary && (
            <div className="text-xs text-muted truncate max-w-[200px]">
              {row.original.alert_summary}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue() as keyof typeof statusColors;
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        );
      },
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ getValue }) => {
        const priority = getValue() as keyof typeof priorityLabels;
        return (
          <span className="text-sm">
            {priorityLabels[priority] || `P${priority}`}
          </span>
        );
      },
    },
    {
      accessorKey: 'alert_severity',
      header: 'Severity',
      cell: ({ getValue }) => {
        const severity = getValue();
        if (!severity) return <span className="text-muted">-</span>;
        
        const severityColors = {
          critical: 'text-red-600 bg-red-50',
          high: 'text-orange-600 bg-orange-50',
          medium: 'text-yellow-600 bg-yellow-50',
          low: 'text-blue-600 bg-blue-50'
        };
        
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColors[severity as keyof typeof severityColors] || 'text-gray-600 bg-gray-50'}`}>
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
          </span>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Started',
      cell: ({ getValue }) => (
        <div className="text-sm">
          {new Date(getValue()).toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'completed_at',
      header: 'Duration',
      cell: ({ getValue, row }) => {
        const completedAt = getValue();
        const createdAt = row.original.created_at;
        
        if (!completedAt) {
          const elapsed = Date.now() - new Date(createdAt).getTime();
          const minutes = Math.floor(elapsed / 60000);
          return <span className="text-muted">{minutes}m (running)</span>;
        }
        
        const duration = new Date(completedAt).getTime() - new Date(createdAt).getTime();
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        return (
          <span className="text-sm">
            {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-xs px-2 py-1"
            onClick={() => navigate(`/investigations/${row.original.id}`)}
          >
            View
          </Button>
          {row.original.status === 'paused' && (
            <Button
              variant="ghost"
              className="text-xs px-2 py-1 text-green-600"
              onClick={() => handleResumeInvestigation(row.original.id)}
            >
              Resume
            </Button>
          )}
          {['planning', 'executing', 'analyzing', 'responding'].includes(row.original.status) && (
            <Button
              variant="ghost"
              className="text-xs px-2 py-1 text-orange-600"
              onClick={() => handlePauseInvestigation(row.original.id)}
            >
              Pause
            </Button>
          )}
        </div>
      ),
    },
  ], [navigate]);

  const handlePauseInvestigation = async (id: string) => {
    try {
      await investigationsApi.pause(id);
      investigationsQuery.refetch();
    } catch (error) {
      console.error('Failed to pause investigation:', error);
    }
  };

  const handleResumeInvestigation = async (id: string) => {
    try {
      await investigationsApi.resume(id);
      investigationsQuery.refetch();
    } catch (error) {
      console.error('Failed to resume investigation:', error);
    }
  };

  const handlePrevPage = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNextPage = () => {
    if (hasMore) {
      setOffset(offset + limit);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI Investigations</h1>
          <p className="text-muted">Monitor and manage autonomous security investigations</p>
        </div>
        <Button onClick={() => navigate('/investigations/metrics')}>
          View Metrics
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Total (7d)</div>
          <div className="text-2xl font-semibold">{stats.totalInvestigations || 0}</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Active</div>
          <div className="text-2xl font-semibold text-blue-600">{stats.activeInvestigations || 0}</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Success Rate</div>
          <div className="text-2xl font-semibold text-green-600">{stats.successRate || 0}%</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Avg Duration</div>
          <div className="text-2xl font-semibold">{stats.averageDurationMinutes || 0}m</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-1 bg-surface text-text"
            >
              <option value="all">All</option>
              <option value="planning">Planning</option>
              <option value="executing">Executing</option>
              <option value="analyzing">Analyzing</option>
              <option value="responding">Responding</option>
              <option value="complete">Complete</option>
              <option value="failed">Failed</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Priority:</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="border border-border rounded-md px-3 py-1 bg-surface text-text"
            >
              <option value="all">All</option>
              <option value="1">Critical</option>
              <option value="2">High</option>
              <option value="3">Medium</option>
              <option value="4">Low</option>
              <option value="5">Info</option>
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2 text-sm text-muted">
            <span>Auto-refresh: 5s</span>
            <div className={`w-2 h-2 rounded-full ${investigationsQuery.isFetching ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
          </div>
        </div>
      </div>

      {/* Investigations Table */}
      <div className="bg-surface rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Investigations</h2>
            <div className="text-sm text-muted">
              Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
            </div>
          </div>
        </div>
        
        <DataTable
          columns={columns}
          data={investigations}
          height={600}
        />
        
        {/* Pagination */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={handlePrevPage}
            disabled={offset === 0}
          >
            Previous
          </Button>
          
          <div className="text-sm text-muted">
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
          </div>
          
          <Button
            variant="secondary"
            onClick={handleNextPage}
            disabled={!hasMore}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}