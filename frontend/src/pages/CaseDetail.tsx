import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiRequest, { casesApi } from '../services/api';

export default function CaseDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [memory, setMemory] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [casePlan, setCasePlan] = useState<any | null>(null);
  const [addingNote, setAddingNote] = useState({ key: '', value: ''});
  const [creatingSession, setCreatingSession] = useState({ title: ''});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    apiRequest(`/cases/${id}`).then(d => setData(d)).catch((e:any)=>setError(e?.message || '加载失败'));
    casesApi.listMemory(Number(id)).then(d => setMemory(d.memory || [])).catch(()=>{});
    casesApi.listSessions(Number(id)).then(d => setSessions(d.sessions || [])).catch(()=>{});
    casesApi.getPlan(Number(id)).then(setCasePlan).catch(()=>{});
  }, [id]);

  async function addMemoryNote() {
    if (!id) return;
    setBusy(true);
    try {
      const payload = { type: 'note', key: addingNote.key || null, value: { text: addingNote.value } };
      await casesApi.addMemory(Number(id), payload);
      const d = await casesApi.listMemory(Number(id));
      setMemory(d.memory || []);
      setAddingNote({ key: '', value: ''});
    } catch (e:any) {
      setError(e?.message || 'Failed to add memory');
    } finally { setBusy(false); }
  }

  async function createNewSession() {
    if (!id || !creatingSession.title) return;
    setBusy(true);
    try {
      await casesApi.createSession(Number(id), { title: creatingSession.title });
      const d = await casesApi.listSessions(Number(id));
      setSessions(d.sessions || []);
      setCreatingSession({ title: ''});
    } catch (e:any) {
      setError(e?.message || 'Failed to create session');
    } finally { setBusy(false); }
  }

  async function runSummarize() {
    if (!id) return;
    setBusy(true);
    try {
      await casesApi.summarize(Number(id));
      const p = await casesApi.getPlan(Number(id));
      setCasePlan(p);
    } catch (e:any) {
      setError(e?.message || 'Failed to summarize');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center gap-2">
        <Link to="/cases" className="px-3 py-1.5 border border-border rounded-md">Back to Cases</Link>
        <div className="font-semibold">Case #{id}</div>
        <div className="text-xs text-muted ml-2">Severity: {data?.case?.severity} · Status: {data?.case?.status}</div>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      {!data ? (
        <div className="h-64 bg-surface rounded-lg border border-border animate-pulse" />
      ) : (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8 bg-surface rounded-lg border border-border p-3">
            <div className="font-semibold mb-2">Alerts</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-surfaceAlt">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-border">ID</th>
                    <th className="text-left px-3 py-2 border-b border-border">Time</th>
                    <th className="text-left px-3 py-2 border-b border-border">Severity</th>
                    <th className="text-left px-3 py-2 border-b border-border">Status</th>
                    <th className="text-left px-3 py-2 border-b border-border">Summary</th>
                    <th className="text-left px-3 py-2 border-b border-border">Actions</th>
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
                        <Link to={`/alerts/${a.id}`} className="px-2 py-1 border border-border rounded-md">View</Link>
                        <a href={`/alert-workspace?alertId=${a.id}`} className="px-2 py-1 border border-border rounded-md">Workspace</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <div className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold mb-2">Case Context Summary</div>
              <div className="text-sm whitespace-pre-line min-h-[80px]">{casePlan?.context_summary || 'No summary yet.'}</div>
              <div className="mt-2 flex gap-2">
                <button className="px-2 py-1 border border-border rounded-md" onClick={runSummarize} disabled={busy}>Summarize</button>
              </div>
            </div>
            <div className="bg-surface rounded-lg border border-border p-3">
              <div className="font-semibold mb-2">Impacted Entities</div>
              <ul className="list-disc ml-5 text-sm">
                {(data.impacted || []).map((e:string,i:number)=>(<li key={i}>{e}</li>))}
              </ul>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-6 bg-surface rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Case Memory</div>
              <div className="text-xs text-muted">{memory.length} items</div>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {memory.map((m:any)=>(
                <div key={m.id} className="border border-border rounded p-2 text-sm">
                  <div className="text-xs text-muted">[{m.type}] · {new Date(m.created_at).toLocaleString()}</div>
                  <div className="font-medium">{m.key}</div>
                  <div className="text-xs break-words">{typeof m.value === 'object' ? JSON.stringify(m.value) : String(m.value)}</div>
                </div>
              ))}
              {!memory.length && <div className="text-sm text-muted">No memory yet.</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={addingNote.key} onChange={e=>setAddingNote(v=>({...v,key:e.target.value}))} placeholder="Title" className="px-2 py-1 border border-border rounded w-40" />
              <input value={addingNote.value} onChange={e=>setAddingNote(v=>({...v,value:e.target.value}))} placeholder="Note" className="px-2 py-1 border border-border rounded flex-1" />
              <button className="px-2 py-1 border border-border rounded" onClick={addMemoryNote} disabled={busy}>Add</button>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-6 bg-surface rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Sessions</div>
              <div className="text-xs text-muted">{sessions.length} sessions</div>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {sessions.map((s:any)=>(
                <div key={s.id} className="border border-border rounded p-2 text-sm">
                  <div className="font-medium">{s.title || 'Session'} · #{s.id}</div>
                  <div className="text-xs text-muted">{new Date(s.created_at).toLocaleString()}</div>
                </div>
              ))}
              {!sessions.length && <div className="text-sm text-muted">No sessions.</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={creatingSession.title} onChange={e=>setCreatingSession({ title: e.target.value })} placeholder="Session title" className="px-2 py-1 border border-border rounded flex-1" />
              <button className="px-2 py-1 border border-border rounded" onClick={createNewSession} disabled={busy || !creatingSession.title}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
