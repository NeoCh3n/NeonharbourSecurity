import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { authApi } from '../services/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login, register, loading } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError('Username and password required');
      return;
    }
    try {
      await login(username, password);
      navigate('/report', { replace: true });
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    }
  }

  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: '40% 60%' }}>
      <section className="bg-surfaceAlt border-r border-border p-8 flex flex-col justify-center">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-semibold text-text mb-2">NeonHarbour Security</h1>
          <p className="text-muted">Enterprise Security Platform</p>
          <div className="mt-8 text-sm text-muted">Last login: —</div>
        </div>
      </section>
      <section className="p-8 flex items-center">
        <form onSubmit={handleSubmit} className="max-w-md w-full mx-auto space-y-4 bg-surface p-6 rounded-lg shadow-md border border-border">
          <div>
            <label className="block text-sm text-muted mb-1">Username</label>
            <input className="w-full border border-border rounded-md px-3 py-2 bg-surface text-text focus-ring" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Password</label>
            <div className="flex items-center gap-2">
              <input type={showPwd ? 'text' : 'password'} className="flex-1 border border-border rounded-md px-3 py-2 bg-surface text-text focus-ring" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="px-2 py-1 border border-border rounded-md" onClick={() => setShowPwd(s => !s)}>{showPwd ? 'Hide' : 'Show'}</button>
            </div>
            <div className="text-xs text-muted mt-1">CapsLock/Paste check (demo)</div>
          </div>
          {error && <div role="alert" className="text-danger text-sm">{error}</div>}
          <button disabled={loading} type="submit" className="w-full bg-primary text-primaryFg rounded-md py-2 hover:opacity-90">Sign In</button>
          <div className="text-xs text-muted">SSO, privacy & terms, traceId placeholder</div>
          <div className="text-xs text-muted">No account? <button type="button" className="underline" onClick={async ()=>{
            try { await register(username || 'demo@local', password || 'demo1234'); navigate('/report', { replace: true }); }
            catch (e: any) { setError(e?.message || 'Register failed'); }
          }}>Register</button></div>
        </form>
      </section>
    </div>
  );
}
