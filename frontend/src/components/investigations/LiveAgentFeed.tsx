import { useEffect, useRef, useState } from 'react';
import { investigationsApi } from '../../services/api';

type LiveEvent = {
  id: string;
  from: string;
  to?: string;
  investigationId: string;
  type: string;
  data: any;
  priority?: number;
  timestamp: string;
};

export default function LiveAgentFeed({ investigationId }: { investigationId: string }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [lastTs, setLastTs] = useState<string | undefined>(undefined);
  const timerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const resp: any = await investigationsApi.getEvents(investigationId, lastTs);
        const newEvents: LiveEvent[] = resp?.events || [];
        if (newEvents.length > 0) {
          setEvents(prev => {
            // Merge and de-duplicate by id
            const merged = [...prev, ...newEvents];
            const seen = new Set<string>();
            const dedup: LiveEvent[] = [];
            for (const e of merged) {
              if (!seen.has(e.id)) { seen.add(e.id); dedup.push(e); }
            }
            // Keep only last 200
            return dedup.slice(-200);
          });
          const latest = newEvents[newEvents.length - 1].timestamp;
          setLastTs(latest);
          // Auto scroll to bottom
          requestAnimationFrame(() => {
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
          });
        }
      } catch (e) {
        // ignore transient errors
      }
    }

    // Kick off immediately, then poll
    tick();
    timerRef.current = window.setInterval(tick, 1000) as unknown as number;

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [investigationId, lastTs]);

  const prettyType = (t: string) => {
    switch (t) {
      case 'agent_step_start': return 'Step Started';
      case 'agent_retry': return 'Retry';
      case 'agent_step_complete': return 'Step Completed';
      case 'agent_step_failed': return 'Step Failed';
      case 'agent_reason': return 'Reasoning';
      case 'status_update': return 'Status Update';
      default: return t;
    }
  };

  const colorFor = (t: string) => (
    t === 'agent_step_failed' ? 'bg-red-50 border-red-200' :
    t === 'agent_retry' ? 'bg-yellow-50 border-yellow-200' :
    t === 'agent_step_complete' ? 'bg-green-50 border-green-200' :
    t === 'status_update' ? 'bg-blue-50 border-blue-200' :
    t === 'agent_reason' ? 'bg-purple-50 border-purple-200' :
    'bg-surface border-border'
  );

  return (
    <div className="bg-surface rounded-lg border border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Live Agent Feed</h2>
          <p className="text-sm text-muted">Continuous updates during investigation</p>
        </div>
        <div className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">LIVE</div>
      </div>
      <div ref={listRef} className="p-4 space-y-3 max-h-72 overflow-auto">
        {events.length === 0 ? (
          <div className="text-center text-muted py-8">No events yet</div>
        ) : events.map(ev => (
          <div key={ev.id} className={`border rounded p-3 ${colorFor(ev.type)}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{prettyType(ev.type)}</div>
              <div className="text-xs text-muted">{new Date(ev.timestamp).toLocaleTimeString()}</div>
            </div>
            <div className="mt-1 text-sm">
              <span className="text-muted">Agent:</span> {ev.from}
            </div>
            {ev.data && (
              <div className="mt-2 text-xs whitespace-pre-wrap break-words">
                {ev.type === 'agent_reason' && ev.data?.reason ? (
                  <>{ev.data.reason}</>
                ) : ev.type === 'agent_step_complete' && (ev.data?.summary || ev.data?.reasoning) ? (
                  <>{ev.data.summary || ev.data.reasoning}</>
                ) : ev.type === 'status_update' && ev.data?.status ? (
                  <>Status: {ev.data.status}</>
                ) : (
                  <pre className="overflow-auto max-h-40">{JSON.stringify(ev.data, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

