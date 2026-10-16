import { NavLink } from 'react-router-dom';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/proyek', label: 'Proyek', icon: 'project' },
  { to: '/tugas', label: 'Tugas', icon: 'task' },
  { to: '/kalender', label: 'Kalender', icon: 'calendar' },
  { to: '/sumber-daya', label: 'Sumber Daya', icon: 'people' },
  { to: '/gantt', label: 'Gantt Chart', icon: 'gantt' },
  { to: '/pert', label: 'PERT Chart', icon: 'network' },
  { to: '/jalur-kritis', label: 'Jalur Kritis', icon: 'critical' },
  { to: '/resource-chart', label: 'Resource Chart', icon: 'resource' },
  { to: '/laporan', label: 'Laporan', icon: 'report' },
  { to: '/pengaturan', label: 'Pengaturan', icon: 'settings' },
];

export type IconName =
  | 'dashboard'
  | 'project'
  | 'task'
  | 'calendar'
  | 'people'
  | 'gantt'
  | 'network'
  | 'critical'
  | 'resource'
  | 'report'
  | 'settings'
  | 'menu'
  | 'plus'
  | 'search';

const PATHS: Record<IconName, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  project: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  task: 'M9 5h9M9 12h9M9 19h9M4 5l1.2 1.2L7.5 4M4 12l1.2 1.2L7.5 11M4 19l1.2 1.2L7.5 18',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9h16M8 3v4M16 3v4',
  people: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8',
  gantt: 'M4 5h9M4 10h14M4 15h6M4 20h11M4 3v18',
  network:
    'M4 4h6v4H4zM14 4h6v4h-6zM9 16h6v4H9zM7 8v3a1 1 0 0 0 1 1h4M17 8v3a1 1 0 0 1-1 1h-4v4',
  critical: 'M12 3l9 16H3zM12 9v5M12 17h.01',
  resource: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  report: 'M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6M9 13h6M9 17h6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
};

interface IconProps {
  name: IconName;
  size?: number;
}

/** Ikon SVG garis ringkas untuk navigasi dan tombol. */
export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/** Navigasi utama (sidebar desktop, drawer pada perangkat seluler). */
export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      <div className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">PF</span>
          <div>
            <strong>ProjectFlow</strong>
            <small>Manajemen Proyek IT</small>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>ProjectFlow v1.0</span>
          <span>Penyimpanan: localStorage</span>
        </div>
      </div>
      {open ? <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" /> : null}
    </>
  );
}
