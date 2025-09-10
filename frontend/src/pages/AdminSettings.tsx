import { useEffect, useState } from 'react';
import apiRequest from '../services/api';

export default function AdminSettingsPage() {
  const [provider, setProvider] = useState<'deepseek' | 'local'>('deepseek');
  const [allowSelfRegister, setAllowSelfRegister] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [validateBusy, setValidateBusy] = useState(false);
  const [validateMsg, setValidateMsg] = useState('');

  // Validation inputs (not persisted; optional convenience)
  const [dsApiKey, setDsApiKey] = useState('');
  const [dsBase, setDsBase] = useState('https://api.deepseek.com/v1');
  const [dsModel, setDsModel] = useState('deepseek-chat');
  const [localBase, setLocalBase] = useState('http://127.0.0.1:1234/v1');
  const [localModel, setLocalModel] = useState('zysec-ai_-_securityllm');

  async function load() {
    try {
      const d = await apiRequest('/admin/settings/llm');
      setProvider((d?.provider as any) || 'deepseek');
      const r = await apiRequest('/admin/settings/register');
      setAllowSelfRegister(!!r?.allowSelfRegister);
    } catch (e:any) { setError(e?.message || 'Failed to load LLM setting'); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await apiRequest('/admin/settings/llm', { method: 'POST', body: JSON.stringify({ provider }) });
      await apiRequest('/admin/settings/register', { method: 'POST', body: JSON.stringify({ allowSelfRegister }) });
    } catch (e:any) { setError(e?.message || 'Failed to save'); } finally { setBusy(false); }
  }

  async function validateLLM() {
    setValidateMsg('');
    setValidateBusy(true);
    try {
      const body = provider === 'deepseek' ? {
        provider,
        apiKey: dsApiKey || undefined,
        baseUrl: dsBase || undefined,
        model: dsModel || undefined,
      } : {
        provider,
        baseUrl: localBase || undefined,
        model: localModel || undefined,
      };
      const r = await apiRequest('/admin/settings/llm/validate', { method: 'POST', body: JSON.stringify(body) });
      if (r && r.ok) setValidateMsg(`Validation succeeded for ${r.provider} at ${r.base} (${r.model})`);
      else setValidateMsg('Validation failed.');
    } catch (e:any) {
      setValidateMsg(e?.message || 'Validation failed');
    } finally {
      setValidateBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center justify-between">
        <div className="font-semibold">Admin Settings</div>
        <button className="px-2 py-1 border border-border rounded" onClick={load} disabled={busy}>Refresh</button>
      </div>
      {error && <div className="text-danger text-sm" role="alert">{error}</div>}
      <div className="bg-surface rounded-lg border border-border p-3 space-y-2">
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
        <div className="text-xs text-muted">This is a single toggle that switches the entire backend between providers. No code changes needed.</div>
        {/* Inline validation controls (optional convenience, not persisted) */}
        {provider === 'deepseek' ? (
          <div className="mt-2 space-y-2">
            <div className="text-sm font-medium">Validate DeepSeek connectivity</div>
            <div className="flex flex-col gap-2 max-w-xl">
              <label className="flex items-center gap-2">
                <span className="w-32 text-sm text-muted">API Key</span>
                <input type="password" value={dsApiKey} onChange={e=>setDsApiKey(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded" placeholder="sk-..." />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-32 text-sm text-muted">Base URL</span>
                <input type="text" value={dsBase} onChange={e=>setDsBase(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded" placeholder="https://api.deepseek.com/v1" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-32 text-sm text-muted">Model</span>
                <input type="text" value={dsModel} onChange={e=>setDsModel(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded" placeholder="deepseek-chat" />
              </label>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="text-sm font-medium">Validate Local API connectivity</div>
            <div className="flex flex-col gap-2 max-w-xl">
              <label className="flex items-center gap-2">
                <span className="w-32 text-sm text-muted">Base URL</span>
                <input type="text" value={localBase} onChange={e=>setLocalBase(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded" placeholder="http://127.0.0.1:1234/v1" />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-32 text-sm text-muted">Model</span>
                <input type="text" value={localModel} onChange={e=>setLocalModel(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded" placeholder="zysec-ai_-_securityllm" />
              </label>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <button className="px-2 py-1 border border-border rounded" onClick={validateLLM} disabled={validateBusy}>{validateBusy ? 'Validating...' : 'Validate'}</button>
          {validateMsg && <div className="text-xs">{validateMsg}</div>}
        </div>
      </div>
      <div className="bg-surface rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">Registration</div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowSelfRegister} onChange={e=>setAllowSelfRegister(e.target.checked)} /> Allow self registration (POST /auth/register)
        </label>
        <div className="text-xs text-muted mt-2">When disabled, registration requests are rejected with 403. Admin can re-enable here.</div>
      </div>
    </div>
  );
}
