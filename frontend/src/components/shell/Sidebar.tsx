import { NavLink } from 'react-router-dom';
import { useUI } from '../../store/ui';
import { useEffect } from 'react';
import { useNavCounts } from '../../store/navCounts';

type NavItem = { to: string; icon: string; label: string; title?: string };

const NAV: NavItem[] = [
  { to: '/report', icon: '📊', label: 'Dashboard', title: 'KPI & trends' },
  { to: '/alerts-list', icon: '🚨', label: 'Triage', title: 'Triage queue' },
  { to: '/cases', icon: '🗂️', label: 'Cases', title: 'All cases' },
  { to: '/hunt', icon: '🧭', label: 'Hunt', title: 'Threat hunting' },
  { to: '/approvals', icon: '✅', label: 'Approvals', title: 'Action approvals' },
  { to: '/ingest', icon: '🔌', label: 'Sources', title: 'Data sources' },
  { to: '/policies', icon: '🛡️', label: 'Policies', title: 'Automation policies' },
  { to: '/admin', icon: '⚙️', label: 'Admin', title: 'Settings' },
];

export function Sidebar() {
  const expanded = useUI(s => s.navExpanded);
  const counts = useNavCounts();
  useEffect(() => { counts.refresh().catch(()=>{}); counts.startAutoRefresh(); }, []);
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
                className={({ isActive }) => `flex items-center justify-between gap-3 px-2 py-2 rounded-md hover:bg-surfaceAlt ${isActive ? 'bg-surfaceAlt' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden className="text-base leading-none">{item.icon}</span>
                  {expanded && <span className="text-sm">{item.label}</span>}
                </div>
                {expanded && (
                  item.to === '/approvals' ? (
                    counts.approvalsPending > 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e293b] border border-border">{counts.approvalsPending}</span> : <span />
                  ) : item.to === '/cases' ? (
                    counts.casesOpen > 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e293b] border border-border">{counts.casesOpen}</span> : <span />
                  ) : item.to === '/alerts-list' ? (
                    counts.triageTotal > 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e293b] border border-border">{counts.triageTotal}</span> : <span />
                  ) : null
                )}
              </NavLink>
              {expanded && item.to === '/alerts-list' && (
                <div className="ml-8 mt-1 mb-2 flex items-center gap-2 text-xs">
                  <NavLink to="/alerts-list?f=all" className={({ isActive }) => `px-2 py-0.5 rounded-md border ${isActive ? 'btn-gradient border-border' : 'border-border'}`}>All</NavLink>
                  <NavLink to="/alerts-list?f=me" className={({ isActive }) => `px-2 py-0.5 rounded-md border ${isActive ? 'btn-gradient border-border' : 'border-border'}`}>Mine</NavLink>
                  <NavLink to="/alerts-list?f=unassigned" className={({ isActive }) => `px-2 py-0.5 rounded-md border ${isActive ? 'btn-gradient border-border' : 'border-border'}`}>Unassigned</NavLink>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
