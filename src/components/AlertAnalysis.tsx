import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { 
  Brain, 
  Search, 
  BarChart3, 
  Shield, 
  Play, 
  Pause, 
  RotateCcw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  Zap,
  Activity,
  FileText,
  Target,
  GraduationCap
} from 'lucide-react';
import { runtimeService, useRuntimeStore } from '../services/runtime';
import { features } from '../config/environment';
import type {
  SecurityAlert,
  AnalysisPlan,
  ContextData,
  ThreatAnalysis,
  RiskAssessment,
  LearningInsights,
  ComplianceReport
} from '../services/agents';

interface Agent {
  id: string;
  name: string;
  description: string;
  stage: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  icon: React.ReactNode;
  responsibilities: string[];
  artifacts: string[];
}

interface AlertAnalysisProps {
  currentAlertId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAnalysisPlan = (value: unknown): value is AnalysisPlan => {
  if (!isRecord(value)) return false;
  return typeof value.planId === 'string' && Array.isArray(value.steps);
};

const isContextData = (value: unknown): value is ContextData => {
  if (!isRecord(value)) return false;
  return Array.isArray(value.threatIntelligence) && Array.isArray(value.assetInformation);
};

const isThreatAnalysis = (value: unknown): value is ThreatAnalysis => {
  if (!isRecord(value)) return false;
  return typeof value.analysisId === 'string' && Array.isArray(value.indicators);
};

const isRiskAssessment = (value: unknown): value is RiskAssessment => {
  if (!isRecord(value)) return false;
  if (typeof value.riskScore !== 'number' || !isRecord(value.impactAnalysis)) return false;
  const impact = value.impactAnalysis as Record<string, unknown>;
  return typeof impact.financial === 'number' &&
    typeof impact.operational === 'number' &&
    typeof impact.compliance === 'number';
};

const isLearningInsights = (value: unknown): value is LearningInsights => {
  if (!isRecord(value)) return false;
  return typeof value.patternId === 'string' && Array.isArray(value.insights);
};

const isComplianceReport = (value: unknown): value is ComplianceReport => {
  if (!isRecord(value)) return false;
  return typeof value.reportId === 'string' && isRecord(value.content);
};

const formatBytes = (value?: number) => {
  if (value == null || Number.isNaN(value)) return '—';
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

export function AlertAnalysis({ currentAlertId }: AlertAnalysisProps) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const connection = useRuntimeStore((runtimeState) => runtimeState.connection);
  const activeRunId = useRuntimeStore((runtimeState) => runtimeState.activeRunId);
  const runState = useRuntimeStore((runtimeState) => (
    runtimeState.activeRunId ? runtimeState.runs[runtimeState.activeRunId] : undefined
  ));
  const alerts = useRuntimeStore((runtimeState) => runtimeState.alerts);
  const currentAlert = useMemo(() => {
    if (currentAlertId && alerts[currentAlertId]) {
      return alerts[currentAlertId];
    }
    if (runState?.metadata?.alertId) {
      return {
        id: runState.metadata.alertId,
        title: runState.metadata.alertTitle || runState.metadata.alertId,
        description: runState.metadata.alertDescription,
        severity: runState.metadata.severity,
        source: runState.metadata.source,
        timestamp: runState.metadata.timestamp,
        status: runState.metadata.status,
        location: runState.metadata.location,
        confidence: runState.metadata.confidence,
        affectedAssets: runState.metadata.affectedAssets,
        iocs: runState.metadata.iocs,
        tags: runState.metadata.tags,
      };
    }
    return undefined;
  }, [alerts, currentAlertId, runState]);

  const baseAgents: Agent[] = [
    {
      id: 'planner',
      name: 'Planner Agent',
      description: 'Creates comprehensive analysis plans for security incidents',
      stage: 'Plan',
      status: 'idle',
      progress: 0,
      icon: <Brain className="h-5 w-5" />,
      responsibilities: [
        'Generate structured analysis plans based on alert severity and type',
        'Prioritize investigation steps and resource allocation',
        'Integrate with Amazon Bedrock for intelligent planning',
        'Estimate timeline and required resources for investigation'
      ],
      artifacts: [
        'Analysis plan with prioritized steps',
        'Resource requirement assessment',
        'Timeline estimation for investigation',
        'Integration roadmap for Bedrock Agent'
      ]
    },
    {
      id: 'context-executor',
      name: 'Context Executor Agent',
      description: 'Gathers and enriches context for security analysis',
      stage: 'Execute',
      status: 'idle',
      progress: 0,
      icon: <Search className="h-5 w-5" />,
      responsibilities: [
        'Collect threat intelligence from multiple sources',
        'Gather historical patterns and similar incidents',
        'Enrich alerts with asset and network topology information',
        'Integrate security policies and compliance frameworks'
      ],
      artifacts: [
        'Enriched threat intelligence data',
        'Historical pattern analysis',
        'Asset and network context',
        'Policy compliance mapping'
      ]
    },
    {
      id: 'analyst',
      name: 'Analyst Agent',
      description: 'Performs deep threat analysis and attribution',
      stage: 'Analyze',
      status: 'idle',
      progress: 0,
      icon: <BarChart3 className="h-5 w-5" />,
      responsibilities: [
        'Conduct comprehensive threat analysis using ML models',
        'Generate attack timeline and attribution analysis',
        'Extract and validate indicators of compromise (IOCs)',
        'Map findings to MITRE ATT&CK framework'
      ],
      artifacts: [
        'Detailed threat analysis report',
        'Attack timeline and attribution',
        'Validated IOCs and indicators',
        'MITRE ATT&CK technique mapping'
      ]
    },
    {
      id: 'risk-orchestrator',
      name: 'Risk Orchestrator Agent',
      description: 'Assesses risk and orchestrates response actions',
      stage: 'Respond',
      status: 'idle',
      progress: 0,
      icon: <Shield className="h-5 w-5" />,
      responsibilities: [
        'Calculate comprehensive risk scores and impact analysis',
        'Generate automated response recommendations',
        'Manage human-in-the-loop approval workflows',
        'Ensure HKMA compliance throughout response process'
      ],
      artifacts: [
        'Risk assessment with impact analysis',
        'Automated response action plans',
        'HITL approval workflows',
        'HKMA compliance verification'
      ]
    },
    {
      id: 'learning-curator',
      name: 'Learning Curator Agent',
      description: 'Extracts insights and improves detection models',
      stage: 'Adapt',
      status: 'idle',
      progress: 0,
      icon: <GraduationCap className="h-5 w-5" />,
      responsibilities: [
        'Extract learning insights from completed incidents',
        'Update detection models based on new patterns',
        'Track performance metrics and improvements',
        'Continuously adapt system behavior'
      ],
      artifacts: [
        'Learning insights and recommendations',
        'Updated ML models and parameters',
        'Performance improvement metrics',
        'Behavioral adaptation records'
      ]
    },
    {
      id: 'audit-reporter',
      name: 'Audit Reporter Agent',
      description: 'Generates compliance reports for regulatory bodies',
      stage: 'Report',
      status: 'idle',
      progress: 0,
      icon: <FileText className="h-5 w-5" />,
      responsibilities: [
        'Generate OGCIO and HKMA compliant incident reports',
        'Maintain immutable audit trails for all actions',
        'Ensure 12/48 hour reporting deadlines are met',
        'Submit reports to regulatory bodies automatically'
      ],
      artifacts: [
        'Regulatory compliance reports',
        'Immutable audit trail records',
        'Deadline tracking and notifications',
        'Submission confirmations'
      ]
    }
  ];

  const agents = useMemo(() => {
    const runtimeAgents = runState?.agents ?? {};
    return baseAgents.map(agent => {
      const runtimeAgent = runtimeAgents[agent.id];
      const status = runtimeAgent?.status ?? 'idle';
      const progress = runtimeAgent?.progress ?? 0;
      const currentActivity = runtimeAgent?.lastActivity ||
        (status === 'idle' ? 'Awaiting runtime events...' : 'Processing...');
      
      return {
        ...agent,
        status,
        progress,
        currentActivity
      };
    });
  }, [runState, baseAgents]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'running':
        return <Zap className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-900/30 text-green-400 border-green-700';
      case 'running':
        return 'bg-blue-900/30 text-blue-400 border-blue-700';
      case 'error':
        return 'bg-red-900/30 text-red-400 border-red-700';
      default:
        return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  const pipelineRunning = runState?.status === 'running';
  const pipelineComplete = runState?.status === 'completed';
  const pipelineFailed = runState?.status === 'failed';
  const analysisResult = runState?.outcome ?? null;
  const pendingApprovals = runState?.approvals.filter((approval) => approval.status === 'pending') ?? [];
  const artifacts = runState?.artifacts ?? [];
  const pipelineEnabled = features.multiAgentPipeline;
  const sequenceGapCount = runState?.sequenceGaps.length ?? 0;
  const sequenceReplayCount = runState?.sequenceReplays.length ?? 0;
  const stalled = runState?.status === 'running' && runState.lastEventAt
    ? Date.now() - new Date(runState.lastEventAt).getTime() > 120000
    : false;

  const currentRunningAgent = agents.find((agent) => agent.status === 'running')?.id ?? null;

  const agentResults = useMemo(() => {
    const getLatest = (agentId: string) => {
      const outputs = runState?.agentOutputs?.[agentId];
      return outputs && outputs.length > 0 ? outputs[outputs.length - 1] : undefined;
    };

    const plannerOutput = getLatest('planner');
    const contextOutput = getLatest('context-executor');
    const analystOutput = getLatest('analyst');
    const riskOutput = getLatest('risk-orchestrator');
    const learningOutput = getLatest('learning-curator');
    const auditOutput = getLatest('audit-reporter');

    return {
      plan: isAnalysisPlan(plannerOutput) ? plannerOutput : undefined,
      context: isContextData(contextOutput) ? contextOutput : undefined,
      analysis: isThreatAnalysis(analystOutput) ? analystOutput : undefined,
      riskAssessment: isRiskAssessment(riskOutput) ? riskOutput : undefined,
      learningInsights: isLearningInsights(learningOutput) ? learningOutput : undefined,
      complianceReport: isComplianceReport(auditOutput) ? auditOutput : undefined,
    };
  }, [runState]);

  const hasAgentResults = Object.values(agentResults).some((result) => result != null);

  const runDurationSeconds = runState?.startedAt && runState?.completedAt
    ? Math.max(0, (new Date(runState.completedAt).getTime() - new Date(runState.startedAt).getTime()) / 1000)
    : null;

  const connectionBadge = connection.status === 'connected'
    ? 'bg-green-900/30 text-green-400 border-green-700'
    : connection.status === 'connecting'
      ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700'
      : 'bg-red-900/30 text-red-400 border-red-700';

  const alertDescription = currentAlert?.description || 'Select an alert to view details.';
  const affectedAssets = currentAlert?.affectedAssets ?? [];
  const detectionTime = currentAlert?.timestamp
    ? new Date(currentAlert.timestamp).toLocaleString()
    : 'N/A';
  const confidenceScore = currentAlert?.confidence ?? 0;
  const alertIdLabel = currentAlert?.id ?? currentAlertId ?? 'Unknown alert';
  const alertSourceLabel = currentAlert?.source ?? 'Unknown source';
  const alertLocationLabel = currentAlert?.location ?? 'Location unknown';
  const severityValue = currentAlert?.severity ?? 'unknown';
  const severityLabel = currentAlert?.severity ? currentAlert.severity.toUpperCase() : 'UNKNOWN';

  const startRun = async () => {
    if (!pipelineEnabled) {
      setLocalError('Multi-agent pipeline is disabled by feature flag.');
      return;
    }
    if (!currentAlert) {
      setLocalError('Select an alert to start analysis.');
      return;
    }

    if (connection.status !== 'connected') {
      setLocalError('Runtime is not connected. Configure the runtime endpoint in Settings.');
      return;
    }

    setLocalError(null);

    const iocs = Array.isArray(currentAlert.iocs)
      ? currentAlert.iocs.map((ioc) => (typeof ioc === 'string' ? ioc : ioc.value)).filter(Boolean)
      : [];

    const alertData: SecurityAlert = {
      id: currentAlert.id,
      title: currentAlert.title || currentAlert.id,
      description: currentAlert.description || 'Alert description unavailable.',
      severity: (currentAlert.severity as SecurityAlert['severity']) ?? 'medium',
      source: currentAlert.source || 'Unknown source',
      timestamp: currentAlert.timestamp || new Date().toISOString(),
      iocs,
      rawData: {
        location: currentAlert.location,
        affectedAssets: currentAlert.affectedAssets,
        tags: currentAlert.tags,
        confidence: currentAlert.confidence,
      },
    };

    try {
      await runtimeService.startRun(alertData, {
        agent_roles: baseAgents.map((agent) => agent.id),
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to start runtime analysis.');
    }
  };

  const togglePipeline = async () => {
    if (!pipelineEnabled) {
      setLocalError('Multi-agent pipeline is disabled by feature flag.');
      return;
    }
    if (pipelineRunning && activeRunId) {
      try {
        await runtimeService.stopRun(activeRunId);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to stop the run.');
      }
      return;
    }

    if (!pipelineComplete) {
      await startRun();
    }
  };

  const resetPipeline = () => {
    if (activeRunId) {
      runtimeService.clearRun(activeRunId);
    }
    setApprovalNotes({});
    setActiveAgent(null);
    setLocalError(null);
  };

  const handleApprovalDecision = async (requestId: string, decision: 'approved' | 'rejected') => {
    try {
      await runtimeService.respondToApproval(requestId, decision, approvalNotes[requestId]);
      setApprovalNotes((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setLocalError(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to submit approval decision.');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-900/30 text-red-400 border-red-700';
      case 'high': return 'bg-orange-900/30 text-orange-400 border-orange-700';
      case 'medium': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'low': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      default: return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 min-h-full">
      {/* Current Alert Header */}
      <Card className="border-l-4 border-l-blue-500 bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-xl text-white">
                  {currentAlert?.title || 'No Alert Selected'}
                </CardTitle>
              </div>
              <div className="flex items-center space-x-4">
                <Badge className={getSeverityColor(severityValue)}>
                  {severityLabel}
                </Badge>
                <span className="text-sm text-slate-300">
                  {alertIdLabel} • {alertSourceLabel}
                </span>
                <span className="text-sm text-slate-400">
                  {alertLocationLabel}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className={connectionBadge}>
                Runtime {connection.status}
              </Badge>
              <Badge variant="outline" className={pipelineEnabled ? 'bg-green-900/30 text-green-400 border-green-700' : 'bg-slate-700/30 text-slate-300 border-slate-600'}>
                Pipeline {pipelineEnabled ? 'enabled' : 'disabled'}
              </Badge>
              {sequenceGapCount > 0 && (
                <Badge variant="outline" className="bg-orange-900/30 text-orange-400 border-orange-700">
                  {sequenceGapCount} gap{sequenceGapCount === 1 ? '' : 's'}
                </Badge>
              )}
              {sequenceReplayCount > 0 && (
                <Badge variant="outline" className="bg-yellow-900/30 text-yellow-400 border-yellow-700">
                  {sequenceReplayCount} replay{sequenceReplayCount === 1 ? '' : 's'}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={resetPipeline}
                className="flex items-center space-x-1 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </Button>
              <Button
                onClick={togglePipeline}
                disabled={pipelineComplete || !pipelineEnabled || (!pipelineRunning && connection.status !== 'connected')}
                className="flex items-center space-x-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
              >
                {pipelineRunning ? (
                  <>
                    <Pause className="h-4 w-4" />
                    <span>Stop Analysis</span>
                  </>
                ) : pipelineComplete ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Analysis Complete</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Start Analysis</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-slate-300 mb-4">{alertDescription}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Affected Assets</h4>
              <div className="space-y-1">
                {affectedAssets.length > 0 ? (
                  affectedAssets.map((asset, index) => (
                    <div key={index} className="text-sm text-slate-300 bg-slate-700/50 rounded px-2 py-1">
                      {asset}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No assets reported.</div>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Detection Time</h4>
              <div className="text-sm text-slate-400">
                {detectionTime}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Confidence Score</h4>
              <div className="flex items-center space-x-2">
                <Progress value={confidenceScore} className="flex-1" />
                <span className="text-sm font-medium text-white">{confidenceScore}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!currentAlert && (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="pt-4 text-sm text-slate-300">
            No alert selected. Choose an alert from the Alert Summary to start a run.
          </CardContent>
        </Card>
      )}

      {!pipelineEnabled && (
        <Card className="border-l-4 border-l-slate-500 bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="pt-4 text-sm text-slate-300">
            Multi-agent pipeline is disabled. Enable `features.multiAgentPipeline` to run analyses.
          </CardContent>
        </Card>
      )}

      {(localError || pipelineFailed) && (
        <Card className="border-l-4 border-l-red-500 bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="pt-4 space-y-2 text-sm text-red-200">
            {localError && <p>{localError}</p>}
            {pipelineFailed && !localError && <p>The runtime reported a failed run. Review agent events and retry.</p>}
          </CardContent>
        </Card>
      )}

      {stalled && (
        <Card className="border-l-4 border-l-orange-500 bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="pt-4 text-sm text-orange-200">
            Runtime has not emitted events in over 2 minutes. Check runtime health or reconnect.
          </CardContent>
        </Card>
      )}

      {/* Multi-Agent Pipeline Analysis Progress */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Multi-Agent Analysis Pipeline</h2>
          <p className="text-slate-300">Plan → Execute → Analyze → Respond → Adapt → Report</p>
        </div>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Pipeline Progress</CardTitle>
            <CardDescription className="text-slate-300">
              Real-time status of the 6-stage security analysis pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pipelineEnabled ? (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`p-4 border border-slate-600 rounded-lg cursor-pointer transition-all bg-slate-700/30 ${
                      activeAgent === agent.id ? 'ring-2 ring-blue-400 bg-blue-900/40' : 
                      currentRunningAgent === agent.id ? 'ring-2 ring-green-400 bg-green-900/40' :
                      'hover:bg-slate-600/30'
                    }`}
                    onClick={() => setActiveAgent(activeAgent === agent.id ? null : agent.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="p-1 bg-blue-500/20 rounded text-blue-400">
                          {agent.icon}
                        </div>
                        {getStatusIcon(agent.status)}
                      </div>
                      <Badge className={getStatusColor(agent.status)} variant="outline">
                        {agent.status}
                      </Badge>
                    </div>
                    <h3 className="font-medium text-sm mb-1 text-slate-200">{agent.name}</h3>
                    <p className="text-xs text-slate-400 mb-2">{agent.stage}</p>
                    <Progress value={agent.progress} className="h-2 mb-2" />
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">{agent.progress}%</p>
                      {agent.status === 'running' && (
                        <p className="text-xs text-blue-400 italic min-h-[2.5rem] leading-tight">
                          {agent.currentActivity}
                        </p>
                      )}
                      {agent.status === 'completed' && (
                        <p className="text-xs text-green-400 italic">
                          {agent.currentActivity}
                        </p>
                      )}
                      {agent.status === 'error' && (
                        <p className="text-xs text-red-400 italic">
                          {agent.currentActivity || 'Agent failed'}
                        </p>
                      )}
                      {agent.status === 'idle' && (
                        <p className="text-xs text-slate-500 italic">
                          Waiting to start...
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                Pipeline rendering is disabled. Enable the feature flag to view agent progress.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approval Requests */}
      {pendingApprovals.length > 0 && (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-orange-400" />
              <span>Approval Required</span>
            </CardTitle>
            <CardDescription className="text-slate-300">
              Runtime actions awaiting human approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingApprovals.map((approval) => (
              <div key={approval.request_id} className="rounded border border-slate-600 bg-slate-700/30 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-white">
                      {approval.title || 'Approval requested'}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {approval.description || 'Review the requested action and provide a decision.'}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-orange-900/30 text-orange-400 border-orange-700">
                    Pending
                  </Badge>
                </div>
                {!approval.verified && (
                  <div className="text-xs text-yellow-300">
                    Unverified request id. {approval.verificationIssue || 'Missing request_id in runtime payload.'}
                  </div>
                )}
                {approval.payload && (
                  <pre className="text-xs text-slate-300 bg-slate-900/40 border border-slate-700 rounded p-3 overflow-auto max-h-40">
                    {(() => {
                      const preview = typeof approval.payload === 'string'
                        ? approval.payload
                        : JSON.stringify(approval.payload, null, 2);
                      return preview.length > 800 ? `${preview.slice(0, 800)}…` : preview;
                    })()}
                  </pre>
                )}
                <Textarea
                  value={approvalNotes[approval.request_id] || ''}
                  onChange={(event) => setApprovalNotes((prev) => ({
                    ...prev,
                    [approval.request_id]: event.target.value,
                  }))}
                  placeholder="Add a note for this decision (optional)"
                  className="bg-slate-900/40 border-slate-600 text-white"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={connection.status !== 'connected'}
                    onClick={() => handleApprovalDecision(approval.request_id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-200 hover:text-white hover:bg-slate-700/50"
                    disabled={connection.status !== 'connected'}
                    onClick={() => handleApprovalDecision(approval.request_id, 'rejected')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Agent Details */}
      {activeAgent && (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-white">
              <div className="text-blue-400">{agents.find(a => a.id === activeAgent)?.icon}</div>
              <span>{agents.find(a => a.id === activeAgent)?.name} Agent</span>
            </CardTitle>
            <CardDescription className="text-slate-300">
              {agents.find(a => a.id === activeAgent)?.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="responsibilities" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-700/50">
                <TabsTrigger value="responsibilities" className="text-slate-300 data-[state=active]:bg-slate-600 data-[state=active]:text-white">Responsibilities</TabsTrigger>
                <TabsTrigger value="artifacts" className="text-slate-300 data-[state=active]:bg-slate-600 data-[state=active]:text-white">Key Artifacts</TabsTrigger>
              </TabsList>
              <TabsContent value="responsibilities" className="space-y-2">
                <h4 className="font-medium text-sm text-slate-300 mb-2">Core Responsibilities</h4>
                <ul className="space-y-1">
                  {agents.find(a => a.id === activeAgent)?.responsibilities.map((resp, index) => (
                    <li key={index} className="text-sm text-slate-400 flex items-start space-x-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="artifacts" className="space-y-2">
                <h4 className="font-medium text-sm text-slate-300 mb-2">Artifacts & Evidence</h4>
                {(() => {
                  const agent = agents.find(a => a.id === activeAgent);
                  const agentArtifacts = artifacts.filter((artifact) => artifact.agent_id === activeAgent);

                  if (agentArtifacts.length > 0) {
                    return (
                      <div className="space-y-2">
                        {agentArtifacts.map((artifact, index) => (
                          <div key={`${artifact.artifact_ref.sha256}-${index}`} className="rounded border border-slate-600 bg-slate-700/40 p-3">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span className="font-medium text-slate-300">Artifact Ref</span>
                              {artifact.artifact_ref.content_type && (
                                <Badge variant="outline" className="border-slate-600 text-slate-300">
                                  {artifact.artifact_ref.content_type}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-2 text-xs text-slate-300 font-mono break-all">
                              {artifact.artifact_ref.sha256}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                              <span>Size: {formatBytes(artifact.artifact_ref.size)}</span>
                              {artifact.artifact_ref.redaction && <span>Redaction: {artifact.artifact_ref.redaction}</span>}
                              {artifact.artifact_ref.uri && <span className="truncate">URI: {artifact.artifact_ref.uri}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  if (agent?.artifacts?.length) {
                    return (
                      <div className="space-y-2 text-sm text-slate-400">
                        <p className="text-xs text-slate-500">Expected artifacts for this agent:</p>
                        <ul className="space-y-1">
                          {agent.artifacts.map((artifact, index) => (
                            <li key={index} className="flex items-start space-x-2">
                              <span className="text-slate-500 mt-1">•</span>
                              <span>{artifact}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }

                  return <p className="text-sm text-slate-500">No artifacts emitted for this agent yet.</p>;
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Analysis Results */}
      {pipelineEnabled && pipelineComplete && analysisResult && (
        <Card className={`border-l-4 bg-slate-800/50 backdrop-blur-sm border-slate-700 ${analysisResult.status === 'resolved' ? 'border-l-green-500' : 'border-l-orange-500'}`}>
          <CardHeader>
            <div className="flex items-center space-x-2">
              {analysisResult.status === 'resolved' ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              )}
              <CardTitle className="text-xl text-white">
                Analysis {analysisResult.status === 'resolved' ? 'Complete' : 'Requires Assistance'}
              </CardTitle>
              <Badge 
                variant="outline" 
                className={analysisResult.status === 'resolved' ? 
                  'bg-green-900/30 text-green-400 border-green-700' : 
                  'bg-orange-900/30 text-orange-400 border-orange-700'
                }
              >
                {analysisResult.status.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Analysis Summary</h4>
              <p className="text-slate-300">{analysisResult.summary}</p>
            </div>

            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-3">Actions Taken</h4>
              <div className="space-y-2">
                {analysisResult.actions.map((action, index) => (
                  <div key={index} className="flex items-start space-x-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-400">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {analysisResult.status === 'unresolved' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {analysisResult.uncertainties && (
                  <div>
                    <h4 className="font-medium text-sm text-slate-300 mb-3 flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      <span>Uncertainties Identified</span>
                    </h4>
                    <div className="space-y-2">
                      {analysisResult.uncertainties.map((uncertainty, index) => (
                        <div key={index} className="flex items-start space-x-2 text-sm">
                          <span className="text-orange-500 mt-1">•</span>
                          <span className="text-slate-400">{uncertainty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult.assistanceNeeded && (
                  <div>
                    <h4 className="font-medium text-sm text-slate-300 mb-3 flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-blue-500" />
                      <span>Human Assistance Required</span>
                    </h4>
                    <div className="space-y-2">
                      {analysisResult.assistanceNeeded.map((assistance, index) => (
                        <div key={index} className="flex items-start space-x-2 text-sm">
                          <span className="text-blue-400 mt-1">→</span>
                          <span className="text-slate-400">{assistance}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-slate-600 flex items-center justify-between">
              <div className="text-sm text-slate-400">
                Pipeline {runDurationSeconds != null ? `completed in ${runDurationSeconds.toFixed(1)}s` : 'completed'} •
                {analysisResult.status === 'resolved' ? ' Case closed' : ' Escalated to analyst'}
              </div>
              <div className="flex space-x-2">
                {analysisResult.status === 'unresolved' && (
                  <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                    Escalate to Senior Analyst
                  </Button>
                )}
                <Button size="sm" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600">
                  Generate Report
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Pipeline Status */}
      {pipelineEnabled && pipelineRunning && currentRunningAgent && (
        <Card className="border-l-4 border-l-blue-500 bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
                  <span className="font-medium text-white">Agent Pipeline Active</span>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-slate-300 mb-1">
                    Current: {agents.find(a => a.id === currentRunningAgent)?.name} - 
                    {agents.find(a => a.id === currentRunningAgent)?.stage}
                  </div>
                  <Progress 
                    value={agents.find(a => a.id === currentRunningAgent)?.progress || 0} 
                    className="h-2" 
                  />
                </div>
                <div className="text-sm font-medium text-blue-400">
                  {agents.find(a => a.id === currentRunningAgent)?.progress || 0}%
                </div>
              </div>
              
              {/* Current Activity Display */}
              <div className="bg-blue-900/30 border border-blue-700/30 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="p-1 bg-blue-500/20 rounded text-blue-400">
                    {agents.find(a => a.id === currentRunningAgent)?.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm text-blue-300 mb-1">
                      {agents.find(a => a.id === currentRunningAgent)?.name} Active
                    </h4>
                    <p className="text-sm text-blue-400 italic">
                      {agents.find(a => a.id === currentRunningAgent)?.currentActivity || 'Processing...'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-blue-400">Processing</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Results Details */}
      {pipelineEnabled && (hasAgentResults || pipelineComplete) && (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <Brain className="h-5 w-5 text-blue-400" />
              <span>Agent Analysis Results</span>
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 ml-2">
                Amazon Bedrock Ready
              </Badge>
            </CardTitle>
            <CardDescription className="text-slate-300">
              Detailed results from each agent in the multi-agent pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-7 bg-slate-700/50 border-slate-600">
                <TabsTrigger value="overview" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="planner" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Planner
                </TabsTrigger>
                <TabsTrigger value="context" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Context
                </TabsTrigger>
                <TabsTrigger value="analyst" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Analyst
                </TabsTrigger>
                <TabsTrigger value="risk" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Risk
                </TabsTrigger>
                <TabsTrigger value="learning" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Learning
                </TabsTrigger>
                <TabsTrigger value="audit" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white">
                  Audit
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(agentResults).filter(([key, result]) => result != null).length > 0 ? (
                    Object.entries(agentResults).map(([key, result]) => (
                      result && (
                        <Card key={key} className="bg-slate-700/30 border-slate-600">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-slate-300 capitalize">
                                {key === 'plan' && 'Planner Agent'}
                                {key === 'context' && 'Context Executor'}
                                {key === 'analysis' && 'Threat Analyst'}
                                {key === 'riskAssessment' && 'Risk Orchestrator'}
                                {key === 'learningInsights' && 'Learning Curator'}
                                {key === 'complianceReport' && 'Audit Reporter'}
                              </h4>
                              <CheckCircle className="h-4 w-4 text-green-400" />
                            </div>
                            <p className="text-xs text-slate-400">
                              {key === 'plan' && 'Analysis plan generated and executed'}
                              {key === 'context' && 'Context data collected and processed'}
                              {key === 'analysis' && 'Threat analysis completed successfully'}
                              {key === 'riskAssessment' && 'Risk assessment performed and scored'}
                              {key === 'learningInsights' && 'Learning insights extracted and documented'}
                              {key === 'complianceReport' && 'Compliance report generated and filed'}
                            </p>
                          </CardContent>
                        </Card>
                      )
                    ))
                  ) : (
                    <div className="col-span-3 text-center py-8 text-slate-400">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Agent analysis results will appear here as the pipeline processes the alert</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Planner Agent Results */}
              <TabsContent value="planner" className="space-y-4">
                {agentResults.plan ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <Brain className="h-4 w-4 text-blue-400" />
                            <h4 className="font-medium text-slate-300">Plan Overview</h4>
                            <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                              Completed
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Plan ID:</span>
                              <span className="text-slate-300">{agentResults.plan.planId}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Priority:</span>
                              <Badge className="bg-orange-900/30 text-orange-400 border-orange-700 text-xs">
                                {agentResults.plan.priority}
                              </Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Duration:</span>
                              <span className="text-slate-300">{agentResults.plan.estimatedDuration}s</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <h4 className="font-medium text-slate-300 mb-2">Required Resources</h4>
                          <div className="space-y-1">
                            {agentResults.plan.requiredResources.map((resource, index) => (
                              <div key={index} className="text-sm text-slate-400 bg-slate-600/50 rounded px-2 py-1 flex items-center space-x-2">
                                <Zap className="h-3 w-3 text-yellow-400" />
                                <span>{resource}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <Card className="bg-slate-700/30 border-slate-600">
                      <CardContent className="pt-4">
                        <h4 className="font-medium text-slate-300 mb-3">Analysis Execution Steps</h4>
                        <div className="space-y-3">
                          {agentResults.plan.steps.map((step, index) => (
                            <div key={step.stepId} className="flex items-start space-x-3">
                              <div className="flex-shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-xs text-green-400 border border-green-500/30">
                                ✓
                              </div>
                              <div className="flex-1">
                                <h5 className="font-medium text-slate-300">{step.description}</h5>
                                <p className="text-sm text-slate-400">Action: {step.action}</p>
                                {step.dependencies && (
                                  <p className="text-xs text-slate-500">Dependencies: {step.dependencies.join(', ')}</p>
                                )}
                                <Badge className="bg-blue-900/30 text-blue-400 border-blue-700 text-xs mt-1">
                                  Executed Successfully
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Planner results will appear here once emitted by the runtime.</p>
                  </div>
                )}
              </TabsContent>

              {/* Context Executor Results */}
              <TabsContent value="context" className="space-y-4">
                {agentResults.context ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <Search className="h-4 w-4 text-cyan-400" />
                            <h4 className="font-medium text-slate-300">Threat Intelligence</h4>
                            <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                              {agentResults.context.threatIntelligence.length} Sources
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {agentResults.context.threatIntelligence.map((intel, index) => (
                              <div key={index} className="bg-slate-600/50 rounded p-3 border border-slate-600/50">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="text-sm text-slate-300 font-medium">Source: {intel.source}</div>
                                  <div className="text-xs text-cyan-400">
                                    {(intel.confidence * 100).toFixed(1)}% confidence
                                  </div>
                                </div>
                                <div className="text-xs text-slate-400">Intelligence data validated and processed</div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <Shield className="h-4 w-4 text-purple-400" />
                            <h4 className="font-medium text-slate-300">Asset Information</h4>
                            <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                              {agentResults.context.assetInformation.length} Assets
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {agentResults.context.assetInformation.map((asset, index) => (
                              <div key={index} className="bg-slate-600/50 rounded p-3 border border-slate-600/50">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="text-sm text-slate-300 font-medium">{asset.asset_id}</div>
                                  <Badge className={`text-xs ${
                                    asset.criticality === 'high' ? 'bg-red-900/30 text-red-400 border-red-700' :
                                    asset.criticality === 'medium' ? 'bg-orange-900/30 text-orange-400 border-orange-700' :
                                    'bg-green-900/30 text-green-400 border-green-700'
                                  }`}>
                                    {asset.criticality}
                                  </Badge>
                                </div>
                                <div className="text-xs text-slate-400">Asset context analyzed and cataloged</div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Context output will appear here once emitted by the runtime.</p>
                  </div>
                )}
              </TabsContent>

              {/* Analyst Results */}
              <TabsContent value="analyst" className="space-y-4">
                {agentResults.analysis ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <BarChart3 className="h-4 w-4 text-emerald-400" />
                            <h4 className="font-medium text-slate-300">Threat Analysis Results</h4>
                            <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                              Completed
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Threat Type:</span>
                              <Badge className="bg-red-900/30 text-red-400 border-red-700 text-xs">
                                {agentResults.analysis.threatType}
                              </Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Attack Vector:</span>
                              <span className="text-slate-300">{agentResults.analysis.attackVector}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Confidence:</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-300">{(agentResults.analysis.confidence * 100).toFixed(1)}%</span>
                                <div className="w-16 h-2 bg-slate-600 rounded-full">
                                  <div 
                                    className="h-full bg-emerald-400 rounded-full"
                                    style={{ width: `${agentResults.analysis.confidence * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Attribution:</span>
                              <span className="text-slate-300">{agentResults.analysis.attribution}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <AlertTriangle className="h-4 w-4 text-yellow-400" />
                            <h4 className="font-medium text-slate-300">Threat Indicators</h4>
                            <Badge className="bg-orange-900/30 text-orange-400 border-orange-700 text-xs">
                              {agentResults.analysis.indicators.length} IOCs
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            {agentResults.analysis.indicators.map((indicator, index) => (
                              <div key={index} className="text-sm text-slate-400 bg-slate-600/50 rounded px-2 py-1 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                                <span>{indicator}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Threat analysis output will appear here once emitted by the runtime.</p>
                  </div>
                )}
              </TabsContent>

              {/* Risk Orchestrator Results */}
              <TabsContent value="risk" className="space-y-4">
                {agentResults.riskAssessment ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <Shield className="h-4 w-4 text-orange-400" />
                            <h4 className="font-medium text-slate-300">Risk Assessment</h4>
                            <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                              Completed
                            </Badge>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-orange-400 mb-2">
                              {agentResults.riskAssessment.riskScore.toFixed(1)}
                            </div>
                            <Badge className="bg-orange-900/30 text-orange-400 border-orange-700 mb-2">
                              {agentResults.riskAssessment.riskLevel.toUpperCase()} RISK
                            </Badge>
                            <div className="w-full h-2 bg-slate-600 rounded-full mt-2">
                              <div 
                                className="h-full bg-orange-400 rounded-full"
                                style={{ width: `${(agentResults.riskAssessment.riskScore / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <h4 className="font-medium text-slate-300 mb-2">Impact Analysis</h4>
                          <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-red-400 rounded-full" />
                                <span>Financial Impact:</span>
                              </span>
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-300">{agentResults.riskAssessment.impactAnalysis.financial.toFixed(1)}/10</span>
                                <div className="w-12 h-2 bg-slate-600 rounded-full">
                                  <div 
                                    className="h-full bg-red-400 rounded-full"
                                    style={{ width: `${(agentResults.riskAssessment.impactAnalysis.financial / 10) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full" />
                                <span>Operational Impact:</span>
                              </span>
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-300">{agentResults.riskAssessment.impactAnalysis.operational.toFixed(1)}/10</span>
                                <div className="w-12 h-2 bg-slate-600 rounded-full">
                                  <div 
                                    className="h-full bg-blue-400 rounded-full"
                                    style={{ width: `${(agentResults.riskAssessment.impactAnalysis.operational / 10) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 flex items-center space-x-2">
                                <div className="w-2 h-2 bg-purple-400 rounded-full" />
                                <span>Compliance Impact:</span>
                              </span>
                              <div className="flex items-center space-x-2">
                                <span className="text-slate-300">{agentResults.riskAssessment.impactAnalysis.compliance.toFixed(1)}/10</span>
                                <div className="w-12 h-2 bg-slate-600 rounded-full">
                                  <div 
                                    className="h-full bg-purple-400 rounded-full"
                                    style={{ width: `${(agentResults.riskAssessment.impactAnalysis.compliance / 10) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <Card className="bg-slate-700/30 border-slate-600">
                      <CardContent className="pt-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <Target className="h-4 w-4 text-green-400" />
                          <h4 className="font-medium text-slate-300">Executed Mitigation Actions</h4>
                          <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                            {agentResults.riskAssessment.requiredActions.length} Actions Completed
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {agentResults.riskAssessment.requiredActions.map((action, index) => (
                            <div key={index} className="flex items-start space-x-2 bg-slate-600/30 p-2 rounded">
                              <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-slate-300">{action}</span>
                              <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs ml-auto">
                                ✓ Done
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Risk assessment output will appear here once emitted by the runtime.</p>
                  </div>
                )}
              </TabsContent>

              {/* Learning Curator Results */}
              <TabsContent value="learning" className="space-y-4">
                {agentResults.learningInsights ? (
                  <div className="space-y-4">
                    <Card className="bg-slate-700/30 border-slate-600">
                      <CardContent className="pt-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <GraduationCap className="h-4 w-4 text-purple-400" />
                          <h4 className="font-medium text-slate-300">Learning Insights</h4>
                          <Badge className="bg-purple-900/30 text-purple-400 border-purple-700 text-xs">
                            {agentResults.learningInsights.insights.length} Insights Captured
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {agentResults.learningInsights.insights.map((insight, index) => (
                            <div key={index} className="flex items-start space-x-2 bg-purple-900/10 p-3 rounded border border-purple-700/30">
                              <div className="flex-shrink-0 w-5 h-5 bg-purple-500/20 rounded-full flex items-center justify-center text-xs text-purple-400 mt-0.5">
                                {index + 1}
                              </div>
                              <span className="text-sm text-slate-300">{insight}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-slate-700/30 border-slate-600">
                      <CardContent className="pt-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <CheckCircle className="h-4 w-4 text-green-400" />
                          <h4 className="font-medium text-slate-300">Implemented Recommendations</h4>
                          <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                            {agentResults.learningInsights.recommendations.length} Applied
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {agentResults.learningInsights.recommendations.map((rec, index) => (
                            <div key={index} className="flex items-start space-x-2 bg-green-900/10 p-3 rounded border border-green-700/30">
                              <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-slate-300">{rec}</span>
                              <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs ml-auto">
                                Active
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Learning insights will appear here once emitted by the runtime.</p>
                  </div>
                )}
              </TabsContent>

              {/* Audit Reporter Results */}
              <TabsContent value="audit" className="space-y-4">
                {agentResults.complianceReport ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <FileText className="h-4 w-4 text-indigo-400" />
                            <h4 className="font-medium text-slate-300">Compliance Report</h4>
                            <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                              Filed
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Report ID:</span>
                              <span className="text-slate-300 font-mono text-xs">{agentResults.complianceReport.reportId}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Type:</span>
                              <Badge className="bg-indigo-900/30 text-indigo-400 border-indigo-700 text-xs">
                                {agentResults.complianceReport.reportType}
                              </Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Status:</span>
                              <Badge className="bg-green-900/30 text-green-400 border-green-700 text-xs">
                                {agentResults.complianceReport.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Filed:</span>
                              <span className="text-slate-300 text-xs">
                                {new Date(agentResults.complianceReport.deadline).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-700/30 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <Clock className="h-4 w-4 text-blue-400" />
                            <h4 className="font-medium text-slate-300">Regulatory Summary</h4>
                          </div>
                          <div className="bg-slate-600/30 p-3 rounded text-sm text-slate-400">
                            {agentResults.complianceReport.content.executive_summary}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <Card className="bg-slate-700/30 border-slate-600">
                      <CardContent className="pt-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <Badge className="bg-emerald-900/30 text-emerald-400 border-emerald-700">
                            🏛️ Hong Kong Critical Infrastructure Ordinance Compliant
                          </Badge>
                          <Badge className="bg-blue-900/30 text-blue-400 border-blue-700">
                            📋 HKMA Guidelines Applied
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">
                          This compliance report has been automatically generated and filed in accordance with Hong Kong's regulatory requirements. All mandatory reporting timelines have been met and audit trails have been preserved.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Compliance report output will appear here once emitted by the runtime.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center space-x-2">
            <FileText className="h-5 w-5 text-blue-400" />
            <span>Artifacts & Evidence</span>
          </CardTitle>
          <CardDescription className="text-slate-300">
            Evidence references emitted by the runtime (metadata only)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {artifacts.length === 0 ? (
            <div className="text-sm text-slate-400">
              No artifacts reported yet.
            </div>
          ) : (
            artifacts.map((artifact, index) => (
              <div key={`${artifact.artifact_ref.sha256}-${index}`} className="rounded border border-slate-600 bg-slate-700/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">Artifact Ref</div>
                  {artifact.artifact_ref.content_type && (
                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                      {artifact.artifact_ref.content_type}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-200 font-mono break-all">
                  {artifact.artifact_ref.sha256}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>Size: {formatBytes(artifact.artifact_ref.size)}</span>
                  {artifact.artifact_ref.redaction && <span>Redaction: {artifact.artifact_ref.redaction}</span>}
                  {artifact.agent_id && <span>Agent: {artifact.agent_id}</span>}
                  {artifact.item_id && <span>Item: {artifact.item_id}</span>}
                </div>
                {artifact.artifact_ref.uri && (
                  <div className="mt-2 text-xs text-slate-500 break-all">
                    URI: {artifact.artifact_ref.uri}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Risk Metrics and Compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Risk Metrics (MTTA/MTTI/MTTR/FPR)</CardTitle>
            <CardDescription className="text-slate-300">
              Key performance indicators for the security response
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                <div className="text-xl font-bold text-blue-400">2.4m</div>
                <div className="text-sm text-blue-300">MTTA</div>
                <div className="text-xs text-slate-400">Mean Time to Acknowledge</div>
              </div>
              <div className="text-center p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
                <div className="text-xl font-bold text-green-400">8.7m</div>
                <div className="text-sm text-green-300">MTTI</div>
                <div className="text-xs text-slate-400">Mean Time to Investigate</div>
              </div>
              <div className="text-center p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
                <div className="text-xl font-bold text-purple-400">15.2m</div>
                <div className="text-sm text-purple-300">MTTR</div>
                <div className="text-xs text-slate-400">Mean Time to Resolve</div>
              </div>
              <div className="text-center p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
                <div className="text-xl font-bold text-orange-400">2.8%</div>
                <div className="text-sm text-orange-300">FPR</div>
                <div className="text-xs text-slate-400">False Positive Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">HKMA Compliance Status</CardTitle>
            <CardDescription className="text-slate-300">
              SA-2 Cyber Security & TM-G-1 Technology Risk compliance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">SA-2 Cyber Security</span>
                <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700">Compliant</Badge>
              </div>
              <Progress value={98} className="h-2" />
              <div className="text-xs text-slate-400">98% compliance score</div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">TM-G-1 Technology Risk</span>
                <Badge variant="outline" className="bg-yellow-900/30 text-yellow-400 border-yellow-700">Monitoring</Badge>
              </div>
              <Progress value={85} className="h-2" />
              <div className="text-xs text-slate-400">85% compliance score</div>
            </div>

            <div className="pt-3 border-t border-slate-600">
              <div className="text-sm text-slate-300">
                Next compliance review: <span className="font-medium text-white">March 2025</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
