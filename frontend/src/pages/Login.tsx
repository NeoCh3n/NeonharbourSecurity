import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { useAuth } from '../store/auth';
import { authApi } from '../services/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login, register, loading, refresh } = useAuth();
  const API_BASE = useMemo(() => ((import.meta as any).env.VITE_API_BASE_URL || '/api') as string, []);

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

  // Handle token handoff from OAuth callback (via #token=... or ?token=...)
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('token');
    const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('token');
    const t = fromQuery || fromHash;
    if (t) {
      try { localStorage.setItem('token', t); } catch {}
      (async () => { try { await refresh(); } catch {} finally { navigate('/report', { replace: true }); } })();
    }
  }, []);

  function startOAuth(provider: 'google' | 'microsoft') {
    setError(null);
    setRedirecting(provider);
    // Redirect to backend OAuth start endpoint (placeholder; backend should implement this route)
    const url = `${API_BASE}/auth/oauth/start?provider=${provider}`;
    window.location.href = url;
  }

  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: '40% 60%' }}>
      <header className="col-span-2 flex items-center justify-end gap-3 p-3 border-b border-border">
        <SignedOut>
          <SignInButton />
          <SignUpButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>
      <section className="bg-surfaceAlt border-r border-border p-8 flex flex-col justify-center">
        <div className="max-w-sm mx-auto w-full">
          <h1 className="text-2xl font-semibold text-text mb-2">NeonHarbour Security</h1>
          <p className="text-muted">Enterprise Security Platform</p>
          <div className="mt-8 text-sm text-muted">Last login: —</div>

          <div className="mt-8 text-sm text-muted">Internet Accounts</div>
          <div className="mt-3 space-y-3">
            <ConnectTile
              active
              icon={<SpinnerIcon />}
              label={redirecting === 'google' ? 'Connecting…' : 'Connect'}
              subtitle="Google"
              onClick={() => startOAuth('google')}
            />
            <ConnectTile
              icon={<GoogleIcon />}
              label={redirecting === 'google' ? 'Connecting…' : 'Connect'}
              subtitle="Google"
              onClick={() => startOAuth('google')}
              disabled={!!redirecting}
            />
            <ConnectTile
              icon={<AzureIcon />}
              label={redirecting === 'microsoft' ? 'Connecting…' : 'Connect'}
              subtitle="Microsoft Entra ID"
              onClick={() => startOAuth('microsoft')}
              disabled={!!redirecting}
            />
          </div>
        </div>
      </section>
      <section className="p-8 flex items-center">
        <div className="max-w-md w-full mx-auto">
          <SignedOut>
            <SignIn afterSignInUrl="/report" signUpUrl="/login" />
          </SignedOut>
          <SignedIn>
            <Navigate to="/report" replace />
          </SignedIn>
        </div>
      </section>
    </div>
  );
}

function ConnectTile({ icon, label, subtitle, onClick, active = false, disabled = false }: { icon: JSX.Element; label: string; subtitle: string; onClick?: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border shadow-sm transition text-left ${
        active ? 'bg-primary text-primaryFg border-transparent hover:opacity-95' : 'bg-surface border-border hover:bg-surfaceAlt'
      } ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      <div className="w-8 h-8 flex items-center justify-center rounded-md overflow-hidden bg-white/80">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-base">{label}</div>
        <div className="text-xs text-muted">{subtitle}</div>
      </div>
    </button>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.5 6.1 28.9 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.3 0 19-7.5 19-20 0-1.1-.1-2.2-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.5 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.5 6.1 28.9 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.3 0 10.2-1.9 13.9-5.1l-6.4-5.3C29.5 35.6 26.9 36 24 36c-5.3 0-9.8-3.4-11.4-8l-6.6 5.1C9 39.5 15.9 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.6-4.6 8-11.3 8-6.6 0-12-5.4-12-12 0-1.9.4-3.6 1.1-5.1l-6.6-5.1C4.5 16.3 4 20.1 4 24c0 11.1 8.9 20 20 20 10.3 0 19-7.5 19-20 0-1.1-.1-2.2-.4-3.5z"/>
    </svg>
  );
}

function AzureIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M3 20l8.5-16L21 20h-6l-2.6-4.7L9.8 20H3z" fill="#2D6AE3" />
    </svg>
  );
}
