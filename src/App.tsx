import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { CalendarPage } from './pages/CalendarPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { GanttPage } from './pages/GanttPage';
import { PertPage } from './pages/PertPage';
import { CriticalPathPage } from './pages/CriticalPathPage';
import { ResourceChartPage } from './pages/ResourceChartPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

/** Komponen akar: routing + penyedia notifikasi global. */
export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/proyek" element={<ProjectsPage />} />
            <Route path="/tugas" element={<TasksPage />} />
            <Route path="/kalender" element={<CalendarPage />} />
            <Route path="/sumber-daya" element={<ResourcesPage />} />
            <Route path="/gantt" element={<GanttPage />} />
            <Route path="/pert" element={<PertPage />} />
            <Route path="/jalur-kritis" element={<CriticalPathPage />} />
            <Route path="/resource-chart" element={<ResourceChartPage />} />
            <Route path="/laporan" element={<ReportsPage />} />
            <Route path="/pengaturan" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
