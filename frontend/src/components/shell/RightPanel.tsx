import { useUI } from '../../store/ui';

export function RightPanel() {
  const setOpen = useUI(s => s.setRightPanelOpen);
  return (
    <aside className="w-[320px] bg-surface border-l border-border min-h-[calc(100vh-56px)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Context Panel</div>
        <button className="text-muted hover:text-text" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="space-y-3 text-sm">
        <section>
          <div className="text-muted mb-1">Fields</div>
          <ul className="space-y-1">
            <li>source: Sentinel</li>
            <li>event_type: login</li>
            <li>severity: Medium</li>
          </ul>
        </section>
        <section>
          <div className="text-muted mb-1">Impacted Entities</div>
          <ul className="list-disc ml-5">
            <li>alice@corp</li>
            <li>hk-core-srv-12</li>
          </ul>
        </section>
        <section>
          <div className="text-muted mb-1">IOCs</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">203.0.113.5</span>
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">hash:e3b0…</span>
          </div>
        </section>
        <section>
          <div className="text-muted mb-1">Audit Log</div>
          <ul className="space-y-1 text-xs">
            <li>• 查询 KQL: signins | where user == alice</li>
            <li>• 操作预览: 禁用账号 (未提交)</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
