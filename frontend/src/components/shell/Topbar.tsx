import { useTheme } from '../../store/theme';
import { useUI } from '../../store/ui';
import { NavLink } from 'react-router-dom';

export function Topbar() {
  const { theme, setTheme } = useTheme();
  const toggleNav = useUI(s => s.toggleNav);

  return (
    <header className="h-topbar bg-surfaceAlt border-b border-border flex items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <button aria-label="Toggle navigation" className="focus-ring p-2 rounded-md hover:bg-surface" onClick={toggleNav}>
          <span className="text-muted">☰</span>
        </button>
        <div className="font-semibold text-text">NeonHarbour Security</div>
        <nav className="ml-2 hidden md:flex items-center gap-1 text-sm">
          <NavLink to="/plan" className={({isActive})=>`px-2 py-1.5 rounded-md border border-transparent hover:border-border ${isActive? 'bg-surface text-text border-border' : 'text-muted'}`}>Plan</NavLink>
          <NavLink to="/investigate" className={({isActive})=>`px-2 py-1.5 rounded-md border border-transparent hover:border-border ${isActive? 'bg-surface text-text border-border' : 'text-muted'}`}>Investigate</NavLink>
          <NavLink to="/respond" className={({isActive})=>`px-2 py-1.5 rounded-md border border-transparent hover:border-border ${isActive? 'bg-surface text-text border-border' : 'text-muted'}`}>Respond</NavLink>
          <NavLink to="/adapt" className={({isActive})=>`px-2 py-1.5 rounded-md border border-transparent hover:border-border ${isActive? 'bg-surface text-text border-border' : 'text-muted'}`}>Adapt</NavLink>
          <NavLink to="/report" className={({isActive})=>`px-2 py-1.5 rounded-md border border-transparent hover:border-border ${isActive? 'bg-surface text-text border-border' : 'text-muted'}`}>Report</NavLink>
          <NavLink to="/hunt" className={({isActive})=>`px-2 py-1.5 rounded-md border border-transparent hover:border-border ${isActive? 'bg-surface text-text border-border' : 'text-muted'}`}>Hunt</NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <input aria-label="Global search" placeholder="/ 搜索" className="focus-ring px-3 py-1.5 rounded-md bg-surface border border-border text-text w-[360px]" />
        <select aria-label="Theme switcher" className="focus-ring px-2 py-1.5 rounded-md border border-border bg-surface text-text" value={theme} onChange={e => setTheme(e.target.value as any)}>
          <option value="theme-light">Light</option>
          <option value="theme-dark">Dark</option>
          <option value="theme-hc">High Contrast</option>
        </select>
      </div>
    </header>
  );
}
