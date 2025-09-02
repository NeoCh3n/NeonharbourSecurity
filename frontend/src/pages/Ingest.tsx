import { useEffect, useState } from 'react';
import { authApi } from '../services/api';
import apiRequest, { alertsApi } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function IngestPage() {
  const [email, setEmail] = useState('demo@local');
  const [password, setPassword] = useState('demo1234');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setStatus('已登录 / Token present');
  }, []);

  async function ensureLogin() {
    setBusy(true);
    setStatus('登录中 / Signing in...');
    try {
      try {
        const r = await authApi.login(email, password);
        if (r?.token) {
          localStorage.setItem('token', r.token);
          setStatus('登录成功 / Signed in');
          setBusy(false);
          return true;
        }
      } catch (e: any) {
        // If invalid credentials, try to register then login
        try {
          await authApi.register(email, password);
          const r2 = await authApi.login(email, password);
          if (r2?.token) {
            localStorage.setItem('token', r2.token);
            setStatus('已注册并登录 / Registered & signed in');
            setBusy(false);
            return true;
          }
        } catch (e2: any) {
          setStatus('登录失败 / Sign-in failed');
          setBusy(false);
          return false;
        }
      }
    } finally {
      setBusy(false);
    }
    setBusy(false);
    setStatus('登录失败 / Sign-in failed');
    return false;
  }

  async function ingestSamples() {
    const ok = await ensureLogin();
    if (!ok) return;
    setBusy(true);
    setStatus('写入样例告警 / Ingesting samples...');
    try {
      const samples = [
        { source: 'splunk', _time: new Date().toISOString(), user: 'bob', src_ip: '203.0.113.5', action: 'login_success', app: 'okta' },
        { ServiceSource: 'Microsoft Defender', Timestamp: new Date().toISOString(), AccountName: 'alice', DeviceName: 'WS-01', ActionType: 'MalwareDetected', RemoteIp: '198.51.100.10', SHA256: 'd41d8cd98f00b204e9800998ecf8427e' },
        { mailFrom: 'phish@example.com', rcptTo: 'user@example.com', subject: 'Reset your password', url: 'http://malicious.test/reset', senderIP: '203.0.113.10', timestamp: new Date().toISOString(), disposition: 'email_delivered' }
      ];
      const resp = await apiRequest('/alerts/ingest', { method: 'POST', body: JSON.stringify(samples) });
      const count = Array.isArray(resp.alerts) ? resp.alerts.length : 0;
      setStatus(`写入完成 / Ingested ${count} alerts`);
    } catch (e: any) {
      setStatus(`写入失败 / Ingest failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function viewAlerts() {
    const ok = await ensureLogin();
    if (!ok) return;
    navigate('/alerts-list');
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-lg border border-border p-3 shadow-sm">
        <div className="text-sm text-muted mb-2">浏览器内验证 / In-Browser Validation</div>
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
          <button disabled={busy} className="px-3 py-1.5 border border-border rounded-md" onClick={ensureLogin}>登录/注册</button>
          <button disabled={busy} className="px-3 py-1.5 border border-border rounded-md" onClick={ingestSamples}>写入样例告警</button>
          <button disabled={busy} className="px-3 py-1.5 border border-border rounded-md" onClick={viewAlerts}>查看告警列表</button>
        </div>
        <div className="text-sm text-muted mt-2">{status}</div>
      </div>
      <div className="bg-surface rounded-lg border border-border p-3 text-sm text-muted">
        验证步骤：1) 登录/注册获取令牌 2) 写入 Splunk/Defender/Email 三类样例 3) 查看列表与详情。后端已启用规范化、语义归一、指纹并案、AI 分析时间线占位。
      </div>
    </div>
  );
}

