import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError('请输入用户名和密码 / Username and password required');
      return;
    }
    // Simulate MFA requirement for demo
    if (!mfaNeeded) {
      setMfaNeeded(true);
      return;
    }
    if (mfaCode.length < 6) {
      setError('请输入 6 位 MFA 验证码 / Enter 6-digit MFA code');
      return;
    }
    // Success
    navigate('/dashboard');
    // In real app: show toast with last login time/location and traceId
  }

  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: '40% 60%' }}>
      <section className="bg-surfaceAlt border-r border-border p-8 flex flex-col justify-center">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-semibold text-text mb-2">NeonHarbour Security</h1>
          <p className="text-muted">企业安全平台 / Enterprise Security Platform</p>
          <div className="mt-8 text-sm text-muted">
            上次登录时间与位置：—
          </div>
        </div>
      </section>
      <section className="p-8 flex items-center">
        <form onSubmit={handleSubmit} className="max-w-md w-full mx-auto space-y-4 bg-surface p-6 rounded-lg shadow-md border border-border">
          <div>
            <label className="block text-sm text-muted mb-1">用户名 / Username</label>
            <input className="w-full border border-border rounded-md px-3 py-2 bg-surface text-text focus-ring" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">密码 / Password</label>
            <div className="flex items-center gap-2">
              <input type={showPwd ? 'text' : 'password'} className="flex-1 border border-border rounded-md px-3 py-2 bg-surface text-text focus-ring" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="px-2 py-1 border border-border rounded-md" onClick={() => setShowPwd(s => !s)}>{showPwd ? '隐藏' : '显示'}</button>
            </div>
            <div className="text-xs text-muted mt-1">CapsLock 检测 / Paste 检测（示意）</div>
          </div>
          {mfaNeeded && (
            <div>
              <label className="block text-sm text-muted mb-1">MFA（TOTP/SMS/Key）</label>
              <input inputMode="numeric" maxLength={6} className="w-full border border-border rounded-md px-3 py-2 bg-surface text-text focus-ring" value={mfaCode} onChange={e => setMfaCode(e.target.value)} />
            </div>
          )}
          {error && <div role="alert" className="text-danger text-sm">{error}</div>}
          <button type="submit" className="w-full bg-primary text-primaryFg rounded-md py-2 hover:opacity-90">登录 / Sign In</button>
          <div className="text-xs text-muted">SSO、隐私与条款、traceId 占位</div>
        </form>
      </section>
    </div>
  );
}

