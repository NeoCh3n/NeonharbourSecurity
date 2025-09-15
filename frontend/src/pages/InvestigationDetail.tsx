import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { investigationsApi } from '../services/api';
import LiveAgentFeed from '../components/investigations/LiveAgentFeed';

type TimelineStep = {
  id: string;
  name: string;
  agent: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  error?: string;
  retries: number;
  output?: any;
};

type InvestigationStatus = {
  investigationId: string;
  status: 'planning' | 'executing' | 'analyzing' | 'responding' | 'complete' | 'failed' | 'paused' | 'expired';
  progress: number;
  timeline: TimelineStep[];
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

const stepStatusColors = {
  pending: 'text-gray-500 bg-gray-100',
  running: 'text-blue-600 bg-blue-100 animate-pulse',
  complete: 'text-green-600 bg-green-100',
  failed: 'text-red-600 bg-red-100'
};

export default function InvestigationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackType, setFeedbackType] = useState('general');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  // Real-time status updates
  const statusQuery = useQuery({
    queryKey: ['investigation-status', id],
    queryFn: () => investigationsApi.getStatus(id!),
    enabled: !!id,
    refetchInterval: 2000, // Refresh every 2 seconds for real-time updates
  });

  // Timeline data
  const timelineQuery = useQuery({
    queryKey: ['investigation-timeline', id],
    queryFn: () => investigationsApi.getTimeline(id!),
    enabled: !!id,
    refetchInterval: 2000,
  });

  // Report data (only for completed investigations)
  const reportQuery = useQuery({
    queryKey: ['investigation-report', id],
    queryFn: () => investigationsApi.getReport(id!),
    enabled: !!id && ['complete', 'failed', 'expired'].includes(statusQuery.data?.status?.status),
  });

  const feedbackMutation = useMutation({
    mutationFn: (feedback: any) => investigationsApi.addFeedback(id!, feedback),
    onSuccess: () => {
      setFeedbackText('');
      setShowFeedbackForm(false);
      queryClient.invalidateQueries({ queryKey: ['investigation-timeline', id] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => investigationsApi.pause(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investigation-status', id] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => investigationsApi.resume(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investigation-status', id] });
    },
  });

  const status = statusQuery.data?.status;
  const timeline = timelineQuery.data?.timeline || [];
  const report = reportQuery.data?.report;

  const handleSubmitFeedback = () => {
    if (!feedbackText.trim()) return;

    const feedback = {
      type: feedbackType,
      content: {
        message: feedbackText,
        stepId: selectedStep,
        timestamp: new Date().toISOString()
      }
    };

    feedbackMutation.mutate(feedback);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStepIcon = (step: TimelineStep) => {
    switch (step.status) {
      case 'complete':
        return '✓';
      case 'failed':
        return '✗';
      case 'running':
        return '⟳';
      default:
        return '○';
    }
  };

  if (!id) {
    return <div>Investigation ID is required</div>;
  }

  if (statusQuery.isLoading) {
    return <div>Loading investigation...</div>;
  }

  if (statusQuery.error) {
    return <div>Error loading investigation: {(statusQuery.error as any)?.message}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/investigations')}>
            ← Back to Investigations
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Investigation {id}</h1>
            <p className="text-muted">Real-time investigation monitoring and control</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {status?.status === 'paused' && (
            <Button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
            </Button>
          )}
          
          {['planning', 'executing', 'analyzing', 'responding'].includes(status?.status || '') && (
            <Button
              variant="secondary"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
            >
              {pauseMutation.isPending ? 'Pausing...' : 'Pause'}
            </Button>
          )}
          
          <Button
            variant="secondary"
            onClick={() => setShowFeedbackForm(!showFeedbackForm)}
          >
            Add Feedback
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-lg border p-4 ${statusColors[status?.status as keyof typeof statusColors] || 'bg-surface border-border'}`}>
          <div className="text-sm font-medium">Status</div>
          <div className="text-xl font-semibold capitalize">
            {status?.status || 'Unknown'}
          </div>
        </div>
        
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Progress</div>
          <div className="flex items-center gap-2">
            <div className="text-xl font-semibold">{status?.progress || 0}%</div>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${status?.progress || 0}%` }}
              />
            </div>
          </div>
        </div>
        
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="text-sm text-muted">Steps</div>
          <div className="text-xl font-semibold">
            {timeline.filter(s => s.status === 'complete').length} / {timeline.length}
          </div>
        </div>
      </div>

      {/* Feedback Form */}
      {showFeedbackForm && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <h3 className="text-lg font-medium mb-4">Add Feedback</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Feedback Type</label>
              <select
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 bg-surface"
              >
                <option value="general">General Feedback</option>
                <option value="verdict_correction">Verdict Correction</option>
                <option value="step_feedback">Step-specific Feedback</option>
                <option value="quality_assessment">Quality Assessment</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Provide your feedback on the investigation..."
                className="w-full border border-border rounded-md px-3 py-2 bg-surface h-24 resize-none"
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitFeedback}
                disabled={!feedbackText.trim() || feedbackMutation.isPending}
              >
                {feedbackMutation.isPending ? 'Submitting...' : 'Submit Feedback'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowFeedbackForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Live Agent Feed */}
      <LiveAgentFeed investigationId={id} />

      {/* Investigation Timeline */}
      <div className="bg-surface rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium">Investigation Timeline</h2>
          <p className="text-sm text-muted">Real-time step execution progress</p>
        </div>
        
        <div className="p-4">
          {timeline.length === 0 ? (
            <div className="text-center text-muted py-8">
              No timeline data available
            </div>
          ) : (
            <div className="space-y-4">
              {timeline.map((step, index) => (
                <div
                  key={step.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedStep === step.id ? 'border-blue-500 bg-blue-50' : 'border-border hover:bg-surfaceAlt'
                  }`}
                  onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Step indicator */}
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${stepStatusColors[step.status]}`}>
                        {getStepIcon(step)}
                      </div>
                      {index < timeline.length - 1 && (
                        <div className="w-px h-8 bg-border mt-2" />
                      )}
                    </div>
                    
                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{step.name}</h3>
                          <p className="text-sm text-muted">Agent: {step.agent}</p>
                        </div>
                        <div className="text-right text-sm">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${stepStatusColors[step.status]}`}>
                            {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                          </div>
                          {step.duration && (
                            <div className="text-muted mt-1">
                              {formatDuration(step.duration)}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {step.error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          <strong>Error:</strong> {step.error}
                          {step.retries > 0 && (
                            <div className="mt-1 text-xs">Retries: {step.retries}</div>
                          )}
                        </div>
                      )}
                      
                      {selectedStep === step.id && step.output && (
                        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                          <h4 className="text-sm font-medium mb-2">Step Output:</h4>
                          <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                            {JSON.stringify(step.output, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                        {step.startedAt && (
                          <span>Started: {new Date(step.startedAt).toLocaleString()}</span>
                        )}
                        {step.completedAt && (
                          <span>Completed: {new Date(step.completedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Investigation Report (for completed investigations) */}
      {report && (
        <div className="bg-surface rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-medium">Investigation Report</h2>
            <p className="text-sm text-muted">Final analysis and recommendations</p>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-sm text-muted">Total Duration</div>
                <div className="font-medium">{formatDuration(report.duration)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-sm text-muted">API Calls</div>
                <div className="font-medium">{report.metrics?.totalApiCalls || 0}</div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-sm text-muted">Data Sources</div>
                <div className="font-medium">{report.metrics?.dataSourcesQueried?.length || 0}</div>
              </div>
            </div>
            
            {report.metrics?.dataSourcesQueried?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Data Sources Queried:</h4>
                <div className="flex flex-wrap gap-2">
                  {report.metrics.dataSourcesQueried.map((source: string) => (
                    <span key={source} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `investigation-${id}-report.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
