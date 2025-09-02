import { useEffect, useState } from 'react';
import { alertsApi } from '../services/api';
import apiRequest from '../services/api';

type Row = { id: number; createdAt: string; source: string; status: string; severity: string };

export default function AlertsListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    alertsApi.list()
      .then((data: any) => setRows(data.alerts || []))
      .catch((e: any) => setError(e?.message || '加载失败'));
  }, []);

  async function openDetail(id: number) {
    setError(null);
    setDetail(null);
    try {
      const r = await apiRequest(`/alerts/${id}`);
      setDetail(r);
    } catch (e: any) {
      setError(e?.message || '加载详情失败');
    }
  }

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
                <td className="px-3 py-2"><button className="px-2 py-1 border border-border rounded-md" onClick={() => openDetail(r.id)}>详情</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-muted" colSpan={5}>暂无数据 / No alerts</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="bg-surface rounded-lg border border-border p-3 text-sm">
          <div className="font-semibold mb-2">告警详情 #{detail.id}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted">Action:</span> {detail.action}</div>
            <div><span className="text-muted">Category:</span> {detail.category}</div>
            <div><span className="text-muted">Technique:</span> {detail.technique || '-'}</div>
            <div><span className="text-muted">Case ID:</span> {detail.case_id || '-'}</div>
            <div className="col-span-2"><span className="text-muted">Fingerprint:</span> {detail.fingerprint || '-'}</div>
          </div>
          <div className="mt-2"><span className="text-muted">Entities:</span>
            <pre className="mt-1 p-2 bg-surfaceAlt rounded-md overflow-auto">{JSON.stringify(detail.entities, null, 2)}</pre>
          </div>
          <div className="mt-2"><span className="text-muted">Timeline:</span>
            <pre className="mt-1 p-2 bg-surfaceAlt rounded-md overflow-auto">{JSON.stringify(detail.timeline, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
