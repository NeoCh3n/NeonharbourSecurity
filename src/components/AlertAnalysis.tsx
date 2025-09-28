import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Brain, 
  Search, 
  BarChart3, 
  Shield, 
  BookOpen, 
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
import { 
  AgentOrchestrator,
  PlannerAgent,
  ContextExecutorAgent,
  AnalystAgent,
  RiskOrchestratorAgent,
  LearningCuratorAgent,
  AuditReporterAgent,
  type SecurityAlert,
  type AgentResponse,
  type AnalysisPlan,
  type ContextData,
  type ThreatAnalysis,
  type RiskAssessment,
  type LearningInsights,
  type ComplianceReport
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

export function AlertAnalysis({ currentAlertId }: AlertAnalysisProps) {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<string, { status: Agent['status']; progress: number }>>({});
  const [currentRunningAgent, setCurrentRunningAgent] = useState<string | null>(null);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    status: 'resolved' | 'unresolved';
    summary: string;
    actions: string[];
    uncertainties?: string[];
    assistanceNeeded?: string[];
  } | null>(null);
  const [agentActivities, setAgentActivities] = useState<Record<string, string>>({});
  
  const intervalRefs = useRef<Record<string, NodeJS.Timeout>>({});

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      intervalRefs.current = {};
    };
  }, []);

  // Mock alert data - includes all alerts from AlertSummary
  const alertDetails = {
    'AL-2025-HK-001': {
      title: 'Suspicious API calls from unusual geographic location',
      severity: 'critical' as const,
      source: 'Amazon GuardDuty',
      timestamp: '2025-01-15T10:30:00Z',
      description: 'Multiple high-privilege API calls detected from IP addresses in regions not typically accessed by this account. Potential compromise or unauthorized access attempt.',
      affectedAssets: ['EC2 Instance i-1234567890abcdef0', 'S3 Bucket prod-data-bucket', 'IAM Role admin-access'],
      location: 'Eastern Europe',
      confidence: 87,
      status: 'investigating'
    },
    'AL-2025-HK-002': {
      title: 'Multiple failed authentication attempts detected',
      severity: 'high' as const,
      source: 'AWS Security Hub',
      timestamp: '2025-01-15T09:45:00Z',
      description: 'Brute force attack attempt detected against multiple user accounts from distributed IP addresses.',
      affectedAssets: ['IAM Users', 'Login Portal', 'Authentication Service'],
      location: 'Multiple Regions',
      confidence: 92,
      status: 'analyzing'
    },
    'AL-2025-HK-003': {
      title: 'Unusual network traffic pattern detected',
      severity: 'medium' as const,
      source: 'CloudWatch Logs',
      timestamp: '2025-01-15T08:20:00Z',
      description: 'Abnormal data transfer volumes detected during off-hours, suggesting potential data exfiltration.',
      affectedAssets: ['VPC vpc-12345678', 'Database RDS-prod-01'],
      location: 'Asia Pacific',
      confidence: 76,
      status: 'new'
    },
    'AL-2025-HK-004': {
      title: 'Malware signature detected in S3 upload',
      severity: 'high' as const,
      source: 'Amazon Security Lake',
      timestamp: '2025-01-15T07:15:00Z',
      description: 'Known malware hash detected in file uploaded to S3 bucket. File quarantined automatically.',
      affectedAssets: ['S3 Bucket uploads-bucket', 'Lambda Function file-scanner'],
      location: 'Singapore',
      confidence: 94,
      status: 'responded'
    },
    'AL-2025-HK-005': {
      title: 'Privilege escalation attempt via IAM policy modification',
      severity: 'critical' as const,
      source: 'AWS CloudTrail',
      timestamp: '2025-01-15T06:30:00Z',
      description: 'Unauthorized attempt to modify IAM policies to grant excessive permissions. Action blocked by guardrails.',
      affectedAssets: ['IAM Role admin-role', 'IAM Policy SecurityPolicy'],
      location: 'Hong Kong',
      confidence: 91,
      status: 'resolved'
    }
  };

  const currentAlert = currentAlertId ? alertDetails[currentAlertId as keyof typeof alertDetails] : alertDetails['AL-2025-HK-001'];

  // Auto-show results for resolved alerts
  useEffect(() => {
    if (currentAlert?.status === 'resolved') {
      // For resolved alerts, immediately show the analysis result
      const result = generateAnalysisResult(currentAlert.title, currentAlertId || 'AL-2025-HK-001');
      setAnalysisResult(result);
      setPipelineComplete(true);
      
      // Set all agents as completed for resolved alerts
      const completedStates: Record<string, { status: Agent['status']; progress: number }> = {};
      const completedActivities: Record<string, string> = {};
      
      baseAgents.forEach(agent => {
        completedStates[agent.id] = { status: 'completed', progress: 100 };
        const activities = getAgentActivities(agent.id);
        completedActivities[agent.id] = activities[activities.length - 1];
      });
      
      setAgentStates(completedStates);
      setAgentActivities(completedActivities);

      // Generate mock agent results for resolved alerts to show in analysis tabs
      const mockAgentResults = generateMockAgentResults(currentAlertId || 'AL-2025-HK-005');
      setAgentResults(mockAgentResults);
    } else {
      // Reset for non-resolved alerts
      setPipelineComplete(false);
      setAnalysisResult(null);
    }
  }, [currentAlertId, currentAlert?.status]);

  const baseAgents: Agent[] = [
    {
      id: 'planner',
      name: 'Planner Agent',
      description: 'Creates comprehensive analysis plans for security incidents',
      stage: 'Plan',
      status: 'completed',
      progress: 100,
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
      status: 'running',
      progress: 75,
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
      status: 'running',
      progress: 45,
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

  // Agent activity messages based on progress - Ready for Bedrock integration
  const getAgentActivities = (agentId: string) => {
    const activities: Record<string, string[]> = {
      'planner': [
        'Connecting to Amazon Bedrock Planner Agent...',
        'Analyzing alert severity and classification...',
        'Generating comprehensive analysis plan...',
        'Estimating resource requirements and timeline...',
        'Prioritizing investigation steps...',
        'Analysis plan ready for execution'
      ],
      'context-executor': [
        'Initializing Amazon Bedrock Context Agent...',
        'Gathering threat intelligence from multiple feeds...',
        'Collecting historical pattern data...',
        'Enriching with asset and network topology...',
        'Integrating security policies and compliance data...',
        'Context enrichment complete'
      ],
      'analyst': [
        'Activating Amazon Bedrock Analyst Agent...',
        'Performing deep threat analysis with ML models...',
        'Generating attack timeline and attribution...',
        'Extracting indicators of compromise (IOCs)...',
        'Mapping to MITRE ATT&CK framework...',
        'Cross-referencing with threat intelligence...',
        'Calculating confidence scores...',
        'Comprehensive threat analysis complete'
      ],
      'risk-orchestrator': [
        'Engaging Amazon Bedrock Risk Agent...',
        'Calculating comprehensive risk scores...',
        'Analyzing financial and operational impact...',
        'Generating automated response recommendations...',
        'Checking HKMA compliance requirements...',
        'Preparing HITL approval workflows...',
        'Risk assessment and response plan ready'
      ],
      'learning-curator': [
        'Activating Amazon Bedrock Learning Agent...',
        'Extracting insights from incident patterns...',
        'Updating detection models with new data...',
        'Recording performance improvements...',
        'Optimizing system behavioral parameters...',
        'Learning adaptation complete'
      ],
      'audit-reporter': [
        'Initializing Amazon Bedrock Audit Agent...',
        'Generating OGCIO compliance report...',
        'Creating HKMA regulatory documentation...',
        'Preparing immutable audit trail...',
        'Checking 12/48 hour deadline requirements...',
        'Formatting regulatory submission...',
        'Compliance report ready for submission'
      ]
    };
    return activities[agentId] || ['Processing...'];
  };

  const getActivityForProgress = (agentId: string, progress: number) => {
    const activities = getAgentActivities(agentId);
    const index = Math.min(Math.floor((progress / 100) * activities.length), activities.length - 1);
    return activities[index] || activities[0];
  };

  // Apply dynamic state to agents (start all at 0% initially)
  const agents = useMemo(() => {
    return baseAgents.map(agent => {
      const currentState = agentStates[agent.id];
      const progress = currentState?.progress ?? (agent.id === 'planner' ? 100 : 0);
      const status = (currentState?.status as Agent['status']) ?? (agent.id === 'planner' ? 'completed' : 'idle');
      
      return {
        ...agent,
        status,
        progress,
        currentActivity: agentActivities[agent.id] || getActivityForProgress(agent.id, progress)
      };
    });
  }, [agentStates, agentActivities]);

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

  // Agent processing durations (in seconds) - adjusted for stability
  const agentDurations: Record<string, number> = {
    'planner': 0, // Already completed
    'context-executor': 6,
    'analyst': 10, // Increased for complex analysis
    'risk-orchestrator': 5,
    'learning-curator': 4,
    'audit-reporter': 3
  };

  // Store agent results for pipeline execution
  const [agentResults, setAgentResults] = useState<{
    plan?: AnalysisPlan;
    context?: ContextData;
    analysis?: ThreatAnalysis;
    riskAssessment?: RiskAssessment;
    learningInsights?: LearningInsights;
    complianceReport?: ComplianceReport;
  }>({});

  // Generate analysis results for resolved and ongoing alerts
  const generateAnalysisResult = (alertTitle: string, alertId?: string) => {
    // For resolved alerts, return specific results based on alert ID
    if (currentAlert?.status === 'resolved') {
      if (alertId === 'AL-2025-HK-005') {
        return {
          status: 'resolved' as const,
          summary: `Analysis complete: The privilege escalation attempt has been successfully blocked by automated guardrails. Investigation confirmed the attempt was made by a compromised service account that gained access through credential stuffing. The account has been disabled and all policies have been restored to their original state.`,
          actions: [
            'Automatically blocked IAM policy modification attempt',
            'Disabled compromised service account sa-backup-automation',
            'Restored original IAM policy SecurityPolicy to baseline state',
            'Implemented additional MFA requirements for IAM policy changes',
            'Added anomaly detection rules for privilege escalation patterns',
            'Notified security team and initiated credential rotation protocol'
          ],
          completedTimestamp: '2025-01-15T06:45:23Z',
          analysisTime: '15 minutes',
          confidence: 96
        };
      }
      
      if (alertId === 'AL-2025-HK-004') {
        return {
          status: 'resolved' as const,
          summary: `Analysis complete: Malware signature successfully identified and contained. The uploaded file contained a known trojan variant that was immediately quarantined by Lambda-based scanning. Source IP has been blocked and no lateral movement detected.`,
          actions: [
            'Quarantined malicious file hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'Blocked source IP 192.0.2.50 at network perimeter',
            'Scanned all files in uploads-bucket for similar signatures',
            'Strengthened Lambda file-scanner with updated malware definitions',
            'Implemented additional file type restrictions for S3 uploads'
          ],
          completedTimestamp: '2025-01-15T07:30:15Z',
          analysisTime: '8 minutes',
          confidence: 99
        };
      }
    }
    
    // For ongoing alerts, simulate different outcomes
    const isResolved = Math.random() > 0.3; // 70% resolution rate
    
    if (isResolved) {
      return {
        status: 'resolved' as const,
        summary: `Analysis complete: The suspicious activity has been identified as a false positive. The unusual geographic API calls were traced to a legitimate automated backup process initiated by the DevOps team using a new cloud region for disaster recovery testing.`,
        actions: [
          'Updated geographic allowlist to include the new backup region',
          'Notified DevOps team to use proper service accounts for future testing',
          'Implemented additional context checks for automated processes',
          'Created whitelist rule for disaster recovery IP ranges'
        ]
      };
    } else {
      return {
        status: 'unresolved' as const,
        summary: `Analysis requires human intervention: The investigation has identified potential indicators of compromise that require additional verification and specialized expertise.`,
        actions: [
          'Isolated affected EC2 instances pending further investigation',
          'Captured network traffic logs for forensic analysis',
          'Initiated incident response protocol Level 2'
        ],
        uncertainties: [
          'Unable to verify legitimacy of API calls due to insufficient logging detail',
          'Multiple authentication vectors detected but correlation unclear',
          'Potential lateral movement indicators require expert validation'
        ],
        assistanceNeeded: [
          'Security analyst review of captured network traffic',
          'Manual verification of affected user account activities',
          'Coordination with cloud infrastructure team for detailed access logs',
          'Possible involvement of external forensics team'
        ]
      };
    }
  };

  // Generate mock agent results for resolved alerts
  const generateMockAgentResults = (alertId: string) => {
    const mockResults: {
      plan?: AnalysisPlan;
      context?: ContextData;
      analysis?: ThreatAnalysis;
      riskAssessment?: RiskAssessment;
      learningInsights?: LearningInsights;
      complianceReport?: ComplianceReport;
    } = {};

    // Mock Planner Agent Results
    mockResults.plan = {
      planId: `plan-${alertId.replace('AL-', 'PLN-')}`,
      steps: [
        {
          stepId: 'step-context',
          description: 'Gather threat intelligence and asset context',
          action: 'context_collection',
          parameters: { 
            alert_id: alertId,
            severity: currentAlert.severity,
            sources: ['threat_intel', 'asset_db', 'historical_data']
          }
        },
        {
          stepId: 'step-analysis',
          description: 'Perform detailed threat analysis and attribution',
          action: 'threat_analysis',
          parameters: { 
            analysis_type: 'comprehensive',
            include_attribution: true,
            include_timeline: true
          },
          dependencies: ['step-context']
        },
        {
          stepId: 'step-risk',
          description: 'Assess business risk and compliance impact',
          action: 'risk_assessment',
          parameters: { 
            include_financial_impact: true,
            compliance_frameworks: ['HKMA', 'OGCIO']
          },
          dependencies: ['step-analysis']
        }
      ],
      priority: currentAlert.severity === 'critical' ? 1 : 2,
      estimatedDuration: 1800,
      requiredResources: ['threat_intelligence', 'asset_database', 'compliance_engine']
    };

    // Mock Context Executor Results
    mockResults.context = {
      threatIntelligence: [
        {
          source: 'AlienVault OTX',
          indicators: ['malicious-domain.example.com', '192.0.2.100'],
          reputation: 'malicious',
          first_seen: '2025-01-10T00:00:00Z',
          confidence: 0.89
        },
        {
          source: 'VirusTotal',
          indicators: ['sha256:a1b2c3d4e5f6789...'],
          reputation: 'suspicious',
          first_seen: '2025-01-12T00:00:00Z',
          confidence: 0.76
        }
      ],
      historicalPatterns: [
        {
          pattern_id: 'privilege-escalation-001',
          similar_incidents: 5,
          success_rate: 0.2,
          common_techniques: ['T1078.004', 'T1548.001', 'T1484.001']
        }
      ],
      assetInformation: [
        {
          asset_id: 'iam-role-admin',
          criticality: 'high',
          location: 'Hong Kong',
          services: ['IAM', 'Policy Management'],
          last_patched: '2025-01-01T00:00:00Z'
        }
      ],
      networkTopology: {
        subnet: '10.0.0.0/16',
        connected_assets: 42,
        security_zones: ['Management', 'Production'],
        access_controls: ['IAM Policies', 'Guard Duty', 'CloudTrail']
      },
      securityPolicies: [
        {
          policy_id: 'IAM-SEC-001',
          name: 'Administrative Access Policy',
          version: '3.2',
          applicable: true
        }
      ]
    };

    // Mock Analyst Results
    mockResults.analysis = {
      analysisId: `analysis-${alertId.replace('AL-', 'TAN-')}`,
      threatType: 'Privilege Escalation',
      attackVector: 'IAM Policy Manipulation',
      indicators: [
        'Unauthorized IAM:PutRolePolicy API call',
        'Policy modification outside business hours',
        'Excessive permissions requested',
        'Service account credential compromise'
      ],
      confidence: 0.91,
      timeline: [
        {
          timestamp: '2025-01-15T06:25:00Z',
          event: 'Service account compromise detected',
          evidence: 'Unusual login pattern from service account'
        },
        {
          timestamp: '2025-01-15T06:30:00Z',
          event: 'IAM policy modification attempted',
          evidence: 'IAM:PutRolePolicy API call with excessive permissions'
        },
        {
          timestamp: '2025-01-15T06:30:15Z',
          event: 'Automatic policy guardrail triggered',
          evidence: 'Policy change blocked by compliance engine'
        }
      ],
      attribution: 'Internal Threat Actor - Compromised Service Account',
      relatedIncidents: ['INC-2024-234', 'INC-2024-298']
    };

    // Mock Risk Assessment Results
    mockResults.riskAssessment = {
      riskScore: 8.7,
      riskLevel: 'high',
      impactAnalysis: {
        financial: 7.5,
        operational: 8.2,
        reputational: 6.8,
        compliance: 9.1
      },
      mitigationRecommendations: [
        'Implement additional MFA for administrative accounts',
        'Deploy behavioral analytics for service accounts',
        'Strengthen IAM policy change approval workflows',
        'Enhance monitoring of privilege escalation attempts'
      ],
      requiredActions: [
        'Immediately disable compromised service account',
        'Audit all IAM policy changes in past 30 days',
        'Implement emergency access controls',
        'Notify HKMA within regulatory timeframe',
        'Conduct forensic analysis of affected systems'
      ]
    };

    // Mock Learning Insights
    mockResults.learningInsights = {
      patternId: `pattern-${Date.now()}`,
      insights: [
        'Service account compromise patterns indicate credential stuffing attack vector',
        'Policy modification attempts occur predominantly during off-hours (85% of cases)',
        'Current IAM guardrails successfully prevented privilege escalation in 97% of attempts',
        'Similar attack patterns observed across 3 other financial institutions in APAC region'
      ],
      recommendations: [
        'Implement time-based access controls for administrative functions',
        'Deploy additional behavioral analytics for service account usage patterns',
        'Enhance integration between threat intelligence and IAM monitoring',
        'Strengthen incident response playbook for privilege escalation scenarios'
      ],
      modelUpdates: [
        {
          model: 'privilege_escalation_detection',
          update_type: 'threshold_adjustment',
          confidence_improvement: 0.08
        }
      ],
      performanceMetrics: {
        detection_accuracy: 0.96,
        false_positive_rate: 0.04,
        mean_time_to_detection: 45,
        mean_time_to_response: 230
      }
    };

    // Mock Compliance Report
    mockResults.complianceReport = {
      reportId: `OGCIO-${Date.now()}`,
      incidentId: alertId,
      reportType: 'OGCIO',
      status: 'submitted',
      deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
      content: {
        executive_summary: 'Critical privilege escalation attempt detected and successfully mitigated. Compromised service account attempted unauthorized IAM policy modification but was blocked by automated guardrails. No customer data accessed. Full containment achieved within 15 minutes. Investigation completed with all regulatory requirements met.',
        incident_details: {
          detection_time: currentAlert.timestamp,
          incident_type: 'Privilege Escalation',
          attack_vector: 'IAM Policy Manipulation',
          affected_systems: ['IAM Service', 'Administrative Roles'],
          data_classification: 'System Administrative Data',
          geographical_scope: 'Hong Kong'
        },
        impact_assessment: {
          financial_impact: 'Minimal - no business operations affected',
          operational_impact: 'None - services maintained throughout incident',
          customer_impact: 'None - no customer data accessed or compromised',
          regulatory_implications: 'OGCIO notification completed within required timeframe'
        },
        response_actions: {
          immediate_containment: 'Automated policy guardrails blocked unauthorized changes',
          investigation_status: 'Complete - full forensic analysis conducted',
          communication_plan: 'All stakeholders notified, regulatory filing submitted',
          remediation_timeline: 'Remediation completed within 2 hours of detection'
        },
        lessons_learned: {
          detection_effectiveness: 'Excellent - automated detection within 45 seconds',
          response_effectiveness: 'Optimal - full containment in under 15 minutes',
          improvement_areas: ['Service account monitoring', 'Off-hours access controls'],
          policy_updates: 'Enhanced IAM policy change approval workflow implemented'
        }
      },
      attachments: [
        'iam_audit_trail.json',
        'forensic_analysis_report.pdf',
        'compliance_evidence_package.zip'
      ]
    };

    return mockResults;
  };

  const runAgent = async (agentId: string, startProgress: number = 0) => {
    const duration = agentDurations[agentId];
    if (duration === 0) return Promise.resolve();

    // Create alert object from current alert data
    const alertData: SecurityAlert = {
      id: currentAlertId || 'AL-2025-HK-001',
      title: currentAlert.title,
      description: currentAlert.description,
      severity: currentAlert.severity,
      source: currentAlert.source,
      timestamp: currentAlert.timestamp,
      iocs: currentAlert.affectedAssets || []
    };

    return new Promise<void>((resolve, reject) => {
      // Clear any existing interval for this agent
      if (intervalRefs.current[agentId]) {
        clearInterval(intervalRefs.current[agentId]);
        delete intervalRefs.current[agentId];
      }

      setCurrentRunningAgent(agentId);
      setAgentStates(prev => ({
        ...prev,
        [agentId]: { status: 'running', progress: startProgress }
      }));

      let progress = startProgress;
      const incrementStep = (100 - startProgress) / (duration * 10); // Update every 100ms
      let isCompleted = false;
      let timeoutId: NodeJS.Timeout | null = null;

      // Execute actual agent call based on agent type
      const executeAgentCall = async () => {
        try {
          let agentResponse: AgentResponse<any>;
          
          switch (agentId) {
            case 'planner':
              agentResponse = await PlannerAgent.generateAnalysisPlan(alertData);
              if (agentResponse.success && agentResponse.data) {
                setAgentResults(prev => ({ ...prev, plan: agentResponse.data }));
              } else {
                throw new Error(agentResponse.error || 'Planner agent failed');
              }
              break;
              
            case 'context-executor':
              // Create a default context step if no plan is available
              const contextStep = agentResults.plan?.steps?.find(s => s.action === 'context_collection') || {
                stepId: 'default-context',
                description: 'Default context collection',
                action: 'context_collection',
                parameters: {
                  alert_id: alertData.id,
                  severity: alertData.severity,
                  sources: ['threat_intel', 'historical_data']
                }
              };
              
              agentResponse = await ContextExecutorAgent.executeContextCollection(contextStep, alertData);
              if (agentResponse.success && agentResponse.data) {
                setAgentResults(prev => ({ ...prev, context: agentResponse.data }));
              } else {
                throw new Error(agentResponse.error || 'Context executor agent failed');
              }
              break;
              
            case 'analyst':
              // Wait for context to be available or use a default context
              const contextData = agentResults.context || await new Promise<ContextData>((resolve) => {
                // Check if context is available in state
                const checkContext = () => {
                  if (agentResults.context) {
                    resolve(agentResults.context);
                  } else {
                    // Create minimal context for analysis
                    resolve({
                      threatIntelligence: [{
                        source: 'Internal Analysis',
                        indicators: alertData.iocs || [],
                        reputation: 'unknown',
                        first_seen: alertData.timestamp,
                        confidence: 0.5
                      }],
                      historicalPatterns: [],
                      assetInformation: [{
                        asset_id: 'unknown',
                        criticality: alertData.severity,
                        location: 'unknown',
                        services: [],
                        last_patched: new Date().toISOString()
                      }],
                      networkTopology: {},
                      securityPolicies: []
                    });
                  }
                };
                setTimeout(checkContext, 100); // Small delay to check for context
              });
              
              agentResponse = await AnalystAgent.performThreatAnalysis(alertData, contextData);
              if (agentResponse.success && agentResponse.data) {
                setAgentResults(prev => ({ ...prev, analysis: agentResponse.data }));
              } else {
                throw new Error(agentResponse.error || 'Analyst agent failed');
              }
              break;
              
            case 'risk-orchestrator':
              // Ensure we have required data
              const analysisData = agentResults.analysis;
              const contextForRisk = agentResults.context;
              
              if (!analysisData) {
                throw new Error('Analysis data required for risk assessment');
              }
              
              const finalContextData = contextForRisk || {
                threatIntelligence: [],
                historicalPatterns: [],
                assetInformation: [],
                networkTopology: {},
                securityPolicies: []
              };
              
              agentResponse = await RiskOrchestratorAgent.performRiskAssessment(alertData, analysisData, finalContextData);
              if (agentResponse.success && agentResponse.data) {
                setAgentResults(prev => ({ ...prev, riskAssessment: agentResponse.data }));
              } else {
                throw new Error(agentResponse.error || 'Risk orchestrator agent failed');
              }
              break;
              
            case 'learning-curator':
              const analysisForLearning = agentResults.analysis;
              if (!analysisForLearning) {
                throw new Error('Analysis data required for learning insights');
              }
              
              agentResponse = await LearningCuratorAgent.extractLearningInsights(alertData, analysisForLearning, { status: 'completed' });
              if (agentResponse.success && agentResponse.data) {
                setAgentResults(prev => ({ ...prev, learningInsights: agentResponse.data }));
              } else {
                throw new Error(agentResponse.error || 'Learning curator agent failed');
              }
              break;
              
            case 'audit-reporter':
              const analysisForAudit = agentResults.analysis;
              const riskForAudit = agentResults.riskAssessment;
              
              if (!analysisForAudit || !riskForAudit) {
                throw new Error('Analysis and risk assessment data required for compliance report');
              }
              
              agentResponse = await AuditReporterAgent.generateComplianceReport(alertData, analysisForAudit, riskForAudit, 'OGCIO');
              if (agentResponse.success && agentResponse.data) {
                setAgentResults(prev => ({ ...prev, complianceReport: agentResponse.data }));
              } else {
                throw new Error(agentResponse.error || 'Audit reporter agent failed');
              }
              break;
              
            default:
              // Fallback for unknown agent
              return;
          }
          
          console.log(`Agent ${agentId} executed successfully:`, agentResponse);
        } catch (error) {
          console.error(`Agent ${agentId} execution failed:`, error);
          throw error;
        }
      };

      // Start the actual agent execution asynchronously
      executeAgentCall().catch(error => {
        console.error(`Error executing ${agentId}:`, error);
      });
      
      const cleanup = () => {
        if (intervalRefs.current[agentId]) {
          clearInterval(intervalRefs.current[agentId]);
          delete intervalRefs.current[agentId];
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const completeAgent = () => {
        if (isCompleted) return;
        isCompleted = true;
        cleanup();
        
        setAgentStates(prev => ({
          ...prev,
          [agentId]: { status: 'completed', progress: 100 }
        }));
        
        // Set final completion message
        const activities = getAgentActivities(agentId);
        setAgentActivities(prev => ({
          ...prev,
          [agentId]: activities[activities.length - 1]
        }));
        
        resolve();
      };

      const failAgent = (error: Error) => {
        if (isCompleted) return;
        isCompleted = true;
        cleanup();
        
        setAgentStates(prev => ({
          ...prev,
          [agentId]: { status: 'error', progress: Math.round(progress) }
        }));
        
        setAgentActivities(prev => ({
          ...prev,
          [agentId]: `Error: ${error.message}`
        }));
        
        reject(error);
      };
      
      intervalRefs.current[agentId] = setInterval(() => {
        if (isCompleted) return; // Prevent race condition
        
        progress = Math.min(100, progress + incrementStep);
        const currentProgress = Math.round(progress);
        
        // Update progress and activity message
        setAgentStates(prev => ({
          ...prev,
          [agentId]: { status: 'running', progress: currentProgress }
        }));

        // Update current activity based on progress
        const currentActivity = getActivityForProgress(agentId, currentProgress);
        setAgentActivities(prev => ({
          ...prev,
          [agentId]: currentActivity
        }));

        if (progress >= 100) {
          completeAgent();
        }
      }, 100);

      // Add timeout as safety measure - increased timeout for stability
      timeoutId = setTimeout(() => {
        failAgent(new Error(`Agent ${agentId} timed out after ${duration + 5} seconds`));
      }, (duration * 1000) + 5000); // 5 second buffer for agent execution
    });
  };

  const startPipelineExecution = async () => {
    setPipelineRunning(true);
    setPipelineComplete(false);
    setAnalysisResult(null);

    // Reset all agents to 0% and idle status
    const initialStates: Record<string, { status: Agent['status']; progress: number }> = {};
    const initialActivities: Record<string, string> = {};
    
    baseAgents.forEach(agent => {
      initialStates[agent.id] = { 
        status: agent.id === 'planner' ? 'completed' : 'idle', 
        progress: agent.id === 'planner' ? 100 : 0 
      };
      initialActivities[agent.id] = getActivityForProgress(agent.id, agent.id === 'planner' ? 100 : 0);
    });
    
    setAgentStates(initialStates);
    setAgentActivities(initialActivities);

    // Initialize with planner results to ensure proper sequencing
    const alertData: SecurityAlert = {
      id: currentAlertId || 'AL-2025-HK-001',
      title: currentAlert.title,
      description: currentAlert.description,
      severity: currentAlert.severity,
      source: currentAlert.source,
      timestamp: currentAlert.timestamp,
      iocs: currentAlert.affectedAssets || []
    };

    try {
      // Initialize planner results for proper dependency handling
      console.log('Initializing planner results...');
      const plannerResult = await PlannerAgent.generateAnalysisPlan(alertData);
      if (plannerResult.success && plannerResult.data) {
        setAgentResults(prev => ({ ...prev, plan: plannerResult.data }));
      }

      // Sequential execution of agents with proper error handling
      console.log('Starting context-executor...');
      await runAgent('context-executor', 0);
      
      console.log('Starting analyst...');
      await runAgent('analyst', 0);
      
      console.log('Starting risk-orchestrator...');
      await runAgent('risk-orchestrator', 0);
      
      console.log('Starting learning-curator...');
      await runAgent('learning-curator', 0);
      
      console.log('Starting audit-reporter...');
      await runAgent('audit-reporter', 0);

      // Generate final analysis result
      const result = generateAnalysisResult(currentAlert?.title || '', currentAlertId || 'AL-2025-HK-001');
      setAnalysisResult(result);
      setPipelineComplete(true);
      setCurrentRunningAgent(null);
      setPipelineRunning(false);
      
      console.log('Pipeline execution completed successfully');
    } catch (error) {
      console.error('Pipeline execution failed:', error);
      
      // Set error state for the current running agent
      if (currentRunningAgent) {
        setAgentStates(prev => ({
          ...prev,
          [currentRunningAgent]: { status: 'error', progress: prev[currentRunningAgent]?.progress || 0 }
        }));
        setAgentActivities(prev => ({
          ...prev,
          [currentRunningAgent]: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
      }
      
      // Clean up any remaining intervals
      Object.values(intervalRefs.current).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      intervalRefs.current = {};
      
      // Reset pipeline state
      setPipelineRunning(false);
      setCurrentRunningAgent(null);
      
      // Show error state for failed agent
      if (error instanceof Error && error.message.includes('timed out')) {
        const failedAgent = error.message.match(/Agent (\S+) timed out/)?.[1];
        if (failedAgent) {
          setAgentStates(prev => ({
            ...prev,
            [failedAgent]: { status: 'error', progress: prev[failedAgent]?.progress || 0 }
          }));
          setAgentActivities(prev => ({
            ...prev,
            [failedAgent]: `Error: Agent timed out during processing`
          }));
        }
      }
    }
  };

  const togglePipeline = () => {
    if (pipelineRunning) {
      // Stop pipeline
      Object.values(intervalRefs.current).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      intervalRefs.current = {};
      setPipelineRunning(false);
      setCurrentRunningAgent(null);
      
      // Reset any running agents to idle
      setAgentStates(prev => {
        const newStates = { ...prev };
        Object.keys(newStates).forEach(agentId => {
          if (newStates[agentId].status === 'running') {
            newStates[agentId] = { status: 'idle', progress: 0 };
          }
        });
        return newStates;
      });
    } else {
      // Start pipeline
      startPipelineExecution();
    }
  };

  const resetPipeline = () => {
    // Clean up all running intervals
    Object.values(intervalRefs.current).forEach(interval => {
      if (interval) clearInterval(interval);
    });
    intervalRefs.current = {};
    
    setPipelineRunning(false);
    setPipelineComplete(false);
    setAnalysisResult(null);
    setCurrentRunningAgent(null);
    
    const newStates: Record<string, { status: Agent['status']; progress: number }> = {};
    const newActivities: Record<string, string> = {};
    
    baseAgents.forEach(agent => {
      const isPlanner = agent.id === 'planner';
      newStates[agent.id] = { 
        status: isPlanner ? 'completed' : 'idle', 
        progress: isPlanner ? 100 : 0 
      };
      newActivities[agent.id] = getActivityForProgress(agent.id, isPlanner ? 100 : 0);
    });
    
    setAgentStates(newStates);
    setAgentActivities(newActivities);
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalRefs.current).forEach(interval => clearInterval(interval));
    };
  }, []);

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
                <Badge className={getSeverityColor(currentAlert?.severity || 'medium')}>
                  {currentAlert?.severity?.toUpperCase() || 'UNKNOWN'}
                </Badge>
                <span className="text-sm text-slate-300">
                  {currentAlertId || 'AL-2025-HK-001'} • {currentAlert?.source}
                </span>
                <span className="text-sm text-slate-400">
                  {currentAlert?.location}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
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
                disabled={pipelineComplete}
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
          <p className="text-slate-300 mb-4">{currentAlert?.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Affected Assets</h4>
              <div className="space-y-1">
                {currentAlert?.affectedAssets.map((asset, index) => (
                  <div key={index} className="text-sm text-slate-300 bg-slate-700/50 rounded px-2 py-1">
                    {asset}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Detection Time</h4>
              <div className="text-sm text-slate-400">
                {currentAlert ? new Date(currentAlert.timestamp).toLocaleString() : 'N/A'}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-sm text-slate-300 mb-2">Confidence Score</h4>
              <div className="flex items-center space-x-2">
                <Progress value={currentAlert?.confidence || 0} className="flex-1" />
                <span className="text-sm font-medium text-white">{currentAlert?.confidence || 0}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {agents.map((agent, index) => (
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
                    {agent.status === 'idle' && (
                      <p className="text-xs text-slate-500 italic">
                        Waiting to start...
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

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
                <h4 className="font-medium text-sm text-slate-300 mb-2">Generated Artifacts</h4>
                <ul className="space-y-1">
                  {(() => {
                    const agent = agents.find(a => a.id === activeAgent);
                    if (!agent) return null;
                    
                    // Generate personalized artifacts based on the current alert
                    const generatePersonalizedArtifacts = (agentId: string) => {
                      const alertId = alert?.id || 'AL-2025-HK-005';
                      const alertType = alert?.type || 'Privilege Escalation';
                      const severity = alert?.severity || 'High';
                      const timestamp = new Date().toISOString().split('T')[0];
                      
                      switch (agentId) {
                        case 'planner':
                          return [
                            `Analysis Plan ${alertId.replace('AL-', 'PLN-')} - ${alertType} Investigation`,
                            `Resource Allocation Matrix for ${severity} Priority Alert`,
                            `Timeline: ${alertType} Analysis Workflow (Est. 45min)`,
                            `Risk Assessment Prerequisites - IAM Policy Review`,
                            `Escalation Triggers: HKMA Notification Criteria`
                          ];
                        
                        case 'context':
                          return [
                            `Threat Intelligence Report: ${alertType} TTPs`,
                            `Asset Context Map - Affected IAM Resources`,
                            `Historical Analysis: Similar ${alertType} Incidents (Past 90 days)`,
                            `Vulnerability Database Cross-reference`,
                            `Network Topology Impact Assessment`
                          ];
                        
                        case 'analyst':
                          return [
                            `Threat Analysis Report ${alertId.replace('AL-', 'TAR-')}`,
                            `IOC Collection: ${alertType} Indicators (12 artifacts)`,
                            `Attack Chain Reconstruction: Policy Modification Sequence`,
                            `Attribution Assessment: APT29 Likelihood Score`,
                            `Technical Deep Dive: AWS IAM Attack Vectors`
                          ];
                        
                        case 'risk':
                          return [
                            `Risk Score Matrix: ${severity} (8.7/10) - ${alertType}`,
                            `Business Impact Assessment: Financial Services Sector`,
                            `Compliance Gap Analysis: HKMA Guidelines`,
                            `Mitigation Action Plan: 6 Immediate Responses`,
                            `Executive Summary: ${alertType} Risk Exposure`
                          ];
                        
                        case 'learning':
                          return [
                            `Pattern Recognition: ${alertType} Evolution Trends`,
                            `Detection Rule Updates: 3 New Signatures Added`,
                            `Knowledge Base Entry: ${alertType} Response Playbook`,
                            `Training Recommendations: IAM Security Best Practices`,
                            `Lessons Learned: ${alertId} Post-Incident Analysis`
                          ];
                        
                        case 'audit':
                          return [
                            `Compliance Report ${alertId.replace('AL-', 'CR-')} - HKMA Submission`,
                            `Audit Trail: ${alertType} Investigation Evidence`,
                            `Regulatory Filing: Hong Kong Critical Infrastructure Ordinance`,
                            `Timeline Documentation: ${timestamp} Incident Response`,
                            `Legal Hold Notice: ${alertType} Digital Evidence Preservation`
                          ];
                        
                        default:
                          return agent.artifacts;
                      }
                    };
                    
                    const personalizedArtifacts = generatePersonalizedArtifacts(activeAgent);
                    
                    return personalizedArtifacts.map((artifact, index) => (
                      <li key={index} className="text-sm text-slate-400 flex items-start space-x-2">
                        <span className="text-green-400 mt-1">→</span>
                        <span>{artifact}</span>
                      </li>
                    ));
                  })()}
                </ul>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Analysis Results */}
      {pipelineComplete && analysisResult && (
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
                Pipeline completed in {Object.values(agentDurations).reduce((a, b) => a + b, 0)}s • 
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
      {pipelineRunning && currentRunningAgent && (
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
                      {agents.find(a => a.id === currentRunningAgent)?.currentActivity}
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
      {(Object.keys(agentResults).length > 0 || pipelineComplete) && (
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
                    <p>Click the Planner Agent tab to view detailed planning results for this resolved alert</p>
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
                    <p>Click the Context Executor tab to view contextual analysis results for this resolved alert</p>
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
                    <p>Click the Analyst tab to view detailed threat analysis results for this resolved alert</p>
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
                    <p>Click the Risk tab to view detailed risk assessment results for this resolved alert</p>
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
                    <p>Click the Learning tab to view insights and recommendations from this resolved alert</p>
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
                    <p>Click the Audit tab to view compliance reporting results for this resolved alert</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

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