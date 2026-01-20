import { useSyncExternalStore } from 'react';
import type {
  AgentState,
  ApprovalRequest,
  ArtifactEvent,
  RuntimeAlert,
  RuntimeAlertIoc,
  RuntimeEvent,
  RuntimeEventIssue,
  RuntimeItem,
  RuntimeRunState,
  RuntimeState,
  RunOutcome,
  SequenceGap,
  SequenceReplay,
} from './types';

const DEFAULT_AGENT_IDS = [
  'planner',
  'context-executor',
  'analyst',
  'risk-orchestrator',
  'learning-curator',
  'audit-reporter',
];

const MAX_EVENTS = 200;
const MAX_ISSUES = 200;
const MAX_QUARANTINED_EVENTS = 50;
const REQUIRED_FIELDS: Array<keyof RuntimeEvent['params']> = [
  'run_id',
  'agent_id',
  'thread_id',
  'turn_id',
  'item_id',
  'sequence',
  'ts',
  'schema_version',
];

const seenSequencesByRun = new Map<string, Set<number>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const appendLimited = <T,>(items: T[], item: T, limit: number): T[] => {
  const next = [...items, item];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
};

const createAgentState = (): AgentState => ({
  status: 'idle',
  progress: 0,
});

const createRunState = (runId: string): RuntimeRunState => ({
  runId,
  status: 'idle',
  agents: DEFAULT_AGENT_IDS.reduce<Record<string, AgentState>>((acc, agentId) => {
    acc[agentId] = createAgentState();
    return acc;
  }, {}),
  artifacts: [],
  approvals: [],
  items: [],
  events: [],
  invalidEvents: [],
  sequenceGaps: [],
  sequenceReplays: [],
  agentOutputs: {},
});

const initialState: RuntimeState = {
  connection: {
    status: 'disconnected',
  },
  runs: {},
  alerts: {},
  debug: {
    quarantinedEvents: [],
  },
};

let state: RuntimeState = initialState;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const setState = (updater: (prev: RuntimeState) => RuntimeState) => {
  state = updater(state);
  notify();
};

const appendEvent = (events: RuntimeEvent[], event: RuntimeEvent) => {
  return appendLimited(events, event, MAX_EVENTS);
};

const hashString = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const stableStringify = (value: unknown): string => {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
};

const createDeterministicRequestId = (params: Record<string, unknown>, fallbackId: string): string => {
  try {
    const seed = stableStringify({
      run_id: params.run_id,
      agent_id: params.agent_id,
      ts: params.ts,
      title: params.title,
      description: params.description,
      payload: params.payload ?? params.details,
    });
    return `req_${hashString(seed)}`;
  } catch {
    return fallbackId;
  }
};

const normalizeApproval = (params: Record<string, unknown>, fallbackId: string): ApprovalRequest => {
  const providedId = typeof params.request_id === 'string' && params.request_id.trim()
    ? params.request_id
    : undefined;
  const requestId = providedId ?? createDeterministicRequestId(params, fallbackId);
  const verified = Boolean(providedId);

  return {
    request_id: requestId,
    run_id: params.run_id as string | undefined,
    agent_id: params.agent_id as string | undefined,
    title: params.title as string | undefined,
    description: params.description as string | undefined,
    risk: params.risk as string | undefined,
    payload: params.payload ?? params.details,
    status: 'pending',
    requested_at: params.ts as string | undefined,
    verified,
    verificationIssue: verified ? undefined : 'Missing request_id from runtime.',
  };
};

const normalizeArtifact = (params: Record<string, unknown>): ArtifactEvent | null => {
  const artifactRef = params.artifact_ref as ArtifactEvent['artifact_ref'] | undefined;
  if (!artifactRef || !artifactRef.sha256) return null;

  return {
    artifact_ref: artifactRef,
    run_id: params.run_id as string | undefined,
    agent_id: params.agent_id as string | undefined,
    item_id: params.item_id as string | undefined,
    sequence: params.sequence as number | undefined,
    ts: params.ts as string | undefined,
  };
};

const normalizeAlertIoc = (value: unknown): RuntimeAlertIoc | null => {
  if (typeof value === 'string') {
    return { type: 'ioc', value };
  }
  if (!isRecord(value)) return null;
  const iocValue = typeof value.value === 'string' ? value.value : undefined;
  if (!iocValue) return null;
  return {
    type: typeof value.type === 'string' ? value.type : 'ioc',
    value: iocValue,
    confidence: typeof value.confidence === 'number' ? value.confidence : undefined,
  };
};

const normalizeAlert = (input: Record<string, unknown>): RuntimeAlert | null => {
  const raw = isRecord(input.alert) ? (input.alert as Record<string, unknown>) : input;
  const id = typeof raw.id === 'string' ? raw.id : undefined;
  if (!id) return null;

  const iocsRaw = Array.isArray(raw.iocs) ? raw.iocs : [];
  const iocs = iocsRaw.map(normalizeAlertIoc).filter(Boolean) as RuntimeAlertIoc[];
  const affectedAssets = Array.isArray(raw.affectedAssets) ? raw.affectedAssets.filter((item) => typeof item === 'string') : [];
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((item) => typeof item === 'string') : [];

  const runId = typeof raw.run_id === 'string'
    ? raw.run_id
    : (typeof input.run_id === 'string' ? input.run_id : undefined);

  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : id,
    severity: typeof raw.severity === 'string' ? raw.severity : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    iocs,
    affectedAssets,
    location: typeof raw.location === 'string' ? raw.location : undefined,
    tags,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
    runId,
  };
};

const extractOutcome = (params: Record<string, unknown>): RunOutcome | undefined => {
  const outcome = (params.outcome ?? params.result ?? params.summary) as Record<string, unknown> | undefined;
  if (!outcome || typeof outcome !== 'object') return undefined;

  const status = outcome.status;
  if (status !== 'resolved' && status !== 'unresolved') return undefined;

  const actions = Array.isArray(outcome.actions) ? outcome.actions : [];

  return {
    status,
    summary: typeof outcome.summary === 'string' ? outcome.summary : '',
    actions: actions.filter((action) => typeof action === 'string'),
    uncertainties: Array.isArray(outcome.uncertainties)
      ? outcome.uncertainties.filter((item) => typeof item === 'string')
      : undefined,
    assistanceNeeded: Array.isArray(outcome.assistanceNeeded)
      ? outcome.assistanceNeeded.filter((item) => typeof item === 'string')
      : undefined,
    confidence: typeof outcome.confidence === 'number' ? outcome.confidence : undefined,
    completedTimestamp: typeof outcome.completedTimestamp === 'string' ? outcome.completedTimestamp : undefined,
    analysisTime: typeof outcome.analysisTime === 'string' ? outcome.analysisTime : undefined,
  };
};

const getActivityFromEvent = (method: string, params: Record<string, unknown>): string | undefined => {
  return (
    (params.message as string | undefined) ||
    (params.summary as string | undefined) ||
    (params.action as string | undefined) ||
    (params.tool_name as string | undefined) ||
    method
  );
};

const updateAgentProgress = (agent: AgentState, method: string): AgentState => {
  if (method.startsWith('turn/') && method.endsWith('/started')) {
    return {
      ...agent,
      status: 'running',
      progress: Math.max(agent.progress, 5),
    };
  }

  if (method.startsWith('turn/') && method.endsWith('/completed')) {
    return {
      ...agent,
      status: 'completed',
      progress: 100,
    };
  }

  if (method.startsWith('turn/') && method.endsWith('/failed')) {
    return {
      ...agent,
      status: 'error',
    };
  }

  if ((method.startsWith('item/') || method.startsWith('tool/')) && agent.status !== 'completed') {
    return {
      ...agent,
      status: agent.status === 'idle' ? 'running' : agent.status,
      progress: Math.min(95, Math.max(agent.progress, agent.progress + 10)),
    };
  }

  return agent;
};

const appendIssue = (issues: RuntimeEventIssue[], issue: RuntimeEventIssue) => {
  return appendLimited(issues, issue, MAX_ISSUES);
};

const appendGap = (gaps: SequenceGap[], gap: SequenceGap) => {
  return appendLimited(gaps, gap, MAX_ISSUES);
};

const appendReplay = (replays: SequenceReplay[], replay: SequenceReplay) => {
  return appendLimited(replays, replay, MAX_ISSUES);
};

const ensureSequenceSet = (runId: string) => {
  const existing = seenSequencesByRun.get(runId);
  if (existing) return existing;
  const next = new Set<number>();
  seenSequencesByRun.set(runId, next);
  return next;
};

const createIssue = (
  type: RuntimeEventIssue['type'],
  message: string,
  details?: { method?: string; run_id?: string; sequence?: number },
): RuntimeEventIssue => ({
  type,
  message,
  method: details?.method,
  run_id: details?.run_id,
  sequence: details?.sequence,
  detectedAt: new Date().toISOString(),
});

const mergeAlert = (existing: RuntimeAlert | undefined, incoming: RuntimeAlert): RuntimeAlert => {
  return {
    ...existing,
    ...incoming,
    iocs: incoming.iocs && incoming.iocs.length > 0 ? incoming.iocs : existing?.iocs,
    affectedAssets: incoming.affectedAssets && incoming.affectedAssets.length > 0
      ? incoming.affectedAssets
      : existing?.affectedAssets,
    tags: incoming.tags && incoming.tags.length > 0 ? incoming.tags : existing?.tags,
  };
};

export const runtimeStore = {
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  updateConnection: (partial: Partial<RuntimeState['connection']>) => {
    setState((prev) => ({
      ...prev,
      connection: {
        ...prev.connection,
        ...partial,
      },
    }));
  },
  setActiveRun: (runId?: string) => {
    setState((prev) => ({
      ...prev,
      activeRunId: runId,
    }));
  },
  clearRun: (runId: string) => {
    setState((prev) => {
      const nextRuns = { ...prev.runs };
      delete nextRuns[runId];
      seenSequencesByRun.delete(runId);
      return {
        ...prev,
        runs: nextRuns,
        activeRunId: prev.activeRunId === runId ? undefined : prev.activeRunId,
      };
    });
  },
  hydrateRunMetadata: (runId: string, metadata: RuntimeRunState['metadata']) => {
    setState((prev) => {
      const run = prev.runs[runId] ?? createRunState(runId);
      return {
        ...prev,
        runs: {
          ...prev.runs,
          [runId]: {
            ...run,
            metadata: {
              ...run.metadata,
              ...metadata,
            },
          },
        },
      };
    });
  },
  upsertAlert: (alert: RuntimeAlert) => {
    setState((prev) => ({
      ...prev,
      alerts: {
        ...prev.alerts,
        [alert.id]: mergeAlert(prev.alerts[alert.id], alert),
      },
    }));
  },
  handleEvent: (event: RuntimeEvent) => {
    const now = new Date().toISOString();
    if (!event || typeof event.method !== 'string') {
      setState((prev) => ({
        ...prev,
        connection: {
          ...prev.connection,
          lastEventAt: now,
        },
        debug: {
          quarantinedEvents: appendLimited(prev.debug.quarantinedEvents, event, MAX_QUARANTINED_EVENTS),
        },
      }));
      return;
    }

    const params = isRecord(event.params) ? event.params : {};
    const runId = typeof params.run_id === 'string' && params.run_id.trim()
      ? params.run_id
      : undefined;

    if (!runId) {
      setState((prev) => ({
        ...prev,
        connection: {
          ...prev.connection,
          lastEventAt: now,
        },
        debug: {
          quarantinedEvents: appendLimited(prev.debug.quarantinedEvents, event, MAX_QUARANTINED_EVENTS),
        },
      }));
      return;
    }

    const missingFields = REQUIRED_FIELDS.filter((field) => {
      const value = params[field];
      return value == null || (typeof value === 'string' && value.trim() === '');
    });

    const issues: RuntimeEventIssue[] = [];
    if (missingFields.length > 0) {
      issues.push(createIssue(
        'missing-field',
        `Missing required fields: ${missingFields.join(', ')}`,
        { method: event.method, run_id: runId },
      ));
    }
    if (params.schema_version == null) {
      issues.push(createIssue(
        'schema-version',
        'Missing schema_version on runtime event.',
        { method: event.method, run_id: runId },
      ));
    } else if (typeof params.schema_version !== 'string') {
      issues.push(createIssue(
        'schema-version',
        'Invalid schema_version type on runtime event.',
        { method: event.method, run_id: runId },
      ));
    }
    if (params.sequence != null && typeof params.sequence !== 'number') {
      issues.push(createIssue(
        'invalid-event',
        'Event sequence is not a number.',
        { method: event.method, run_id: runId },
      ));
    }

    const alertUpdate = normalizeAlert(params);
    const sequence = typeof params.sequence === 'number' ? params.sequence : undefined;

    setState((prev) => {
      const existingRun = prev.runs[runId] ?? createRunState(runId);
      let nextRun: RuntimeRunState = {
        ...existingRun,
      };

      if (issues.length > 0) {
        nextRun.invalidEvents = issues.reduce((acc, issue) => appendIssue(acc, issue), nextRun.invalidEvents);
      }

      let shouldApply = true;
      if (sequence != null) {
        const seen = ensureSequenceSet(runId);
        const previousSequence = nextRun.lastSequence ?? -1;

        if (seen.has(sequence)) {
          nextRun.invalidEvents = appendIssue(
            nextRun.invalidEvents,
            createIssue('duplicate', 'Duplicate runtime event sequence.', {
              method: event.method,
              run_id: runId,
              sequence,
            }),
          );
          nextRun.sequenceReplays = appendReplay(nextRun.sequenceReplays, {
            sequence,
            detectedAt: now,
          });
          shouldApply = false;
        } else if (sequence <= previousSequence) {
          nextRun.invalidEvents = appendIssue(
            nextRun.invalidEvents,
            createIssue('replay', 'Out-of-order runtime event sequence.', {
              method: event.method,
              run_id: runId,
              sequence,
            }),
          );
          nextRun.sequenceReplays = appendReplay(nextRun.sequenceReplays, {
            sequence,
            detectedAt: now,
          });
          shouldApply = false;
        } else {
          if (previousSequence >= 0 && sequence > previousSequence + 1) {
            nextRun.invalidEvents = appendIssue(
              nextRun.invalidEvents,
              createIssue('gap', 'Sequence gap detected.', {
                method: event.method,
                run_id: runId,
                sequence,
              }),
            );
            nextRun.sequenceGaps = appendGap(nextRun.sequenceGaps, {
              from: previousSequence + 1,
              to: sequence - 1,
              detectedAt: now,
            });
          }
          seen.add(sequence);
          nextRun.lastSequence = sequence;
        }
      }

      nextRun.lastEventAt = (params.ts as string | undefined) ?? now;

      if (shouldApply) {
        nextRun.events = appendEvent(existingRun.events, event);
        const agentId = params.agent_id as string | undefined;
        if (agentId) {
          const currentAgent = nextRun.agents[agentId] ?? createAgentState();
          const activity = getActivityFromEvent(event.method, params);
          const updatedAgent = updateAgentProgress(currentAgent, event.method);
          nextRun.agents = {
            ...nextRun.agents,
            [agentId]: {
              ...updatedAgent,
              lastActivity: activity ?? currentAgent.lastActivity,
              lastUpdated: (params.ts as string | undefined) ?? new Date().toISOString(),
              lastError: event.method.endsWith('/failed')
                ? (params.error as string | undefined) ?? currentAgent.lastError
                : currentAgent.lastError,
            },
          };
        }

        if (event.method.startsWith('run/')) {
          if (event.method === 'run/started') {
            nextRun.status = 'running';
            nextRun.startedAt = (params.ts as string | undefined) ?? nextRun.startedAt;
          }
          if (event.method === 'run/completed') {
            nextRun.status = 'completed';
            nextRun.completedAt = (params.ts as string | undefined) ?? nextRun.completedAt;
          }
          if (event.method === 'run/failed') {
            nextRun.status = 'failed';
          }
          const outcome = extractOutcome(params);
          if (outcome) nextRun.outcome = outcome;
          if (event.method === 'run/metrics' && isRecord(params.metrics)) {
            const numericMetrics = Object.entries(params.metrics).reduce<Record<string, number>>((acc, [key, value]) => {
              if (typeof value === 'number') acc[key] = value;
              return acc;
            }, {});
            nextRun.metrics = { ...nextRun.metrics, ...numericMetrics };
          }
        }

        if (event.method.startsWith('item/')) {
          const itemId = params.item_id as string | undefined;
          if (itemId) {
            const existingIndex = nextRun.items.findIndex((item) => item.item_id === itemId);
            const payload = params.payload ?? params.item ?? params.output ?? params.result;
            const updatedItem: RuntimeItem = {
              ...(existingIndex >= 0 ? nextRun.items[existingIndex] : { item_id: itemId }),
              run_id: params.run_id as string | undefined,
              agent_id: params.agent_id as string | undefined,
              type: (params.type as string | undefined) ?? (params.item_type as string | undefined),
              status: params.status as string | undefined,
              payload,
              sequence: params.sequence as number | undefined,
              ts: params.ts as string | undefined,
            };

            const nextItems = [...nextRun.items];
            if (existingIndex >= 0) {
              nextItems[existingIndex] = updatedItem;
            } else {
              nextItems.push(updatedItem);
            }
            nextRun.items = nextItems;
          }

          if (agentId && (params.output || params.result)) {
            const output = params.output ?? params.result;
            const outputs = nextRun.agentOutputs[agentId] ?? [];
            nextRun.agentOutputs = {
              ...nextRun.agentOutputs,
              [agentId]: [...outputs, output],
            };
          }
        }

        if (event.method === 'artifact/created') {
          const artifact = normalizeArtifact(params);
          if (artifact) {
            nextRun.artifacts = [...nextRun.artifacts, artifact];
          }
        }

        if (event.method.startsWith('approval/')) {
          if (event.method === 'approval/requested') {
            const approval = normalizeApproval(params, `${runId}-${Date.now()}`);
            nextRun.approvals = [...nextRun.approvals, approval];
          } else {
            const approvalId = String(params.request_id ?? params.approval_id ?? '');
            if (approvalId) {
              nextRun.approvals = nextRun.approvals.map((approval) =>
                approval.request_id === approvalId
                  ? {
                      ...approval,
                      status: event.method === 'approval/approved' ? 'approved' :
                        event.method === 'approval/rejected' ? 'rejected' :
                        event.method === 'approval/expired' ? 'expired' : approval.status,
                      responded_at: (params.ts as string | undefined) ?? approval.responded_at,
                    }
                  : approval,
              );
            }
          }
        }
      }

      if (alertUpdate) {
        nextRun.metadata = {
          ...nextRun.metadata,
          alertId: alertUpdate.id,
          alertTitle: alertUpdate.title,
          alertDescription: alertUpdate.description,
          severity: alertUpdate.severity as string | undefined,
          source: alertUpdate.source,
          timestamp: alertUpdate.timestamp,
          status: alertUpdate.status,
          location: alertUpdate.location,
          confidence: alertUpdate.confidence,
          affectedAssets: alertUpdate.affectedAssets,
          iocs: alertUpdate.iocs,
          tags: alertUpdate.tags,
        };
      }

      const nextAlerts = alertUpdate
        ? {
            ...prev.alerts,
            [alertUpdate.id]: mergeAlert(prev.alerts[alertUpdate.id], alertUpdate),
          }
        : prev.alerts;

      return {
        ...prev,
        activeRunId: prev.activeRunId ?? runId,
        connection: {
          ...prev.connection,
          lastEventAt: now,
        },
        runs: {
          ...prev.runs,
          [runId]: nextRun,
        },
        alerts: nextAlerts,
      };
    });
  },
};

export const useRuntimeStore = <T,>(selector: (runtimeState: RuntimeState) => T): T => {
  return useSyncExternalStore(runtimeStore.subscribe, () => selector(state), () => selector(state));
};
