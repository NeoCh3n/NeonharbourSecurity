import { useEffect, useState } from 'react';
import { authApi } from '../services/api';
import { useAuth } from '../store/auth';
import apiRequest, { alertsApi, integrationsApi, IntegrationItem } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function IngestPage() {
  const [email, setEmail] = useState('demo@local');
  const [password, setPassword] = useState('demo1234');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const navigate = useNavigate();
  const { me, login, register, refresh } = useAuth();

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setStatus('Signed in / Token present');
    if (t) { integrationsApi.get().then(d => setIntegrations(d.integrations || [])).catch(()=>{}); }
    void refresh();
  }, []);

  useEffect(() => {
    // When user changes, refresh integrations and status banner
    const t = localStorage.getItem('token');
    if (t) {
      integrationsApi.get().then(d => setIntegrations(d.integrations || [])).catch(()=>{});
      setStatus(`Signed in${me?.email ? ' as ' + me.email : ''}`);
    } else {
      setStatus('Not signed in');
      setIntegrations([]);
    }
  }, [me?.id]);

  async function signIn() {
    setBusy(true);
    setStatus('Signing in...');
    try {
      await login(email, password);
      setStatus('Signed in');
      return true;
    } catch (e:any) {
      setStatus('Sign-in failed: ' + (e?.message || e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function registerUser() {
    setBusy(true);
    setStatus('Registering...');
    try {
      await register(email, password);
      setStatus('Registered (token issued). You can now sign in.');
    } catch (e:any) {
      setStatus('Register failed: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function ingestSamples() {
    const ok = !!localStorage.getItem('token') || await signIn();
    if (!ok) return;
    setBusy(true);
    setStatus('Ingesting sample alerts...');
    try {
      const samples = [
        { source: 'splunk', _time: new Date().toISOString(), user: 'bob', src_ip: '203.0.113.5', action: 'login_success', app: 'okta' },
        { ServiceSource: 'Microsoft Defender', Timestamp: new Date().toISOString(), AccountName: 'alice', DeviceName: 'WS-01', ActionType: 'MalwareDetected', RemoteIp: '198.51.100.10', SHA256: 'd41d8cd98f00b204e9800998ecf8427e' },
        { mailFrom: 'phish@example.com', rcptTo: 'user@example.com', subject: 'Reset your password', url: 'http://malicious.test/reset', senderIP: '203.0.113.10', timestamp: new Date().toISOString(), disposition: 'email_delivered' }
      ];
      const resp = await apiRequest('/alerts/ingest', { method: 'POST', body: JSON.stringify(samples) });
      const count = Array.isArray(resp.alerts) ? resp.alerts.length : 0;
      setStatus(`Ingested ${count} alerts`);
    } catch (e: any) {
      setStatus(`Ingest failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function viewAlerts() {
    const ok = !!localStorage.getItem('token') || await signIn();
    if (!ok) return;
    navigate('/alerts-list');
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 flex items-center justify-between">
        <div className="text-sm text-muted">In-Browser Validation</div>
        <div className="text-sm">
          {me ? (
            <span>Signed in as <span className="font-medium">{me.email}</span> · Tenant <span className="font-medium">{me.currentTenantId ?? '-'}</span></span>
          ) : (
            <span className="text-muted">Not signed in</span>
          )}
        </div>
      </div>
      <div className="bg-surface rounded-lg border border-border p-3 shadow-sm">
        <div className="text-sm text-muted mb-2">In-Browser Validation</div>
        {!me ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted mb-1">Email</label>
                <input className="w-full border border-border rounded-md px-3 py-2 bg-surface text-text" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Password</label>
                <input type="password" className="w-full border border-border rounded-md px-3 py-2 bg-surface text-text" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={busy} className="px-3 py-1.5 border border-border rounded-md btn-gradient" onClick={signIn}>Sign In</button>
              <button disabled={busy} className="px-3 py-1.5 border border-border rounded-md" onClick={registerUser}>Register</button>
              <button disabled={busy} className="px-3 py-1.5 border border-border rounded-md" onClick={viewAlerts}>View Alerts</button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Signed in as</span> <span className="px-2 py-0.5 rounded bg-surfaceAlt border border-border">{me.email}</span>
            <button className="ml-2 px-3 py-1.5 border border-border rounded-md" onClick={ingestSamples}>Ingest Samples</button>
            <button className="px-3 py-1.5 border border-border rounded-md" onClick={viewAlerts}>View Alerts</button>
          </div>
        )}
        <div className="text-sm text-muted mt-2">{status}</div>
      </div>
      <div className="bg-surface rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">Data Source Control Panel</div>
        <div className="text-sm text-muted mb-2">Choose which read-only sources to connect (Sentinel / Splunk / Defender / CrowdStrike / Entra / Okta / CloudTrail & GuardDuty / Wiz / Email Security). Saving writes to the audit log.</div>
        <IntegrationsEditor items={integrations} onChange={setIntegrations} />
        <div className="mt-3">
          <button disabled={savingIntegrations} className="px-3 py-1.5 border border-border rounded-md" onClick={async ()=>{
            const ok = await ensureLogin();
            if (!ok) { setStatus('Not signed in, cannot save'); return; }
            setSavingIntegrations(true);
            try {
              await integrationsApi.save(integrations);
              setStatus('Data source settings saved');
            } catch (e: any) {
              setStatus('Save failed: ' + (e?.message || e));
            } finally {
              setSavingIntegrations(false);
            }
          }}>Save</button>
        </div>
      </div>
      <div className="bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        Validation steps: 1) Sign in to obtain token 2) Ingest sample alerts (Splunk/Defender/Email) 3) View list and detail. Backend enables normalization, semantic unification, casing, and AI timeline.
      </div>
    </div>
  );
}

function IntegrationsEditor({ items, onChange }: { items: IntegrationItem[]; onChange: (x: IntegrationItem[]) => void }) {
  const providers = [
    { id: 'sentinel', label: 'Microsoft Sentinel' },
    { id: 'splunk', label: 'Splunk' },
    { id: 'defender', label: 'Microsoft Defender' },
    { id: 'crowdstrike', label: 'CrowdStrike Falcon' },
    { id: 'entra', label: 'Microsoft Entra ID' },
    { id: 'okta', label: 'Okta' },
    { id: 'cloudtrail', label: 'AWS CloudTrail & GuardDuty' },
    { id: 'wiz', label: 'Wiz' },
    { id: 'email', label: 'Email Security' }
  ];

  function get(provider: string): IntegrationItem {
    const p = (items || []).find(x => x.provider === provider);
    return p || { provider, enabled: false, settings: {} };
  }
  function set(item: IntegrationItem) {
    const arr = items ? items.slice() : [];
    const idx = arr.findIndex(x => x.provider === item.provider);
    if (idx >= 0) arr[idx] = item; else arr.push(item);
    onChange(arr);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {providers.map(p => {
        const it = get(p.id);
        return (
          <div key={p.id} className="border border-border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{p.label}</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!it.enabled} onChange={e=>set({ ...it, enabled: e.target.checked })} /> 启用
              </label>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
              <input className="px-2 py-1 border border-border rounded-md bg-surface" placeholder="Endpoint / URL (可选)" value={it.settings?.url || ''} onChange={e=>set({ ...it, settings: { ...(it.settings||{}), url: e.target.value } })} />
              <input className="px-2 py-1 border border-border rounded-md bg-surface" placeholder="Token / Key (可选)" value={it.settings?.token || ''} onChange={e=>set({ ...it, settings: { ...(it.settings||{}), token: e.target.value } })} />
            </div>
            <div className="text-xs text-muted mt-2">仅保存只读接入所需的最小配置；敏感信息请使用密钥管理服务。</div>
          </div>
        );
      })}
    </div>
  );
}
