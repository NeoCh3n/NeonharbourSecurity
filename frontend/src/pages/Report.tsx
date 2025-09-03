import DashboardPage from './Dashboard';

export default function ReportPage() {
  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        KPI/报告视图：查看趋势与分布。提示：当尚未进入相关阶段时，MTTI/MTTR 可能为空，属正常现象。
      </div>
      <DashboardPage />
    </div>
  );
}
