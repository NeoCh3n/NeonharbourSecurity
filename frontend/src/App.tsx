import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/shell/Sidebar';
import { Topbar } from './components/shell/Topbar';
import { RightPanel } from './components/shell/RightPanel';
import { useUI } from './store/ui';
import { useEffect } from 'react';
import { Analytics } from './components/integrations/Analytics';
import { useAuth } from './store/auth';

export default function App() {
  const rightPanelOpen = useUI(s => s.rightPanelOpen);
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh, token, me, loading } = useAuth();

  // Redirect root to dashboard (global overview)
  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Load current user on app mount (keeps header/user info in sync)
  useEffect(() => { void refresh(); }, [refresh]);

  // Global auth guard: redirect unauthenticated users to /login for protected routes
  useEffect(() => {
    const publicPaths = new Set(['/login', '/ingest']);
    if (publicPaths.has(location.pathname)) return;
    if (!token) {
      navigate('/login');
      return;
    }
    if (!loading && !me) {
      navigate('/login');
    }
  }, [location.pathname, token, me, loading, navigate]);

  return (
    <div className="desktop-frame min-h-full grid" style={{ gridTemplateRows: '56px 1fr' }}>
      <Analytics />
      <Topbar />
      <div className="grid" style={{ gridTemplateColumns: rightPanelOpen ? 'auto 1fr 320px' : 'auto 1fr' }}>
        <Sidebar />
        <main className="bg-surface text-text min-h-[calc(100vh-56px)] p-4 overflow-auto">
          <Outlet />
        </main>
        {rightPanelOpen && <RightPanel />}
      </div>
    </div>
  );
}
