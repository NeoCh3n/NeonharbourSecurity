import { runtimeClient } from './client';
import { runtimeStore } from './store';
import { loadRuntimeSettings, saveRuntimeSettings, type RuntimeConnectionSettings } from './settings';
import { demoRuntime } from './demo';
import type { RuntimeState } from './types';
import type { SecurityAlert } from '../agents';

const bootstrapSettings = loadRuntimeSettings();
runtimeClient.setSettings(bootstrapSettings);
runtimeStore.updateConnection({ mode: bootstrapSettings.mode });

const ensureSubscription = async (state: RuntimeState) => {
  if (!state.activeRunId) return;
  const run = state.runs[state.activeRunId];
  if (!run) return;
  await runtimeClient.subscribeToRun(run.runId, run.lastSequence);
};

if (bootstrapSettings.autoConnect) {
  runtimeClient.connect(bootstrapSettings).then(() => ensureSubscription(runtimeStore.getState())).catch(() => {
    // Connection errors are surfaced via runtimeStore connection state.
  });
}

export const runtimeService = {
  connect: async (settings?: RuntimeConnectionSettings) => {
    const next = settings ?? loadRuntimeSettings();
    runtimeClient.setSettings(next);
    saveRuntimeSettings(next);
    runtimeStore.updateConnection({ mode: next.mode });
    
    // If endpoint is empty, use demo mode
    if (!next.endpoint) {
      runtimeStore.updateConnection({ 
        status: 'connected', 
        mode: 'gateway',
        lastConnectedAt: new Date().toISOString(),
      });
      return;
    }
    
    await runtimeClient.connect(next);
    await ensureSubscription(runtimeStore.getState());
  },
  disconnect: () => {
    runtimeClient.disconnect();
  },
  startRun: async (alert: SecurityAlert, options?: Record<string, unknown>) => {
    const settings = loadRuntimeSettings();
    
    // Use demo runtime if no endpoint configured or explicitly in demo mode
    if (!settings.endpoint || settings.mode === 'gateway' && !runtimeClient.isConnected()) {
      await demoRuntime.startRun(alert);
      return { run_id: 'demo-run' };
    }
    
    const result = await runtimeClient.startRun(alert, options);
    if (result?.run_id) {
      runtimeStore.setActiveRun(result.run_id);
      const alertId = alert.id as string | undefined;
      runtimeStore.hydrateRunMetadata(result.run_id, {
        alertId,
        alertTitle: alert.title as string | undefined,
        alertDescription: alert.description as string | undefined,
        severity: alert.severity as string | undefined,
        source: alert.source as string | undefined,
        timestamp: alert.timestamp as string | undefined,
        status: alert.status as string | undefined,
        location: alert.location as string | undefined,
        confidence: alert.confidence as number | undefined,
        affectedAssets: alert.affectedAssets as string[] | undefined,
        iocs: alert.iocs as any,
        tags: alert.tags as string[] | undefined,
      });
      if (alertId) {
        runtimeStore.upsertAlert({
          id: alertId,
          title: alert.title as string,
          severity: alert.severity as string | undefined,
          source: alert.source as string | undefined,
          timestamp: alert.timestamp as string | undefined,
          status: alert.status as string | undefined,
          description: alert.description as string | undefined,
          iocs: alert.iocs as any,
          affectedAssets: alert.affectedAssets as string[] | undefined,
          location: alert.location as string | undefined,
          tags: alert.tags as string[] | undefined,
          confidence: alert.confidence as number | undefined,
          runId: result.run_id,
        });
      }
    }
    return result;
  },
  stopRun: (runId: string) => {
    if (demoRuntime.isRunning()) {
      demoRuntime.stopRun();
      return Promise.resolve();
    }
    return runtimeClient.stopRun(runId);
  },
  respondToApproval: (requestId: string, decision: 'approved' | 'rejected', comment?: string) =>
    runtimeClient.respondToServerRequest(requestId, decision, comment),
  executeAgent: (
    agentId: string,
    input: Record<string, unknown>,
    options?: { runId?: string } & Record<string, unknown>,
  ) => {
    const { runId, ...rest } = options ?? {};
    return runtimeClient.executeAgent(agentId, input, runId, rest);
  },
  setConnectionSettings: (settings: RuntimeConnectionSettings) => {
    runtimeClient.setSettings(settings);
    saveRuntimeSettings(settings);
    runtimeStore.updateConnection({ mode: settings.mode });
  },
  clearRun: (runId: string) => runtimeStore.clearRun(runId),
};

export * from './store';
export * from './types';
export * from './settings';
