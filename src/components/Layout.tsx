import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Icon } from './Sidebar';
import { useAppData } from '../hooks/useAppData';
import { selectProject } from '../services/db';
import { useToast } from './ToastProvider';

/** Kerangka aplikasi: sidebar + area konten + pemilih proyek global. */
export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useAppData();
  const { push } = useToast();

  const selectedId = data.settings.selectedProjectId ?? data.projects[0]?.id ?? '';

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="btn-icon topbar-menu"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Buka menu navigasi"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-title">Sistem Manajemen Proyek Pengembangan Website &amp; Aplikasi</div>
          <label className="topbar-project">
            <span>Proyek aktif:</span>
            <select
              value={selectedId}
              onChange={(event) => {
                const result = selectProject(event.target.value || null);
                if (!result.ok) push(result.error, 'error');
              }}
              aria-label="Pilih proyek yang sedang dikerjakan"
            >
              {data.projects.length === 0 ? <option value="">(belum ada proyek)</option> : null}
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
