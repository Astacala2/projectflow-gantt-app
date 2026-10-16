import { useMemo, useState } from 'react';
import { db, useAppData, useSelectedProject } from '../hooks/useAppData';
import {
  EmptyState,
  ProgressBar,
  ProjectStatusBadge,
  SectionCard,
  TaskStatusBadge,
  WarningPanel,
  formatCurrency,
} from '../components/ui';
import { downloadCSV, safeFilename } from '../utils/csv';
import { findCriticalPaths } from '../utils/criticalPath';
import { expandDependencies } from '../utils/schedule';
import { formatDateID, todayISO } from '../utils/date';

/** Halaman laporan proyek: identitas, jadwal, jalur kritis, sumber daya, konflik + ekspor CSV/cetak. */
export function ReportsPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const [section, setSection] = useState<'ringkasan' | 'tugas' | 'sumber-daya'>('ringkasan');

  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const workload = useMemo(() => (project ? db.workloadOf(project.id) : null), [project, data]);
  const tasks = useMemo(() => (project ? db.tasksOf(project.id) : []), [project, data]);
  const dependencies = useMemo(() => (project ? db.dependenciesOf(project.id) : []), [project, data]);
  const paths = useMemo(
    () => (schedule?.ok ? findCriticalPaths(schedule, expandDependencies(tasks, dependencies).edges) : null),
    [schedule, tasks, dependencies],
  );

  if (!project || !schedule) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat atau pilih proyek untuk membuat laporan." />
      </div>
    );
  }

  const today = todayISO();
  const leaves = tasks.filter((task) => !db.hasChildren(task.id));
  const lateTasks = leaves.filter((task) => {
    const entry = schedule.entries[task.id];
    return entry && task.status !== 'Selesai' && task.status !== 'Dibatalkan' && entry.end < today;
  });
  const assignments = data.assignments.filter((assignment) =>
    tasks.some((task) => task.id === assignment.taskId),
  );
  const taskName = (id: string) => tasks.find((task) => task.id === id)?.name ?? '(dihapus)';
  const memberName = (id: string) => data.members.find((member) => member.id === id)?.name ?? '(dihapus)';

  // ---- Ekspor CSV ----
  const exportTasks = () => {
    const rows: (string | number)[][] = [
      ['Nama Tugas', 'Tugas Induk', 'Mulai (analisis)', 'Selesai (analisis)', 'Durasi (hari kerja)', 'Float', 'Kritis', 'Prioritas', 'Status', 'Progres (%)', 'Anggota'],
    ];
    for (const task of tasks) {
      const entry = schedule.entries[task.id];
      rows.push([
        task.name,
        task.parentId ? taskName(task.parentId) : '',
        entry?.start ?? task.startDate,
        entry?.end ?? task.endDate,
        entry?.duration ?? task.duration,
        entry?.totalFloat ?? '',
        entry?.isCritical ? 'Ya' : 'Tidak',
        task.priority,
        task.status,
        task.progress,
        assignments
          .filter((assignment) => assignment.taskId === task.id)
          .map((assignment) => `${memberName(assignment.memberId)} (${assignment.allocation}%)`)
          .join('; '),
      ]);
    }
    downloadCSV(`projectflow-tugas-${safeFilename(project.name)}.csv`, rows);
  };

  const exportDependencies = () => {
    const rows: (string | number)[][] = [['Pendahulu', 'Penerus', 'Jenis', 'Lag (hari kerja)', 'Catatan']];
    for (const dep of dependencies) {
      rows.push([taskName(dep.predecessorId), taskName(dep.successorId), dep.type, dep.lag, dep.note]);
    }
    downloadCSV(`projectflow-dependensi-${safeFilename(project.name)}.csv`, rows);
  };

  const exportWorkload = () => {
    const rows: (string | number)[][] = [
      ['Anggota', 'Peran', 'Tugas Ditugaskan', 'Utilisasi (%)', 'Puncak Alokasi (%)', 'Hari Konflik', 'Estimasi Biaya'],
    ];
    for (const member of data.members) {
      const memberWorkload = workload?.byMember[member.id];
      rows.push([
        member.name,
        member.role,
        memberWorkload?.assignedTaskIds.length ?? 0,
        memberWorkload?.utilization ?? 0,
        memberWorkload?.peakAllocation ?? 0,
        memberWorkload?.overloadedDates.length ?? 0,
        data.settings.costCalculationEnabled ? memberWorkload?.estimatedCost ?? 0 : '',
      ]);
    }
    downloadCSV(`projectflow-beban-kerja-${safeFilename(project.name)}.csv`, rows);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Laporan Proyek</h1>
          <p>
            {project.name} · dibuat {formatDateID(project.startDate)} · target {formatDateID(project.targetEndDate)}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={exportTasks}>
            Ekspor CSV Tugas
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportDependencies}>
            Ekspor CSV Dependensi
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportWorkload}>
            Ekspor CSV Beban Kerja
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Cetak Laporan
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(['ringkasan', 'tugas', 'sumber-daya'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={`tab ${section === key ? 'active' : ''}`}
            onClick={() => setSection(key)}
          >
            {key === 'ringkasan' ? 'Ringkasan & Jalur Kritis' : key === 'tugas' ? 'Daftar Tugas' : 'Sumber Daya & Beban Kerja'}
          </button>
        ))}
      </div>

      {!schedule.ok ? <WarningPanel items={schedule.warnings} title="Data proyek belum valid" /> : null}

      {section === 'ringkasan' ? (
        <>
          <SectionCard title="Identitas proyek" className="print-section">
            <div className="detail-grid">
              <div>
                <dl>
                  <dt>Nama proyek</dt>
                  <dd>{project.name}</dd>
                  <dt>Organisasi / klien</dt>
                  <dd>{project.organization}</dd>
                  <dt>Manajer proyek</dt>
                  <dd>{project.manager}</dd>
                  <dt>Status</dt>
                  <dd>
                    <ProjectStatusBadge status={project.status} />
                  </dd>
                </dl>
              </div>
              <div>
                <dl>
                  <dt>Tanggal mulai</dt>
                  <dd>{formatDateID(project.startDate)}</dd>
                  <dt>Target selesai</dt>
                  <dd>{formatDateID(project.targetEndDate)}</dd>
                  <dt>Jadwal hasil analisis</dt>
                  <dd>
                    {schedule.projectStart && schedule.projectFinish
                      ? `${formatDateID(schedule.projectStart)} → ${formatDateID(schedule.projectFinish)} (${schedule.duration} hari kerja)`
                      : 'Belum ada tugas terjadwal'}
                  </dd>
                  <dt>Progres proyek</dt>
                  <dd>
                    <ProgressBar value={project.progress} />
                    <small className="text-muted">
                      Metode: rata-rata terbobot progres tugas daun terhadap durasi hari kerjanya.
                    </small>
                  </dd>
                </dl>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Jalur kritis" subtitle="Urutan tugas yang menentukan durasi minimum proyek.">
            {paths && paths.paths.length > 0 ? (
              paths.paths.map((path, index) => (
                <div key={`${path.join('-')}-${index}`} className="path-item">
                  <div className="path-head">Jalur {index + 1} · {paths.durations[index]} hari kerja</div>
                  <div className="path-steps">
                    {path.map((taskId, stepIndex) => (
                      <span key={taskId} className="path-step">
                        {stepIndex > 0 ? <span className="path-arrow">→</span> : null}
                        <span className="chip-critical">
                          {stepIndex + 1}. {taskName(taskId)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted">Belum ada jalur kritis (tambahkan dependensi untuk membentuk jaringan kerja).</p>
            )}
          </SectionCard>

          <SectionCard title="Konflik jadwal & beban kerja" className="print-section">
            {workload && (workload.conflicts.length > 0 || schedule.warnings.some((w) => w.taskId)) ? (
              <ul className="summary-list">
                {schedule.warnings
                  .filter((warning) => warning.taskId)
                  .map((warning, index) => (
                    <li key={`sched-${index}`}>
                      <span>{warning.message}</span>
                      <span className="badge badge-warning">Jadwal</span>
                    </li>
                  ))}
                {(workload?.conflicts ?? []).map((conflict, index) => (
                  <li key={`wl-${index}`}>
                    <span>{conflict.message}</span>
                    <span className={`badge ${conflict.type === 'OVERLOAD' ? 'badge-danger' : 'badge-warning'}`}>{conflict.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Tidak ditemukan konflik jadwal maupun beban kerja.</p>
            )}
          </SectionCard>
        </>
      ) : null}

      {section === 'tugas' ? (
        <>
          <SectionCard title="Daftar tugas dan statusnya" className="print-section">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tugas</th>
                    <th>Jadwal</th>
                    <th>Durasi</th>
                    <th>Float</th>
                    <th>Kritis</th>
                    <th>Status</th>
                    <th>Progres</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const entry = schedule.entries[task.id];
                    return (
                      <tr key={task.id} className={entry?.isCritical && !task.parentId ? 'row-critical' : ''}>
                        <td style={{ paddingLeft: 12 + (task.parentId ? 18 : 0) }}>{task.name}</td>
                        <td>
                          {entry ? `${formatDateID(entry.start)} → ${formatDateID(entry.end)}` : '-'}
                        </td>
                        <td>{entry?.duration ?? task.duration} hr</td>
                        <td>{entry?.totalFloat ?? '-'} hr</td>
                        <td>{entry?.isCritical ? '★' : ''}</td>
                        <td>
                          <TaskStatusBadge status={task.status} />
                        </td>
                        <td>
                          <ProgressBar value={task.progress} small />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Daftar tugas terlambat" className="print-section">
            {lateTasks.length === 0 ? (
              <p className="text-muted">Tidak ada tugas terlambat saat ini.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tugas</th>
                      <th>Jadwal selesai</th>
                      <th>Keterlambatan</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateTasks.map((task) => {
                      const entry = schedule.entries[task.id];
                      return (
                        <tr key={task.id}>
                          <td>{task.name}</td>
                          <td>{entry ? formatDateID(entry.end) : '-'}</td>
                          <td>{entry ? Math.abs(new Date(entry.end).getTime() - new Date(today).getTime()) / 86400000 : 0} hari</td>
                          <td>
                            <TaskStatusBadge status={task.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {section === 'sumber-daya' ? (
        <>
          <SectionCard title="Anggota tim dan penugasannya" className="print-section">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Anggota</th>
                    <th>Peran</th>
                    <th>Penugasan</th>
                    <th>Utilisasi</th>
                    {data.settings.costCalculationEnabled ? <th>Estimasi biaya</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((member) => {
                    const memberWorkload = workload?.byMember[member.id];
                    const memberAssignments = assignments.filter((assignment) => assignment.memberId === member.id);
                    return (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.role}</td>
                        <td>
                          {memberAssignments.length === 0 ? (
                            <span className="text-muted">Belum ada penugasan</span>
                          ) : (
                            <ul className="inline-list">
                              {memberAssignments.map((assignment) => (
                                <li key={assignment.id}>
                                  {taskName(assignment.taskId)} ({assignment.allocation}%)
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>{memberWorkload?.utilization ?? 0}%</td>
                        {data.settings.costCalculationEnabled ? (
                          <td>{formatCurrency(memberWorkload?.estimatedCost ?? 0)}</td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Ringkasan beban kerja" className="print-section">
            <ul className="summary-list">
              {data.members.map((member) => {
                const memberWorkload = workload?.byMember[member.id];
                return (
                  <li key={member.id}>
                    <span>
                      {member.name} — puncak alokasi {memberWorkload?.peakAllocation ?? 0}%,{' '}
                      {memberWorkload?.overloadedDates.length ?? 0} hari konflik,{' '}
                      {memberWorkload?.absenceDates.length ?? 0} hari ketidakhadiran
                    </span>
                    <span className={`badge ${memberWorkload && memberWorkload.peakAllocation > 100 ? 'badge-danger' : 'badge-success'}`}>
                      {memberWorkload && memberWorkload.peakAllocation > 100 ? 'Kelebihan beban' : 'Normal'}
                    </span>
                  </li>
                );
              })}
              {workload && workload.unassignedMemberIds.length > 0 ? (
                <li>
                  <span>
                    Anggota tanpa penugasan:{' '}
                    {workload.unassignedMemberIds.map((id) => memberName(id)).join(', ')}
                  </span>
                  <span className="badge badge-warning">Perlu penugasan</span>
                </li>
              ) : null}
            </ul>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
