import { NavLink } from 'react-router-dom';
import { useUI } from '../../store/ui';

type NavItem = { to: string; icon: string; label: string; title?: string };

const NAV: NavItem[] = [
  { to: '/alerts-list', icon: '🚨', label: 'Triage', title: 'Triage queue' },
  { to: '/cases', icon: '🗂️', label: 'Cases', title: 'All cases' },
  { to: '/hunt', icon: '🧭', label: 'Hunt', title: 'Threat hunting' },
  { to: '/approvals', icon: '✅', label: 'Approvals', title: 'Action approvals' },
  { to: '/report', icon: '📊', label: 'Dashboard', title: 'KPI & trends' },
  { to: '/ingest', icon: '🔌', label: 'Sources', title: 'Data sources' },
  { to: '/policies', icon: '🛡️', label: 'Policies', title: 'Automation policies' },
  { to: '/admin', icon: '⚙️', label: 'Admin', title: 'Settings' },
];

export function Sidebar() {
  const expanded = useUI(s => s.navExpanded);
  const width = expanded ? 'w-[220px]' : 'w-[64px]';
  return (
    <aside className={`${width} bg-surface border-r border-border min-h-[calc(100vh-56px)] transition-all duration-200`} aria-label="Primary navigation">
      <nav className="p-2">
        <ul className="space-y-1">
          {NAV.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                title={item.title || item.label}
                className={({ isActive }) => `flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surfaceAlt ${isActive ? 'bg-surfaceAlt' : ''}`}
              >
                <span aria-hidden className="text-base leading-none">{item.icon}</span>
                {expanded && <span className="text-sm">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
