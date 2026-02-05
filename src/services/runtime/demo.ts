import { runtimeStore } from './store';
import type { SecurityAlert, AnalysisPlan, ContextData, ThreatAnalysis, RiskAssessment, LearningInsights, ComplianceReport } from '../agents';

// Demo Runtime Simulator
// Simulates multi-agent pipeline execution for demo mode

const AGENT_ORDER = [
  'planner',
  'context-executor',
  'analyst',
  'risk-orchestrator',
  'learning-curator',
  'audit-reporter',
] as const;

let sequenceCounter = 0;
let demoRunId: string | null = null;

const generateRunId = (): string => `demo-run-${Date.now()}`;

const generateSequence = (): number => {
  sequenceCounter += 1;
  return sequenceCounter;
};

const now = (): string => new Date().toISOString();

const emitEvent = (method: string, params: Record<string, unknown>) => {
  runtimeStore.handleEvent({
    method,
    params: {
      ...params,
      run_id: demoRunId,
      sequence: generateSequence(),
      ts: now(),
      schema_version: '1.0.0',
    },
  });
};

const generateAnalysisPlan = (alert: SecurityAlert): AnalysisPlan => ({
  planId: `plan-${alert.id}`,
  priority: alert.severity === 'critical' ? 1 : alert.severity === 'high' ? 2 : 3,
  estimatedDuration: 45,
  requiredResources: ['threat_intel_api', 'asset_database', 'historical_patterns'],
  steps: [
    {
      stepId: 'step-1',
      description: 'Collect threat intelligence context',
      action: 'context_collection',
      parameters: { sources: ['misp', 'virustotal'] },
    },
    {
      stepId: 'step-2',
      description: 'Analyze attack patterns and IOCs',
      action: 'threat_analysis',
      parameters: { enable_ml: true },
    },
    {
      stepId: 'step-3',
      description: 'Assess risk and business impact',
      action: 'risk_assessment',
      parameters: { include_compliance: true },
    },
    {
      stepId: 'step-4',
      description: 'Extract learning insights',
      action: 'learning_extraction',
      parameters: {},
    },
    {
      stepId: 'step-5',
      description: 'Generate compliance report',
      action: 'report_generation',
      parameters: { report_type: 'OGCIO' },
    },
  ],
});

const generateContextData = (): ContextData => ({
  threatIntelligence: [
    { source: 'MISP', confidence: 0.95, indicators: ['192.168.1.100', 'malware-hash-123'] },
    { source: 'VirusTotal', confidence: 0.87, detections: 15 },
  ],
  historicalPatterns: [
    { patternId: 'p-001', description: 'Similar lateral movement detected 3 weeks ago', relatedIncidents: ['INC-2025-003'] },
  ],
  assetInformation: [
    { assetId: 'web-server-01', criticality: 'high', owner: 'IT-Ops', exposure: 'public' },
    { assetId: 'db-server-01', criticality: 'critical', owner: 'DBA', exposure: 'internal' },
  ],
  networkTopology: {
    segments: ['DMZ', 'Internal', 'Database'],
    affectedSegment: 'DMZ',
    isolationAvailable: true,
  },
  securityPolicies: [
    { policyId: 'sec-001', name: 'CISO Incident Response', applies: true },
    { policyId: 'sec-002', name: 'HKMA Reporting Requirements', applies: true },
  ],
});

const generateThreatAnalysis = (alert: SecurityAlert): ThreatAnalysis => ({
  analysisId: `analysis-${alert.id}`,
  threatType: alert.title?.toLowerCase().includes('malware') ? 'Malware' : 'Intrusion Attempt',
  attackVector: 'External Network -> DMZ',
  indicators: ['192.168.1.100', 'suspicious-domain.com', 'file-hash-abc123'],
  confidence: 0.91,
  timeline: [
    { time: now(), event: 'Initial reconnaissance detected' },
    { time: now(), event: 'Exploitation attempt blocked' },
    { time: now(), event: 'Alert generated' },
  ],
  attribution: 'Unknown APT Group (TTPs match APT29)',
  relatedIncidents: ['INC-2025-003', 'INC-2025-007'],
});

const generateRiskAssessment = (): RiskAssessment => ({
  riskScore: 78,
  riskLevel: 'high',
  impactAnalysis: {
    financial: 85,
    operational: 70,
    reputational: 60,
    compliance: 90,
  },
  mitigationRecommendations: [
    'Isolate affected systems immediately',
    'Reset credentials for affected accounts',
    'Deploy additional monitoring on DMZ',
    'Initiate incident response playbook IR-001',
  ],
  requiredActions: [
    'Notify CISO within 1 hour',
    'Prepare OGCIO report within 12 hours',
    'Conduct forensic imaging',
  ],
});

const generateLearningInsights = (): LearningInsights => ({
  patternId: `pattern-${Date.now()}`,
  insights: [
    'Attack pattern matches known APT29 TTPs',
    'Initial access via compromised credentials',
    'Lateral movement attempts detected and blocked',
  ],
  recommendations: [
    'Enhance credential monitoring',
    'Update detection rules for similar patterns',
    'Conduct tabletop exercise for similar scenarios',
  ],
  modelUpdates: [
    { model: 'lateral_movement_detector', version: '2.3.1', improvement: 0.05 },
  ],
  performanceMetrics: {
    detection_accuracy: 0.94,
    false_positive_rate: 0.02,
    mean_time_to_detect: 4.5,
  },
});

const generateComplianceReport = (alert: SecurityAlert): ComplianceReport => ({
  reportId: `report-${alert.id}`,
  incidentId: alert.id,
  reportType: 'OGCIO',
  status: 'ready',
  deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  content: {
    executive_summary: `Critical security incident ${alert.id} detected affecting DMZ infrastructure. Immediate containment actions taken.`,
    incident_details: { severity: alert.severity, affectedAssets: 2, dataBreach: false },
    impact_assessment: { financial: 'Moderate', operational: 'High', reputational: 'Low' },
    response_actions: ['Isolation', 'Forensic imaging', 'Credential reset'],
    lessons_learned: 'Detection rules effective; response time within SLA.',
  },
  attachments: ['forensic-log.zip', 'ioc-list.csv'],
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const runAgent = async (
  agentId: string,
  alert: SecurityAlert,
  previousOutputs: Record<string, unknown>
): Promise<unknown> => {
  // Agent started
  emitEvent('turn/agent/started', {
    agent_id: agentId,
    thread_id: `${demoRunId}-${agentId}`,
    turn_id: `turn-${agentId}`,
    item_id: `item-${agentId}`,
  });

  // Simulate processing time
  await sleep(800 + Math.random() * 1200);

  // Generate intermediate progress events
  emitEvent('item/created', {
    agent_id: agentId,
    item_id: `item-${agentId}-progress`,
    type: 'progress',
    status: 'in_progress',
    payload: { message: 'Processing...' },
  });

  await sleep(500 + Math.random() * 800);

  // Generate output based on agent type
  let output: unknown;
  switch (agentId) {
    case 'planner':
      output = generateAnalysisPlan(alert);
      break;
    case 'context-executor':
      output = generateContextData();
      break;
    case 'analyst':
      output = generateThreatAnalysis(alert);
      break;
    case 'risk-orchestrator':
      output = generateRiskAssessment();
      break;
    case 'learning-curator':
      output = generateLearningInsights();
      break;
    case 'audit-reporter':
      output = generateComplianceReport(alert);
      break;
    default:
      output = {};
  }

  // Emit output as item
  emitEvent('item/created', {
    agent_id: agentId,
    item_id: `item-${agentId}-output`,
    type: 'output',
    status: 'completed',
    output,
  });

  // Agent completed
  emitEvent('turn/agent/completed', {
    agent_id: agentId,
    thread_id: `${demoRunId}-${agentId}`,
    turn_id: `turn-${agentId}`,
    item_id: `item-${agentId}`,
  });

  return output;
};

export const demoRuntime = {
  isRunning: (): boolean => demoRunId !== null,

  startRun: async (alert: SecurityAlert): Promise<void> => {
    if (demoRunId) {
      // Clean up previous run
      runtimeStore.clearRun(demoRunId);
    }

    demoRunId = generateRunId();
    sequenceCounter = 0;

    // Initialize run
    runtimeStore.setActiveRun(demoRunId);
    runtimeStore.hydrateRunMetadata(demoRunId, {
      alertId: alert.id,
      alertTitle: alert.title,
      alertDescription: alert.description,
      severity: alert.severity,
      source: alert.source,
      timestamp: alert.timestamp,
      status: 'new',
    });

    // Start run event
    emitEvent('run/started', {
      alert: {
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        source: alert.source,
        timestamp: alert.timestamp,
      },
    });

    // Execute agents in dependency order with parallelization where possible
    const outputs: Record<string, unknown> = {};

    // Stage 1: Planner (must complete first)
    outputs.planner = await runAgent('planner', alert, outputs);

    // Stage 2: Context Executor and Analyst (can run in parallel)
    const [contextResult, analystResult] = await Promise.all([
      runAgent('context-executor', alert, outputs),
      runAgent('analyst', alert, outputs),
    ]);
    outputs['context-executor'] = contextResult;
    outputs.analyst = analystResult;

    // Stage 3: Risk Orchestrator (depends on analyst)
    outputs['risk-orchestrator'] = await runAgent('risk-orchestrator', alert, outputs);

    // Stage 4: Learning Curator (depends on analyst)
    outputs['learning-curator'] = await runAgent('learning-curator', alert, outputs);

    // Stage 5: Audit Reporter (depends on risk orchestrator)
    outputs['audit-reporter'] = await runAgent('audit-reporter', alert, outputs);

    // Complete run
    emitEvent('run/completed', {
      outcome: {
        status: 'resolved',
        summary: `Analysis complete for incident ${alert.id}. Threat identified and contained.`,
        actions: [
          'Threat analyzed and categorized',
          'Risk assessed and documented',
          'Compliance report generated',
          'Learning insights extracted',
        ],
        confidence: 0.92,
        completedTimestamp: now(),
      },
    });

    // Reset demo run ID after completion
    demoRunId = null;
  },

  stopRun: (): void => {
    if (demoRunId) {
      emitEvent('run/failed', {
        error: 'Run cancelled by user',
      });
      demoRunId = null;
    }
  },
};
