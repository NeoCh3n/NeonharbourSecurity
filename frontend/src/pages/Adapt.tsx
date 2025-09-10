import { useState } from 'react';

export default function AdaptPage() {
  const [log, setLog] = useState<string[]>([]);

  function addFeedback(msg: string) {
    setLog(prev => [new Date().toLocaleString() + ' - ' + msg, ...prev]);
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        Adapt: Click the feedback buttons to add entries that inform noise reduction and coverage optimization.
      </div>
      <div className="col-span-12 lg:col-span-8 space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Feedback</div>
          <div className="flex flex-wrap gap-2">
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>addFeedback('Mark future as benign for this pattern')}>Mark Benign Next Time</button>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>addFeedback('Mark future as malicious for this pattern')}>Mark Malicious Next Time</button>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>addFeedback('Current conclusion incorrect; needs correction')}>Conclusion Needs Correction</button>
          </div>
        </div>

        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Tagging</div>
          <div className="text-sm text-muted">Tags like false-positive source, rule candidates, and data quality fixes will sync to Detection Advisor.</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">Repeat pattern</span>
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">Needs allowlist</span>
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">Missing fields</span>
          </div>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Change Proposals</div>
          <div className="text-sm">Generate tuning suggestions for the SIEM team (queries, thresholds, suppressions) and raise a ticket.</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3 mt-3">
          <div className="font-semibold mb-2">Feedback Log</div>
          <ul className="text-xs space-y-1">
            {log.map((l,i)=>(<li key={i}>• {l}</li>))}
            {log.length===0 && <li className="text-muted">No feedback</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
