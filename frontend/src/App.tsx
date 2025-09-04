import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/shell/Sidebar';
import { Topbar } from './components/shell/Topbar';
import { RightPanel } from './components/shell/RightPanel';
import { useUI } from './store/ui';
import { useEffect } from 'react';
import { Analytics } from './components/integrations/Analytics';

export default function App() {
  const rightPanelOpen = useUI(s => s.rightPanelOpen);
  const location = useLocation();
  const navigate = useNavigate();

  // Example: redirect unknown root to dashboard
  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/plan', { replace: true });
    }
  }, [location.pathname, navigate]);

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
