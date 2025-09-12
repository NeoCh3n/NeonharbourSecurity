import { Button } from '../ui/Button';

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

type InvestigationCardProps = {
  investigation: Investigation;
  onView: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
};

const statusColors = {
  planning: 'text-blue-600 bg-blue-50 border-blue-200',
  executing: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  analyzing: 'text-purple-600 bg-purple-50 border-purple-200',
  responding: 'text-orange-600 bg-orange-50 border-orange-200',
  complete: 'text-green-600 bg-green-50 border-green-200',
  failed: 'text-red-600 bg-red-50 border-red-200',
  paused: 'text-gray-600 bg-gray-50 border-gray-200',
  expired: 'text-gray-600 bg-gray-50 border-gray-200'
};

const priorityLabels = {
  1: 'Critical',
  2: 'High', 
  3: 'Medium',
  4: 'Low',
  5: 'Info'
};

const severityColors = {
  critical: 'text-red-600 bg-red-50',
  high: 'text-orange-600 bg-orange-50',
  medium: 'text-yellow-600 bg-yellow-50',
  low: 'text-blue-600 bg-blue-50'
};

export default function InvestigationCard({ investigation, onView, onPause, onResume }: InvestigationCardProps) {
  const formatDuration = () => {
    const createdAt = new Date(investigation.created_at).getTime();
    
    if (investigation.completed_at) {
      const completedAt = new Date(investigation.completed_at).getTime();
      const duration = completedAt - createdAt;
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    } else {
      const elapsed = Date.now() - createdAt;
      const minutes = Math.floor(elapsed / 60000);
      return `${minutes}m (running)`;
    }
  };

  const isActive = ['planning', 'executing', 'analyzing', 'responding'].includes(investigation.status);
  const isPaused = investigation.status === 'paused';

  return (
    <div className="bg-surface rounded-lg border border-border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-medium">{investigation.id}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[investigation.status]}`}>
              {investigation.status.charAt(0).toUpperCase() + investigation.status.slice(1)}
            </span>
          </div>
          
          <div className="text-sm text-muted mb-2">
            Alert #{investigation.alert_id}
            {investigation.alert_severity && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[investigation.alert_severity as keyof typeof severityColors] || 'text-gray-600 bg-gray-50'}`}>
                {investigation.alert_severity.charAt(0).toUpperCase() + investigation.alert_severity.slice(1)}
              </span>
            )}
          </div>
          
          {investigation.alert_summary && (
            <p className="text-sm text-text truncate mb-2" title={investigation.alert_summary}>
              {investigation.alert_summary}
            </p>
          )}
        </div>
        
        <div className="text-right text-sm">
          <div className="text-muted">
            {priorityLabels[investigation.priority as keyof typeof priorityLabels] || `P${investigation.priority}`}
          </div>
          <div className="text-xs text-muted mt-1">
            {formatDuration()}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">
          Started: {new Date(investigation.created_at).toLocaleString()}
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-xs px-2 py-1"
            onClick={() => onView(investigation.id)}
          >
            View
          </Button>
          
          {isPaused && (
            <Button
              variant="ghost"
              className="text-xs px-2 py-1 text-green-600"
              onClick={() => onResume(investigation.id)}
            >
              Resume
            </Button>
          )}
          
          {isActive && (
            <Button
              variant="ghost"
              className="text-xs px-2 py-1 text-orange-600"
              onClick={() => onPause(investigation.id)}
            >
              Pause
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}