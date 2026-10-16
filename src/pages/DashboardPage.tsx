import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db, useAppData } from '../hooks/useAppData';
import { ProgressBar, ProjectStatusBadge, SectionCard } from '../components/ui';
import { compareISO, diffDays, formatDateID, todayISO } from '../utils/date';
import type { Task } from '../types';
import type { ScheduleEntry } from '../utils/schedule';

const STATUS_COLORS: Record<string, string> = {
  'Belum Dimulai': '#94a3b8',
  Berjalan: '#2563eb',
  Terhambat: '#f59e0b',
  Selesai: '#16a34a',
  Dibatalkan: '#dc2626',
};

interface Stat {
  label: string;
  value: number | string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

/** Halaman dashboard: ringkasan proyek, tugas, jadwal terdekat, dan beban kerja. */
export function DashboardPage() {
  const data = useAppData();
  const [selectedId, setSelectedId] = useState<string>(data.settings.selectedProjectId ?? data.projects[0]?.id ?? '');

  const projectId = data.projects.some((project) => project.id === selectedId)
    ? selectedId
    : data.projects[0]?.id ?? '';
  const project = data.projects.find((item) => item.id === projectId) ?? null;

  const tasks = useMemo(
    () => (projectId ? data.tasks.filter((task) => task.projectId === projectId) : []),
    [data.tasks, projectId],
  );
  const schedule = useMemo(() => (projectId ? db.scheduleOf(projectId) : null), [projectId, data]);
  const workload = useMemo(() => (projectId ? db.workloadOf(projectId) : null), [projectId, data]);
  const today = todayISO();

  const leaves = tasks.filter((task) => !task.parentId);
  const isLate = (taskId: string, status: string) => {
    if (status === 'Selesai' || status === 'Dibatalkan') return false;
    const entry = schedule?.entries[taskId];
    return entry ? compareISO(entry.end, today) < 0 : false;
  };

  const lateTasks = leaves.filter((task) => isLate(task.id, task.status));
  const criticalIds = new Set(schedule?.criticalIds ?? []);
  const upcoming: { task: Task; entry: ScheduleEntry }[] = leaves
    .filter((task) => task.status !== 'Selesai' && task.status !== 'Dibatalkan')
    .map((task) => ({ task, entry: schedule?.entries[task.id] }))
    .filter((pair): pair is { task: Task; entry: ScheduleEntry } => !!pair.entry)
    .sort((a, b) => compareISO(a.entry.start, b.entry.start))
    .slice(0, 6);

  const stats: Stat[] = [
    { label: 'Total proyek', value: data.projects.length },
    { label: 'Proyek berjalan', value: data.projects.filter((p) => p.status === 'Berjalan').length, tone: 'info' },
    { label: 'Proyek selesai', value: data.projects.filter((p) => p.status === 'Selesai').length, tone: 'success' },
    { label: 'Proyek ditunda', value: data.projects.filter((p) => p.status === 'Ditunda').length, tone: 'warning' },
    { label: 'Total tugas (proyek aktif)', value: tasks.length },
    { label: 'Belum dimulai', value: leaves.filter((t) => t.status === 'Belum Dimulai').length },
    { label: 'Sedang berjalan', value: leaves.filter((t) => t.status === 'Berjalan').length, tone: 'info' },
    { label: 'Tugas selesai', value: leaves.filter((t) => t.status === 'Selesai').length, tone: 'success' },
    { label: 'Tugas terlambat', value: lateTasks.length, tone: lateTasks.length > 0 ? 'danger' : undefined },
    { label: 'Tugas kritis', value: leaves.filter((t) => criticalIds.has(t.id)).length, tone: 'danger' },
    {
      label: 'Jadwal terdekat',
      value: upcoming[0]?.entry ? formatDateID(upcoming[0].entry.start) : '—',
    },
    {
      label: 'Progres keseluruhan proyek',
      value: `${project?.progress ?? 0}%`,
    },
  ];

  const statusDistribution = ['Belum Dimulai', 'Berjalan', 'Terhambat', 'Selesai', 'Dibatalkan'].map((status) => ({
    name: status,
    value: leaves.filter((task) => task.status === status).length,
    color: STATUS_COLORS[status],
  })).filter((item) => item.value > 0);

  const projectProgressData = data.projects.map((item) => ({
    name: item.name.length > 22 ? `${item.name.slice(0, 22)}…` : item.name,
    progres: item.progress,
  }));

  if (data.projects.length === 0) {
    return (
      <div className="page">
        <h1>Dashboard</h1>
        <SectionCard>
          <div className="empty-state">
            <div className="empty-icon">◇</div>
            <h3>Selamat datang di ProjectFlow</h3>
            <p>
              Belum ada data proyek. Buka halaman <Link to="/proyek">Proyek</Link> untuk membuat proyek pertama Anda,
              atau pulihkan data contoh pada halaman <Link to="/pengaturan">Pengaturan</Link>.
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Ringkasan seluruh aktivitas manajemen proyek berdasarkan data aktual aplikasi.</p>
        </div>
        <div className="page-actions">
          <label className="inline-field">
            <span>Proyek</span>
            <select value={projectId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Pilih proyek dashboard">
              {data.projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.tone ? `tone-${stat.tone}` : ''}`}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <SectionCard title="Progres proyek" subtitle="Dihitung berbobot durasi tugas daun.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={projectProgressData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`${value}%`, 'Progres']} />
              <Bar dataKey="progres" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Distribusi status tugas" subtitle={`Proyek aktif: ${project?.name ?? '-'}`}>
          {statusDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusDistribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2}>
                  {statusDistribution.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} tugas`, name]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted">Belum ada tugas untuk ditampilkan.</p>
          )}
        </SectionCard>

        <SectionCard title="Proyek terbaru" subtitle="Urut terakhir diperbarui.">
          <ul className="activity-list">
            {data.projects
              .slice()
              .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
              .slice(0, 5)
              .map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small className="text-muted">
                      {item.organization} · {formatDateID(item.startDate)} → {formatDateID(item.targetEndDate)}
                    </small>
                  </div>
                  <div className="activity-right">
                    <ProjectStatusBadge status={item.status} />
                    <ProgressBar value={item.progress} small />
                  </div>
                </li>
              ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Tugas mendekati tenggat"
          subtitle="Urut sesuai jadwal mulai; tugas terlambat ditandai merah."
        >
          <ul className="activity-list">
            {upcoming.map(({ task, entry }) => {
              const late = isLate(task.id, task.status);
              const daysLeft = entry ? diffDays(today, entry.end) : 0;
              return (
                <li key={task.id} className={late ? 'is-late' : ''}>
                  <div>
                    <strong>{task.name}</strong>
                    <small className="text-muted">
                      {formatDateID(entry.start)} → {formatDateID(entry.end)} · {entry.duration} hari kerja
                    </small>
                  </div>
                  <div className="activity-right">
                    {criticalIds.has(task.id) ? <span className="badge badge-danger">Kritis</span> : null}
                    <span className={`badge ${late ? 'badge-danger' : daysLeft <= 3 ? 'badge-warning' : 'badge-neutral'}`}>
                      {late ? `Terlambat ${Math.abs(daysLeft)} hari` : `${daysLeft} hari lagi`}
                    </span>
                  </div>
                </li>
              );
            })}
            {upcoming.length === 0 ? <li className="text-muted">Tidak ada tugas mendekati tenggat.</li> : null}
          </ul>
        </SectionCard>
      </div>

      {workload && workload.conflicts.length > 0 ? (
        <SectionCard title="Peringatan beban kerja" subtitle="Konflik alokasi dan penugasan pada proyek aktif.">
          <ul className="summary-list">
            {workload.conflicts.slice(0, 8).map((conflict, index) => (
              <li key={`${conflict.type}-${index}`}>
                <span>{conflict.message}</span>
                <span className={`badge ${conflict.type === 'OVERLOAD' ? 'badge-danger' : 'badge-warning'}`}>{conflict.type}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted small">
            Lihat detail lengkap pada halaman <Link to="/resource-chart">Resource Chart</Link>.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
