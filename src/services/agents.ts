// NeoHarbor Security - Multi-Agent Pipeline API Interfaces
// This file contains API interfaces for all 6 agents that will be connected to Amazon Bedrock

import { runtimeService } from './runtime';

export interface AgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  agentId: string;
  executionTime: number;
}

export interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  timestamp: string;
  iocs?: string[];
  rawData?: any;
}

export interface AnalysisPlan {
  planId: string;
  steps: AnalysisStep[];
  priority: number;
  estimatedDuration: number;
  requiredResources: string[];
}

export interface AnalysisStep {
  stepId: string;
  description: string;
  action: string;
  parameters: Record<string, any>;
  dependencies?: string[];
}

export interface ContextData {
  threatIntelligence: any[];
  historicalPatterns: any[];
  assetInformation: any[];
  networkTopology: any;
  securityPolicies: any[];
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  impactAnalysis: {
    financial: number;
    operational: number;
    reputational: number;
    compliance: number;
  };
  mitigationRecommendations: string[];
  requiredActions: string[];
}

export interface ThreatAnalysis {
  analysisId: string;
  threatType: string;
  attackVector: string;
  indicators: string[];
  confidence: number;
  timeline: any[];
  attribution: string;
  relatedIncidents: string[];
}

export interface LearningInsights {
  patternId: string;
  insights: string[];
  recommendations: string[];
  modelUpdates: any[];
  performanceMetrics: Record<string, number>;
}

export interface ComplianceReport {
  reportId: string;
  incidentId: string;
  reportType: 'OGCIO' | 'HKMA' | 'Internal';
  status: 'draft' | 'ready' | 'submitted';
  deadline: string;
  content: {
    executive_summary: string;
    incident_details: any;
    impact_assessment: any;
    response_actions: any;
    lessons_learned: any;
  };
  attachments: string[];
}

interface AgentCallOptions {
  runId?: string;
  idempotencyKey?: string;
}

const buildAgentResponse = <T>(
  agentId: string,
  startTime: number,
  data?: T,
  error?: string,
): AgentResponse<T> => ({
  success: !error,
  data,
  error,
  timestamp: new Date().toISOString(),
  agentId,
  executionTime: Date.now() - startTime,
});

const callRuntimeAgent = async <T>(
  agentRole: string,
  agentId: string,
  input: Record<string, unknown>,
  options?: AgentCallOptions,
): Promise<AgentResponse<T>> => {
  const startTime = Date.now();

  try {
    const result = await runtimeService.executeAgent(agentRole, input, {
      runId: options?.runId,
      idempotency_key: options?.idempotencyKey,
    });

    return buildAgentResponse(agentId, startTime, result as T);
  } catch (error) {
    return buildAgentResponse(
      agentId,
      startTime,
      undefined,
      error instanceof Error ? error.message : 'Runtime request failed',
    );
  }
};

// =============================================================================
// AGENT 1: PLANNER AGENT
// =============================================================================
/**
 * Planner Agent - Creates comprehensive analysis plans for security incidents
 * This agent will be connected to Amazon Bedrock for intelligent planning
 */
export class PlannerAgent {
  private static readonly AGENT_ID = 'planner-agent';

  /**
   * Generate an analysis plan for a security alert
   * @param alert - The security alert to analyze
   * @param context - Additional context for planning
   * @returns Analysis plan with prioritized steps
   */
  static async generateAnalysisPlan(
    alert: SecurityAlert,
    context?: Record<string, any>,
    options?: AgentCallOptions
  ): Promise<AgentResponse<AnalysisPlan>> {
    return callRuntimeAgent<AnalysisPlan>(
      'planner',
      this.AGENT_ID,
      { alert, context },
      options,
    );
  }

  /**
   * Update an existing analysis plan based on new information
   */
  static async updateAnalysisPlan(
    planId: string,
    updates: Partial<AnalysisPlan>,
    options?: AgentCallOptions
  ): Promise<AgentResponse<AnalysisPlan>> {
    return callRuntimeAgent<AnalysisPlan>(
      'planner',
      this.AGENT_ID,
      { planId, updates, action: 'update_plan' },
      options,
    );
  }
}

// =============================================================================
// AGENT 2: CONTEXT EXECUTOR AGENT
// =============================================================================
/**
 * Context Executor Agent - Gathers and enriches context for security analysis
 * Integrates with threat intelligence feeds, asset databases, and historical data
 */
export class ContextExecutorAgent {
  private static readonly AGENT_ID = 'context-executor-agent';

  /**
   * Execute context collection based on analysis plan step
   * @param step - The analysis step to execute
   * @param alert - The original security alert
   * @returns Enriched context data
   */
  static async executeContextCollection(
    step: AnalysisStep,
    alert: SecurityAlert,
    options?: AgentCallOptions
  ): Promise<AgentResponse<ContextData>> {
    return callRuntimeAgent<ContextData>(
      'context-executor',
      this.AGENT_ID,
      { step, alert },
      options,
    );
  }

  /**
   * Enrich alert with additional context from multiple sources
   */
  static async enrichAlert(
    alert: SecurityAlert,
    sources: string[],
    options?: AgentCallOptions
  ): Promise<AgentResponse<SecurityAlert>> {
    return callRuntimeAgent<SecurityAlert>(
      'context-executor',
      this.AGENT_ID,
      { alert, sources, action: 'enrich_alert' },
      options,
    );
  }
}

// =============================================================================
// AGENT 3: ANALYST AGENT
// =============================================================================
/**
 * Analyst Agent - Performs deep threat analysis and attribution
 * Uses ML models and threat intelligence for comprehensive analysis
 */
export class AnalystAgent {
  private static readonly AGENT_ID = 'analyst-agent';

  /**
   * Perform comprehensive threat analysis
   * @param alert - Security alert to analyze
   * @param context - Contextual data from previous steps
   * @returns Detailed threat analysis
   */
  static async performThreatAnalysis(
    alert: SecurityAlert,
    context: ContextData,
    options?: AgentCallOptions
  ): Promise<AgentResponse<ThreatAnalysis>> {
    return callRuntimeAgent<ThreatAnalysis>(
      'analyst',
      this.AGENT_ID,
      { alert, context },
      options,
    );
  }

  /**
   * Generate IOCs (Indicators of Compromise) from analysis
   */
  static async generateIOCs(
    analysis: ThreatAnalysis,
    options?: AgentCallOptions
  ): Promise<AgentResponse<string[]>> {
    return callRuntimeAgent<string[]>(
      'analyst',
      this.AGENT_ID,
      { analysis, action: 'generate_iocs' },
      options,
    );
  }
}

// =============================================================================
// AGENT 4: RISK ORCHESTRATOR AGENT
// =============================================================================
/**
 * Risk Orchestrator Agent - Assesses risk and orchestrates response actions
 * Integrates with HKMA compliance requirements and business impact analysis
 */
export class RiskOrchestratorAgent {
  private static readonly AGENT_ID = 'risk-orchestrator-agent';

  /**
   * Perform comprehensive risk assessment
   * @param alert - Security alert
   * @param analysis - Threat analysis results
   * @param context - Contextual information
   * @returns Risk assessment and recommendations
   */
  static async performRiskAssessment(
    alert: SecurityAlert,
    analysis: ThreatAnalysis,
    context: ContextData,
    options?: AgentCallOptions
  ): Promise<AgentResponse<RiskAssessment>> {
    return callRuntimeAgent<RiskAssessment>(
      'risk-orchestrator',
      this.AGENT_ID,
      { alert, analysis, context },
      options,
    );
  }

  /**
   * Generate automated response recommendations
   */
  static async generateResponsePlan(
    riskAssessment: RiskAssessment,
    alert: SecurityAlert,
    options?: AgentCallOptions
  ): Promise<AgentResponse<any>> {
    return callRuntimeAgent(
      'risk-orchestrator',
      this.AGENT_ID,
      { riskAssessment, alert, action: 'generate_response_plan' },
      options,
    );
  }
}

// =============================================================================
// AGENT 5: LEARNING CURATOR AGENT
// =============================================================================
/**
 * Learning Curator Agent - Extracts insights and improves detection models
 * Continuously learns from incidents to enhance future response capabilities
 */
export class LearningCuratorAgent {
  private static readonly AGENT_ID = 'learning-curator-agent';

  /**
   * Extract learning insights from completed incident analysis
   * @param alert - Original security alert
   * @param analysis - Threat analysis results
   * @param outcome - Final incident outcome
   * @returns Learning insights and model updates
   */
  static async extractLearningInsights(
    alert: SecurityAlert,
    analysis: ThreatAnalysis,
    outcome: any,
    options?: AgentCallOptions
  ): Promise<AgentResponse<LearningInsights>> {
    return callRuntimeAgent<LearningInsights>(
      'learning-curator',
      this.AGENT_ID,
      { alert, analysis, outcome },
      options,
    );
  }

  /**
   * Update detection models based on learning insights
   */
  static async updateDetectionModels(
    insights: LearningInsights,
    options?: AgentCallOptions
  ): Promise<AgentResponse<any>> {
    return callRuntimeAgent(
      'learning-curator',
      this.AGENT_ID,
      { insights, action: 'update_models' },
      options,
    );
  }
}

// =============================================================================
// AGENT 6: AUDIT REPORTER AGENT
// =============================================================================
/**
 * Audit Reporter Agent - Generates compliance reports for regulatory bodies
 * Specialized in HKMA and OGCIO reporting requirements for Hong Kong financial sector
 */
export class AuditReporterAgent {
  private static readonly AGENT_ID = 'audit-reporter-agent';

  /**
   * Generate regulatory compliance report
   * @param alert - Security alert
   * @param analysis - Complete analysis results
   * @param riskAssessment - Risk assessment results
   * @param reportType - Type of regulatory report needed
   * @returns Compliance report ready for submission
   */
  static async generateComplianceReport(
    alert: SecurityAlert,
    analysis: ThreatAnalysis,
    riskAssessment: RiskAssessment,
    reportType: 'OGCIO' | 'HKMA' | 'Internal',
    options?: AgentCallOptions
  ): Promise<AgentResponse<ComplianceReport>> {
    return callRuntimeAgent<ComplianceReport>(
      'audit-reporter',
      this.AGENT_ID,
      { alert, analysis, riskAssessment, reportType },
      options,
    );
  }

  /**
   * Submit compliance report to regulatory body
   */
  static async submitReport(
    report: ComplianceReport,
    options?: AgentCallOptions
  ): Promise<AgentResponse<any>> {
    return callRuntimeAgent(
      'audit-reporter',
      this.AGENT_ID,
      { report, action: 'submit_report' },
      options,
    );
  }

  /**
   * Generate audit trail report for regulatory review
   */
  static async generateAuditTrail(
    incidentId: string,
    startDate: string,
    endDate: string,
    options?: AgentCallOptions
  ): Promise<AgentResponse<any>> {
    return callRuntimeAgent(
      'audit-reporter',
      this.AGENT_ID,
      { incidentId, startDate, endDate, action: 'generate_audit_trail' },
      options,
    );
  }
}

// =============================================================================
// ORCHESTRATION SERVICE
// =============================================================================
/**
 * Main orchestration service that coordinates all agents
 * This will be the primary interface used by the UI components
 */
export class AgentOrchestrator {
  /**
   * Execute the complete multi-agent pipeline for an incident
   * @param alert - Security alert to process
   * @returns Complete analysis results from all agents
   */
  static async executeFullPipeline(
    alert: SecurityAlert,
    options?: { runId?: string; maxRetries?: number },
  ): Promise<{
    plan: AgentResponse<AnalysisPlan>;
    context: AgentResponse<ContextData>;
    analysis: AgentResponse<ThreatAnalysis>;
    riskAssessment: AgentResponse<RiskAssessment>;
    learningInsights: AgentResponse<LearningInsights>;
    complianceReport: AgentResponse<ComplianceReport>;
  }> {
    const maxRetries = options?.maxRetries ?? 2;
    const startRunResult = options?.runId
      ? { run_id: options.runId }
      : await runtimeService.startRun(alert);
    const runId = startRunResult.run_id;

    const fallbackContext: ContextData = {
      threatIntelligence: [],
      historicalPatterns: [],
      assetInformation: [],
      networkTopology: {},
      securityPolicies: [],
    };

    const dependencyError = <T>(message: string): AgentResponse<T> =>
      buildAgentResponse('orchestrator', Date.now(), undefined, message);

    const executeWithRetry = async <T>(
      taskId: string,
      executor: (idempotencyKey: string) => Promise<AgentResponse<T>>,
    ): Promise<AgentResponse<T>> => {
      const idempotencyKey = `${runId}:${taskId}:${alert.id}`;
      let attempt = 0;
      let response: AgentResponse<T> | undefined;

      while (attempt <= maxRetries) {
        response = await executor(idempotencyKey);
        if (response.success) return response;

        attempt += 1;
        if (attempt > maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }

      return response ?? dependencyError<T>('Agent execution failed.');
    };

    type TaskId =
      | 'planner'
      | 'context-executor'
      | 'analyst'
      | 'risk-orchestrator'
      | 'learning-curator'
      | 'audit-reporter';

    type Task = {
      id: TaskId;
      dependsOn: TaskId[];
      run: (idempotencyKey: string) => Promise<AgentResponse<any>>;
    };

    const results = new Map<TaskId, AgentResponse<any>>();

    const tasks: Task[] = [
      {
        id: 'planner',
        dependsOn: [],
        run: (idempotencyKey) =>
          PlannerAgent.generateAnalysisPlan(alert, undefined, {
            runId,
            idempotencyKey,
          }),
      },
      {
        id: 'context-executor',
        dependsOn: ['planner'],
        run: (idempotencyKey) => {
          const plan = results.get('planner')?.data as AnalysisPlan | undefined;
          const contextStep = plan?.steps?.find((step) => step.action === 'context_collection') ?? {
            stepId: 'context-default',
            description: 'Default context collection',
            action: 'context_collection',
            parameters: {
              alert_id: alert.id,
              severity: alert.severity,
              sources: ['threat_intel', 'historical_data'],
            },
          };
          return ContextExecutorAgent.executeContextCollection(contextStep, alert, {
            runId,
            idempotencyKey,
          });
        },
      },
      {
        id: 'analyst',
        dependsOn: ['planner'],
        run: (idempotencyKey) => {
          const context = (results.get('context-executor')?.data as ContextData | undefined) ?? fallbackContext;
          return AnalystAgent.performThreatAnalysis(alert, context, {
            runId,
            idempotencyKey,
          });
        },
      },
      {
        id: 'risk-orchestrator',
        dependsOn: ['analyst'],
        run: (idempotencyKey) => {
          const analysis = results.get('analyst')?.data as ThreatAnalysis | undefined;
          if (!analysis) {
            return dependencyError<RiskAssessment>('Analysis required for risk assessment.');
          }
          const context = (results.get('context-executor')?.data as ContextData | undefined) ?? fallbackContext;
          return RiskOrchestratorAgent.performRiskAssessment(alert, analysis, context, {
            runId,
            idempotencyKey,
          });
        },
      },
      {
        id: 'learning-curator',
        dependsOn: ['analyst'],
        run: (idempotencyKey) => {
          const analysis = results.get('analyst')?.data as ThreatAnalysis | undefined;
          if (!analysis) {
            return dependencyError<LearningInsights>('Analysis required for learning insights.');
          }
          return LearningCuratorAgent.extractLearningInsights(
            alert,
            analysis,
            { status: 'completed' },
            { runId, idempotencyKey },
          );
        },
      },
      {
        id: 'audit-reporter',
        dependsOn: ['risk-orchestrator'],
        run: (idempotencyKey) => {
          const analysis = results.get('analyst')?.data as ThreatAnalysis | undefined;
          const risk = results.get('risk-orchestrator')?.data as RiskAssessment | undefined;
          if (!analysis || !risk) {
            return dependencyError<ComplianceReport>('Risk assessment required for compliance report.');
          }
          return AuditReporterAgent.generateComplianceReport(alert, analysis, risk, 'OGCIO', {
            runId,
            idempotencyKey,
          });
        },
      },
    ];

    const pending = new Map(tasks.map((task) => [task.id, task]));
    const completed = new Set<TaskId>();
    const failed = new Set<TaskId>();

    while (pending.size > 0) {
      const ready: Task[] = [];
      const blocked: Task[] = [];

      for (const task of pending.values()) {
        if (task.dependsOn.some((dep) => failed.has(dep))) {
          blocked.push(task);
        } else if (task.dependsOn.every((dep) => completed.has(dep))) {
          ready.push(task);
        }
      }

      blocked.forEach((task) => {
        results.set(task.id, dependencyError(`Dependency failed for ${task.id}.`));
        completed.add(task.id);
        failed.add(task.id);
        pending.delete(task.id);
      });

      if (ready.length === 0) {
        if (pending.size > 0) {
          throw new Error('Dependency resolution failed for the agent graph.');
        }
        break;
      }

      const executed = await Promise.all(
        ready.map(async (task) => ({
          task,
          response: await executeWithRetry(task.id, task.run),
        })),
      );

      executed.forEach(({ task, response }) => {
        results.set(task.id, response);
        completed.add(task.id);
        if (!response.success) failed.add(task.id);
        pending.delete(task.id);
      });
    }

    return {
      plan: (results.get('planner') as AgentResponse<AnalysisPlan>) ?? dependencyError('Planner did not run.'),
      context: (results.get('context-executor') as AgentResponse<ContextData>) ?? dependencyError('Context executor did not run.'),
      analysis: (results.get('analyst') as AgentResponse<ThreatAnalysis>) ?? dependencyError('Analyst did not run.'),
      riskAssessment: (results.get('risk-orchestrator') as AgentResponse<RiskAssessment>) ?? dependencyError('Risk orchestrator did not run.'),
      learningInsights: (results.get('learning-curator') as AgentResponse<LearningInsights>) ?? dependencyError('Learning curator did not run.'),
      complianceReport: (results.get('audit-reporter') as AgentResponse<ComplianceReport>) ?? dependencyError('Audit reporter did not run.'),
    };
  }
}

// All agents and types are exported via their class declarations above
// No additional export statements needed
