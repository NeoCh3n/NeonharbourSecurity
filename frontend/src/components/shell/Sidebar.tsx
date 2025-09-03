import { NavLink } from 'react-router-dom';
import { useUI } from '../../store/ui';

export function Sidebar() {
  const expanded = useUI(s => s.navExpanded);
  const width = expanded ? 'w-[280px]' : 'w-[72px]';
  return (
    <aside className={`${width} bg-surface border-r border-border min-h-[calc(100vh-56px)] transition-all duration-200`}
      aria-label="Primary navigation">
      <nav className="p-3">
        <ul className="space-y-1">
          <li>
            <NavLink to="/report" className={({ isActive }) => `flex items-center gap-2 px-2 py-2 rounded-md hover:bg-surfaceAlt ${isActive ? 'bg-surfaceAlt' : ''}`}>
              <span>📊</span>
              {expanded && <span>Report</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/hunt" className={({ isActive }) => `flex items-center gap-2 px-2 py-2 rounded-md hover:bg-surfaceAlt ${isActive ? 'bg-surfaceAlt' : ''}`}>
              <span>🧭</span>
              {expanded && <span>Hunt</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/ingest" className={({ isActive }) => `flex items-center gap-2 px-2 py-2 rounded-md hover:bg-surfaceAlt ${isActive ? 'bg-surfaceAlt' : ''}`}>
              <span>🔌</span>
              {expanded && <span>数据源</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/alerts-list" className={({ isActive }) => `flex items-center gap-2 px-2 py-2 rounded-md hover:bg-surfaceAlt ${isActive ? 'bg-surfaceAlt' : ''}`}>
              <span>📄</span>
              {expanded && <span>告警列表</span>}
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
