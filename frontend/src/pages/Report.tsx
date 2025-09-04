import DashboardPage from './Dashboard';

export default function ReportPage() {
  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        KPI and reporting: view trends and distributions. Note: MTTI/MTTR may be empty until the relevant stages are completed.
      </div>
      <DashboardPage />
    </div>
  );
}
