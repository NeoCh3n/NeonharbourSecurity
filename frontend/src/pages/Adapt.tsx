import { useState } from 'react';

export default function AdaptPage() {
  const [log, setLog] = useState<string[]>([]);

  function addFeedback(msg: string) {
    setLog(prev => [new Date().toLocaleString() + ' - ' + msg, ...prev]);
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        Adapt：点击“下次标记良性/恶意/结论需修正”会新增反馈日志，并同步为后续降噪与覆盖优化的参考。
      </div>
      <div className="col-span-12 lg:col-span-8 space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">反馈卡片</div>
          <div className="flex flex-wrap gap-2">
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>addFeedback('此类事件下次标记为良性')}>下次标记良性</button>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>addFeedback('此类事件下次标记为恶意')}>下次标记恶意</button>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={()=>addFeedback('当前结论错误，需要修正')}>结论需修正</button>
          </div>
        </div>

        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">打标签 / 标注</div>
          <div className="text-sm text-muted">误报来源、规则候选、数据质量修复等标签将同步到 Detection Advisor 待办。</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">重复模式</span>
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">需要白名单</span>
            <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">数据缺字段</span>
          </div>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">变更提案</div>
          <div className="text-sm">生成给 SIEM 团队的调优建议（查询、阈值、抑制条件），可一键发起工单。</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3 mt-3">
          <div className="font-semibold mb-2">反馈日志</div>
          <ul className="text-xs space-y-1">
            {log.map((l,i)=>(<li key={i}>• {l}</li>))}
            {log.length===0 && <li className="text-muted">暂无反馈</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
