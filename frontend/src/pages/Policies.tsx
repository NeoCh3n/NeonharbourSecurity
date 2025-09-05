import { useEffect, useState } from 'react';
import { policiesApi, PolicyItem } from '../services/api';

export default function PoliciesPage() {
  const [rows, setRows] = useState<PolicyItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PolicyItem>({ name: '', effect: 'require_approval', action_pattern: '', resource_pattern: '*', conditions: {}, risk: 'medium' });

  async function refresh() {
    try {
      const d = await policiesApi.list();
      setRows(d.policies || []);
    } catch (e:any) { setError(e?.message || 'Failed to load policies'); }
  }
  useEffect(() => { refresh(); }, []);

  async function addPolicy() {
    if (!form.name || !form.action_pattern) return;
    setBusy(true);
    try {
      let conditions: any = form.conditions;
      if (typeof conditions === 'string') {
        try { conditions = JSON.parse(conditions as any); } catch { conditions = {}; }
      }
      await policiesApi.create({ ...form, conditions });
      setForm({ name: '', effect: 'require_approval', action_pattern: '', resource_pattern: '*', conditions: {}, risk: 'medium' });
      await refresh();
    } catch (e:any) { setError(e?.message || 'Create failed'); } finally { setBusy(false); }
  }

  async function remove(id?: number) {
    if (!id) return;
    setBusy(true);
    try { await policiesApi.remove(id); await refresh(); } catch (e:any) { setError(e?.message || 'Delete failed'); } finally { setBusy(false); }
  }

  async function resetDefaults() {
    setBusy(true);
    try { await policiesApi.resetDefaults(); await refresh(); } catch (e:any) { setError(e?.message || 'Reset failed'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center justify-between">
        <div className="font-semibold">Policies</div>
        <div className="flex gap-2">
          <button className="px-2 py-1 border border-border rounded" onClick={refresh} disabled={busy}>Refresh</button>
          <button className="px-2 py-1 border border-border rounded" onClick={resetDefaults} disabled={busy}>Reset Defaults</button>
        </div>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      <div className="bg-surface rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">Add Policy</div>
        <div className="grid grid-cols-12 gap-2 text-sm">
          <input className="col-span-3 px-2 py-1 border border-border rounded" placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
          <select className="col-span-2 px-2 py-1 border border-border rounded" value={form.effect} onChange={e=>setForm({...form, effect:e.target.value as any})}>
            <option value="allow">allow</option>
            <option value="deny">deny</option>
            <option value="require_approval">require_approval</option>
          </select>
          <input className="col-span-2 px-2 py-1 border border-border rounded" placeholder="Action pattern" value={form.action_pattern} onChange={e=>setForm({...form, action_pattern:e.target.value})} />
          <input className="col-span-2 px-2 py-1 border border-border rounded" placeholder="Resource pattern" value={form.resource_pattern} onChange={e=>setForm({...form, resource_pattern:e.target.value})} />
          <input className="col-span-1 px-2 py-1 border border-border rounded" placeholder="Risk" value={form.risk} onChange={e=>setForm({...form, risk:e.target.value})} />
          <input className="col-span-12 px-2 py-1 border border-border rounded" placeholder='Conditions (JSON), e.g. {"min_severity":"high"}'
            value={typeof form.conditions === 'string' ? form.conditions : JSON.stringify(form.conditions)}
            onChange={e=>setForm({...form, conditions: e.target.value})}
          />
          <div className="col-span-12">
            <button className="px-2 py-1 border border-border rounded" onClick={addPolicy} disabled={busy || !form.name || !form.action_pattern}>Add Policy</button>
          </div>
        </div>
      </div>
      <div className="bg-surface rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surfaceAlt">
            <tr>
              <th className="text-left px-3 py-2 border-b border-border">ID</th>
              <th className="text-left px-3 py-2 border-b border-border">Name</th>
              <th className="text-left px-3 py-2 border-b border-border">Effect</th>
              <th className="text-left px-3 py-2 border-b border-border">Action</th>
              <th className="text-left px-3 py-2 border-b border-border">Resource</th>
              <th className="text-left px-3 py-2 border-b border-border">Risk</th>
              <th className="text-left px-3 py-2 border-b border-border">Conditions</th>
              <th className="text-left px-3 py-2 border-b border-border">Ops</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p:any)=> (
              <tr key={p.id} className="border-b border-border">
                <td className="px-3 py-2">{p.id}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.effect}</td>
                <td className="px-3 py-2">{p.action_pattern}</td>
                <td className="px-3 py-2">{p.resource_pattern}</td>
                <td className="px-3 py-2">{p.risk || '-'}</td>
                <td className="px-3 py-2"><code className="text-xs">{p.conditions ? JSON.stringify(p.conditions) : '{}'}</code></td>
                <td className="px-3 py-2">
                  <button className="px-2 py-1 border border-border rounded" onClick={()=>remove(p.id)} disabled={busy}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="px-3 py-4 text-muted" colSpan={8}>No policies</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

