import { useTheme } from '../../store/theme';
import { useUI } from '../../store/ui';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

export function Topbar() {
  const { theme, setTheme } = useTheme();
  const toggleNav = useUI(s => s.toggleNav);
  const navigate = useNavigate();

  return (
    <header className="h-topbar bg-surfaceAlt border-b border-border flex items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <button aria-label="Toggle navigation" className="focus-ring p-2 rounded-md hover:bg-surface" onClick={toggleNav}>
          <span className="text-muted">☰</span>
        </button>
        <div className="font-semibold text-text">NeonHarbour Security</div>
        {/* Removed module nav to keep alert-centric workflow; use sidebar/workspace instead */}
      </div>
      <div className="flex items-center gap-2">
        <input aria-label="Global search" placeholder="/ Search" className="focus-ring px-3 py-1.5 rounded-md bg-surface border border-border text-text w-[360px]" />
        <select aria-label="Theme switcher" className="focus-ring px-2 py-1.5 rounded-md border border-border bg-surface text-text" value={theme} onChange={e => setTheme(e.target.value as any)}>
          <option value="theme-light">Light</option>
          <option value="theme-dark">Dark</option>
          <option value="theme-hc">High Contrast</option>
        </select>
        <SignedIn>
          <button
            aria-label="Open settings"
            title="Settings"
            className="focus-ring px-2 py-1.5 rounded-md border border-border hover:bg-surfaceAlt"
            onClick={() => navigate('/admin')}
          >
            ⚙️
          </button>
        </SignedIn>
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}
