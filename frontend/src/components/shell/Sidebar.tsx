import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { counts.refresh().catch(()=>{}); counts.startAutoRefresh(); }, []);
  const width = expanded ? 'w-[220px]' : 'w-[64px]';
  const search = new URLSearchParams(location.search);
  const triageFilter = location.pathname === '/alerts-list' ? (search.get('f') || 'all') : 'all';
  const triageCount = triageFilter === 'me' ? counts.triageAssignedToMe : triageFilter === 'unassigned' ? counts.triageUnassigned : counts.triageTotal;
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
                    counts.approvalsPending > 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primaryFg">{counts.approvalsPending}</span> : <span />
                  ) : item.to === '/cases' ? (
                    counts.casesOpen > 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primaryFg">{counts.casesOpen}</span> : <span />
                  ) : item.to === '/alerts-list' ? (
                    triageCount > 0 ? <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primaryFg">{triageCount}</span> : <span />
                  ) : null
                )}
              </NavLink>
              {expanded && item.to === '/alerts-list' && (
                <div className="ml-8 mt-1 mb-2 flex items-center gap-2 text-xs">
                  <button
                    aria-pressed={triageFilter==='all'}
                    className={`px-2 py-0.5 rounded-md border ${triageFilter==='all' ? 'bg-primary text-primaryFg border-transparent' : 'border-border hover:bg-surfaceAlt'}`}
                    onClick={() => navigate('/alerts-list?f=all')}
                  >All</button>
                  <button
                    aria-pressed={triageFilter==='me'}
                    className={`px-2 py-0.5 rounded-md border ${triageFilter==='me' ? 'bg-primary text-primaryFg border-transparent' : 'border-border hover:bg-surfaceAlt'}`}
                    onClick={() => navigate('/alerts-list?f=me')}
                  >Mine</button>
                  <button
                    aria-pressed={triageFilter==='unassigned'}
                    className={`px-2 py-0.5 rounded-md border ${triageFilter==='unassigned' ? 'bg-primary text-primaryFg border-transparent' : 'border-border hover:bg-surfaceAlt'}`}
                    onClick={() => navigate('/alerts-list?f=unassigned')}
                  >Unassigned</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
