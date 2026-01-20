export type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed';

export type RuntimeConnectionMode = 'gateway' | 'direct';

export interface RuntimeEventParams {
  run_id?: string;
  agent_id?: string;
  thread_id?: string;
  turn_id?: string;
  item_id?: string;
  sequence?: number;
  ts?: string;
  schema_version?: string;
  [key: string]: unknown;
}

export interface RuntimeEvent<TParams = RuntimeEventParams> {
  method: string;
  params: TParams;
}

export interface RuntimeAlertIoc {
  type: 'ip' | 'domain' | 'hash' | 'url' | string;
  value: string;
  confidence?: number;
}

export interface RuntimeAlert {
  id: string;
  title: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | string;
  source?: string;
  timestamp?: string;
  status?: string;
  description?: string;
  iocs?: RuntimeAlertIoc[];
  affectedAssets?: string[];
  location?: string;
  tags?: string[];
  confidence?: number;
  runId?: string;
}

export interface ArtifactRef {
  sha256: string;
  size?: number;
  content_type?: string;
  redaction?: string;
  uri?: string;
}

export interface ArtifactEvent {
  artifact_ref: ArtifactRef;
  run_id?: string;
  agent_id?: string;
  item_id?: string;
  sequence?: number;
  ts?: string;
}

export interface ApprovalRequest {
  request_id: string;
  run_id?: string;
  agent_id?: string;
  title?: string;
  description?: string;
  risk?: string;
  payload?: unknown;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_at?: string;
  responded_at?: string;
  verified: boolean;
  verificationIssue?: string;
}

export interface RuntimeItem {
  item_id: string;
  run_id?: string;
  agent_id?: string;
  type?: string;
  status?: string;
  payload?: unknown;
  sequence?: number;
  ts?: string;
}

export interface AgentState {
  status: AgentStatus;
  progress: number;
  lastActivity?: string;
  lastUpdated?: string;
  lastError?: string;
}

export interface RunOutcome {
  status: 'resolved' | 'unresolved';
  summary: string;
  actions: string[];
  uncertainties?: string[];
  assistanceNeeded?: string[];
  confidence?: number;
  completedTimestamp?: string;
  analysisTime?: string;
}

export interface SequenceGap {
  from: number;
  to: number;
  detectedAt: string;
}

export interface SequenceReplay {
  sequence: number;
  detectedAt: string;
}

export interface RuntimeEventIssue {
  type: 'missing-field' | 'invalid-event' | 'schema-version' | 'duplicate' | 'gap' | 'replay';
  message: string;
  method?: string;
  run_id?: string;
  sequence?: number;
  detectedAt: string;
}

export interface RuntimeRunState {
  runId: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  lastSequence?: number;
  lastEventAt?: string;
  agents: Record<string, AgentState>;
  artifacts: ArtifactEvent[];
  approvals: ApprovalRequest[];
  items: RuntimeItem[];
  events: RuntimeEvent[];
  invalidEvents: RuntimeEventIssue[];
  sequenceGaps: SequenceGap[];
  sequenceReplays: SequenceReplay[];
  agentOutputs: Record<string, unknown[]>;
  metrics?: Record<string, number>;
  outcome?: RunOutcome;
  metadata?: {
    alertId?: string;
    alertTitle?: string;
    alertDescription?: string;
    severity?: string;
    source?: string;
    timestamp?: string;
    status?: string;
    location?: string;
    confidence?: number;
    affectedAssets?: string[];
    iocs?: RuntimeAlertIoc[];
    tags?: string[];
  };
}

export interface RuntimeConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError?: string;
  lastConnectedAt?: string;
  lastEventAt?: string;
  mode?: RuntimeConnectionMode;
}

export interface RuntimeState {
  connection: RuntimeConnectionState;
  activeRunId?: string;
  runs: Record<string, RuntimeRunState>;
  alerts: Record<string, RuntimeAlert>;
  debug: {
    quarantinedEvents: RuntimeEvent[];
  };
}
