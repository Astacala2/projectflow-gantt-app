import { useMemo, useState } from 'react';
import type { ISODate } from '../types';
import { db, useAppData, useSelectedProject } from '../hooks/useAppData';
import { ResourceTimeline } from '../features/resource-chart/ResourceTimeline';
import { Modal } from '../components/Modal';
import { EmptyState, ProgressBar, SectionCard, TaskStatusBadge, WarningPanel, formatCurrency } from '../components/ui';
import { formatDateID } from '../utils/date';

/** Halaman Resource Chart: visualisasi beban kerja anggota tim. */
export function ResourceChartPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const [memberFilter, setMemberFilter] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = useMemo(() => (project ? db.tasksOf(project.id) : []), [project, data]);
  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const defaultFrom = schedule?.projectStart ?? project?.startDate ?? '';
  const defaultTo = schedule?.projectFinish ?? project?.targetEndDate ?? '';
  const [from, setFrom] = useState<ISODate>(defaultFrom);
  const [to, setTo] = useState<ISODate>(defaultTo);
  const [rangeProjectId, setRangeProjectId] = useState(project?.id ?? '');

  // Saat proyek berganti, rentang tanggal ikut menyesuaikan (render-phase update).
  if (project && project.id !== rangeProjectId) {
    setRangeProjectId(project.id);
    setFrom(defaultFrom);
    setTo(defaultTo);
  }

  const workload = useMemo(
    () => (project ? db.workloadOf(project.id, from || undefined, to || undefined) : null),
    [project, data, from, to],
  );

  if (!project || !schedule) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat atau pilih proyek untuk menampilkan Resource Chart." />
      </div>
    );
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const visibleMembers = memberFilter
    ? data.members.filter((member) => member.id === memberFilter)
    : data.members;
  const unassigned = workload?.unassignedMemberIds ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Resource Chart</h1>
          <p>
            {project.name} · beban kerja dihitung dari alokasi penugasan aktual, bukan jumlah tugas.
          </p>
        </div>
        <div className="page-actions">
          <label className="inline-field">
            <span>Dari</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="inline-field">
            <span>Sampai</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="inline-field">
            <span>Anggota</span>
            <select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} aria-label="Filter anggota">
              <option value="">Semua anggota</option>
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFrom(schedule.projectStart ?? defaultFrom);
              setTo(schedule.projectFinish ?? defaultTo);
            }}
          >
            Reset rentang
          </button>
        </div>
      </div>

      <WarningPanel
        title="Konflik beban kerja & penugasan"
        items={(workload?.conflicts ?? []).map((conflict) => ({ code: conflict.type, message: conflict.message }))}
      />

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch block" /> Penugasan (label: tugas · alokasi)
        </span>
        <span className="legend-item">
          <span className="legend-swatch absence" /> Ketidakhadiran anggota
        </span>
        <span className="legend-item">
          <span className="legend-swatch overload" /> Hari dengan alokasi &gt; 100% (konflik)
        </span>
        <span className="legend-item text-muted">Klik blok untuk melihat detail tugas</span>
      </div>

      <SectionCard title="Grafik beban kerja anggota" subtitle="Baris = anggota tim, sumbu horizontal = tanggal.">
        {visibleMembers.length === 0 || !workload ? (
          <EmptyState title="Belum ada anggota tim" message="Tambahkan anggota pada halaman Sumber Daya untuk menampilkan grafik beban kerja." />
        ) : (
          <ResourceTimeline
            projectId={project.id}
            members={visibleMembers}
            tasks={tasks}
            workload={workload}
            from={from}
            to={to}
            onSelectTask={(taskId) => setSelectedTaskId(taskId)}
          />
        )}
      </SectionCard>

      <SectionCard title="Ringkasan utilisasi" subtitle="Utilisasi = rata-rata alokasi pada hari kerja dalam rentang terpilih.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Peran</th>
                <th>Tugas ditugaskan</th>
                <th style={{ width: 160 }}>Utilisasi</th>
                <th>Puncak alokasi</th>
                <th>Hari konflik</th>
                <th>Hari kosong</th>
                {data.settings.costCalculationEnabled ? <th>Estimasi biaya</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => {
                const memberWorkload = workload?.byMember[member.id];
                return (
                  <tr key={member.id}>
                    <td>
                      {member.name}
                      {!member.active ? <span className="badge badge-neutral">Nonaktif</span> : null}
                    </td>
                    <td>{member.role}</td>
                    <td>{memberWorkload?.assignedTaskIds.length ?? 0} tugas</td>
                    <td>
                      <ProgressBar value={Math.min(100, memberWorkload?.utilization ?? 0)} small />
                    </td>
                    <td>
                      <span className={`badge ${memberWorkload && memberWorkload.peakAllocation > 100 ? 'badge-danger' : 'badge-neutral'}`}>
                        {memberWorkload?.peakAllocation ?? 0}%
                      </span>
                    </td>
                    <td>{memberWorkload?.overloadedDates.length ?? 0} hari</td>
                    <td>{memberWorkload?.idleDates.length ?? 0} hari</td>
                    {data.settings.costCalculationEnabled ? (
                      <td>{formatCurrency(memberWorkload?.estimatedCost ?? 0)}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {unassigned.length > 0 ? (
          <p className="text-muted small">
            Anggota tanpa penugasan: {unassigned.map((id) => data.members.find((member) => member.id === id)?.name).join(', ')}.
          </p>
        ) : null}
      </SectionCard>

      <Modal title={selectedTask?.name ?? 'Detail Tugas'} open={!!selectedTask} onClose={() => setSelectedTaskId(null)} width={620}>
        {selectedTask ? (
          <div className="task-detail">
            <div className="detail-grid">
              <div>
                <dl>
                  <dt>Status</dt>
                  <dd>
                    <TaskStatusBadge status={selectedTask.status} />
                  </dd>
                  <dt>Progres</dt>
                  <dd>
                    <ProgressBar value={selectedTask.progress} />
                  </dd>
                </dl>
              </div>
              <div>
                <dl>
                  <dt>Penugasan</dt>
                  <dd>
                    {db.assignmentsOfTask(selectedTask.id)
                      .map(
                        (assignment) =>
                          `${data.members.find((member) => member.id === assignment.memberId)?.name ?? '-'} (${assignment.allocation}%)`,
                      )
                      .join(', ') || '—'}
                  </dd>
                  <dt>Periode tugas</dt>
                  <dd>
                    {formatDateID(selectedTask.startDate)} → {formatDateID(selectedTask.endDate)}
                  </dd>
                </dl>
              </div>
            </div>
            {selectedTask.description ? <p>{selectedTask.description}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
