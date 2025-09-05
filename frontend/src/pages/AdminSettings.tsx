import { useEffect, useState } from 'react';
import apiRequest from '../services/api';

export default function AdminSettingsPage() {
  const [provider, setProvider] = useState<'deepseek' | 'local'>('deepseek');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await apiRequest('/admin/settings/llm');
      setProvider((d?.provider as any) || 'deepseek');
    } catch (e:any) { setError(e?.message || 'Failed to load LLM setting'); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await apiRequest('/admin/settings/llm', { method: 'POST', body: JSON.stringify({ provider }) });
    } catch (e:any) { setError(e?.message || 'Failed to save'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center justify-between">
        <div className="font-semibold">Admin Settings</div>
        <button className="px-2 py-1 border border-border rounded" onClick={load} disabled={busy}>Refresh</button>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      <div className="bg-surface rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">LLM Provider</div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1">
            <input type="radio" name="llm" value="deepseek" checked={provider==='deepseek'} onChange={()=>setProvider('deepseek')} /> DeepSeek
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="llm" value="local" checked={provider==='local'} onChange={()=>setProvider('local')} /> Local (http://127.0.0.1:1234, model zysec-ai_-_securityllm)
          </label>
          <button className="px-2 py-1 border border-border rounded" onClick={save} disabled={busy}>Save</button>
        </div>
        <div className="text-xs text-muted mt-2">This is a single toggle that switches the entire backend between providers. No code changes needed.</div>
      </div>
    </div>
  );
}

