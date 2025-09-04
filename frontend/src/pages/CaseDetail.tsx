import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiRequest from '../services/api';

export default function CaseDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    apiRequest(`/cases/${id}`).then(d => setData(d)).catch((e:any)=>setError(e?.message || '加载失败'));
  }, [id]);

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center gap-2">
        <Link to="/cases" className="px-3 py-1.5 border border-border rounded-md">返回案件</Link>
        <div className="font-semibold">案件 #{id}</div>
        <div className="text-xs text-muted ml-2">Severity: {data?.case?.severity} · Status: {data?.case?.status}</div>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      {!data ? (
        <div className="h-64 bg-surface rounded-lg border border-border animate-pulse" />
      ) : (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8 bg-surface rounded-lg border border-border p-3">
            <div className="font-semibold mb-2">告警列表</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surfaceAlt">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-border">ID</th>
                    <th className="text-left px-3 py-2 border-b border-border">时间</th>
                    <th className="text-left px-3 py-2 border-b border-border">Severity</th>
                    <th className="text-left px-3 py-2 border-b border-border">Status</th>
                    <th className="text-left px-3 py-2 border-b border-border">摘要</th>
                    <th className="text-left px-3 py-2 border-b border-border">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.alerts.map((a:any)=>(
                    <tr key={a.id} className="border-b border-border">
                      <td className="px-3 py-2">{a.id}</td>
                      <td className="px-3 py-2">{new Date(a.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{a.severity}</td>
                      <td className="px-3 py-2">{a.status}</td>
                      <td className="px-3 py-2">{a.summary}</td>
                      <td className="px-3 py-2 flex gap-2">
                        <Link to={`/alerts/${a.id}`} className="px-2 py-1 border border-border rounded-md">详情</Link>
                        <a href={`/alert-workspace?alertId=${a.id}`} className="px-2 py-1 border border-border rounded-md">工作台</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 bg-surface rounded-lg border border-border p-3">
            <div className="font-semibold mb-2">受影响实体</div>
            <ul className="list-disc ml-5 text-sm">
              {(data.impacted || []).map((e:string,i:number)=>(<li key={i}>{e}</li>))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

