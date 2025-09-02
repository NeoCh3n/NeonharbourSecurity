import { useUI } from '../../store/ui';

export function RightPanel() {
  const setOpen = useUI(s => s.setRightPanelOpen);
  return (
    <aside className="w-[320px] bg-surface border-l border-border min-h-[calc(100vh-56px)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">情报侧栏 Intelligence</div>
        <button className="text-muted hover:text-text" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="text-sm text-muted">
        - 最新情报摘要（IOC、TTP、来源）
        <br/>- 订阅源：内外部 CTI
        <br/>- 与当前筛选条件相关的命中
      </div>
    </aside>
  );
}

