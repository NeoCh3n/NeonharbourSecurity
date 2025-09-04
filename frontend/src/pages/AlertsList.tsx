import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertsApi } from '../services/api';
import apiRequest, { planApi, actionsApi } from '../services/api';

type Row = { id: number; createdAt: string; source: string; status: string; severity: string };

export default function AlertsListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    alertsApi.list()
      .then((data: any) => {
        const list: Row[] = data.alerts || [];
        // Ensure newest at top in UI even if backend changes default
        list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRows(list);
      })
      .catch((e: any) => setError(e?.message || '加载失败'));
  }, []);

  async function openDetail(id: number) {
    // Navigate to modern detail page; immediate route change provides timely feedback
    navigate(`/alerts/${id}`);
  }

  // detail interactions moved to the dedicated detail page for modern UI

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 shadow-sm flex items-center justify-between">
        <div className="font-semibold">告警列表 / Alerts</div>
        <div className="text-sm text-muted">最近写入将显示在最前</div>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      <div className="bg-surface rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surfaceAlt">
            <tr>
              <th className="text-left px-3 py-2 border-b border-border">ID</th>
              <th className="text-left px-3 py-2 border-b border-border">时间</th>
              <th className="text-left px-3 py-2 border-b border-border">来源</th>
              <th className="text-left px-3 py-2 border-b border-border">状态</th>
              <th className="text-left px-3 py-2 border-b border-border">严重度</th>
              <th className="text-left px-3 py-2 border-b border-border">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border">
                <td className="px-3 py-2">{r.id}</td>
                <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{r.source}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.severity}</td>
                <td className="px-3 py-2 flex gap-2">
                  <button className="px-2 py-1 border border-border rounded-md" onClick={() => openDetail(r.id)}>详情</button>
                  <a className="px-2 py-1 border border-border rounded-md" href={`/alert-workspace?alertId=${r.id}`}>工作台</a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={6}>暂无数据 / No alerts</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted">提示：最新写入显示在最前。如看不到新数据，请刷新或重新拉取。</div>
      {/* Detailed view moved to dedicated page for modern UI with skeletons and actions */}
    </div>
  );
}
