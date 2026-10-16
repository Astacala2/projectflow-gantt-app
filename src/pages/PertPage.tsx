import { useMemo, useState } from 'react';
import { db, useAppData, useSelectedProject } from '../hooks/useAppData';
import { PertChart } from '../features/pert/PertChart';
import { Modal } from '../components/Modal';
import { EmptyState, PriorityBadge, ProgressBar, SectionCard, TaskStatusBadge, WarningPanel } from '../components/ui';
import { formatDateID } from '../utils/date';

/** Halaman PERT Chart (Network Diagram) berbasis data dependensi aktual. */
export function PertPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const [zoom, setZoom] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = useMemo(() => (project ? db.tasksOf(project.id) : []), [project, data]);
  const dependencies = useMemo(() => (project ? db.dependenciesOf(project.id) : []), [project, data]);
  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  if (!project || !schedule) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat atau pilih proyek untuk menampilkan PERT Chart." />
      </div>
    );
  }

  if (!schedule.ok) {
    return (
      <div className="page">
        <h1>PERT Chart</h1>
        <WarningPanel items={schedule.warnings} title="Diagram tidak dapat digambar" />
        <SectionCard>
          <p>
            Terdapat siklus dependensi pada proyek <strong>{project.name}</strong>. Selesaikan siklus tersebut pada
            halaman <em>Tugas → Ketergantungan Tugas</em> agar jaringan dapat dihitung dan digambar.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>PERT Chart / Network Diagram</h1>
          <p>
            {project.name} · {schedule.leafIds.length} node tugas · {dependencies.length} hubungan dependensi
          </p>
        </div>
        <div className="page-actions">
          <label className="inline-field">
            <span>Perbesar</span>
            <input
              type="range"
              min={50}
              max={160}
              step={10}
              value={Math.round(zoom * 100)}
              onChange={(event) => setZoom(Number(event.target.value) / 100)}
              aria-label="Zoom diagram"
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => setZoom(1)}>
            Reset zoom
          </button>
        </div>
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch node" /> Node tugas (nama, durasi, progres, status, tanggal)
        </span>
        <span className="legend-item">
          <span className="legend-swatch arrow-critical" /> Panah jalur kritis (FS/SS + lag)
        </span>
        <span className="legend-item text-muted">Klik node untuk melihat detail tugas</span>
      </div>

      <SectionCard>
        {schedule.leafIds.length === 0 ? (
          <EmptyState title="Belum ada tugas" message="Tambahkan tugas untuk membangun jaringan proyek." />
        ) : (
          <PertChart
            tasks={tasks}
            dependencies={dependencies}
            schedule={schedule}
            zoom={zoom}
            onSelectTask={(taskId) => setSelectedTaskId(taskId)}
            selectedTaskId={selectedTaskId}
          />
        )}
      </SectionCard>

      <Modal title={selectedTask?.name ?? 'Detail Node'} open={!!selectedTask} onClose={() => setSelectedTaskId(null)} width={620}>
        {selectedTask ? (
          <div className="task-detail">
            <div className="detail-grid">
              <div>
                <dl>
                  <dt>Durasi</dt>
                  <dd>{schedule.entries[selectedTask.id]?.duration ?? selectedTask.duration} hari kerja</dd>
                  <dt>Tanggal mulai</dt>
                  <dd>{schedule.entries[selectedTask.id] ? formatDateID(schedule.entries[selectedTask.id].start) : '-'}</dd>
                  <dt>Tanggal selesai</dt>
                  <dd>{schedule.entries[selectedTask.id] ? formatDateID(schedule.entries[selectedTask.id].end) : '-'}</dd>
                  <dt>Status jaringan</dt>
                  <dd>{schedule.entries[selectedTask.id]?.isCritical ? '★ Jalur kritis' : `Non-kritis (float ${schedule.entries[selectedTask.id]?.totalFloat ?? 0} hari)`}</dd>
                </dl>
              </div>
              <div>
                <dl>
                  <dt>Status tugas</dt>
                  <dd>
                    <TaskStatusBadge status={selectedTask.status} />
                  </dd>
                  <dt>Prioritas</dt>
                  <dd>
                    <PriorityBadge priority={selectedTask.priority} />
                  </dd>
                  <dt>Progres</dt>
                  <dd>
                    <ProgressBar value={selectedTask.progress} />
                  </dd>
                </dl>
              </div>
            </div>
            <h4>Hubungan dependensi</h4>
            <ul className="summary-list">
              {dependencies
                .filter((dep) => dep.predecessorId === selectedTask.id || dep.successorId === selectedTask.id)
                .map((dep) => (
                  <li key={dep.id}>
                    <span>
                      {tasks.find((task) => task.id === dep.predecessorId)?.name} → {tasks.find((task) => task.id === dep.successorId)?.name}
                    </span>
                    <span className="badge badge-info">
                      {dep.type}
                      {dep.lag ? ` +${dep.lag}` : ''}
                    </span>
                  </li>
                ))}
              {dependencies.filter((dep) => dep.predecessorId === selectedTask.id || dep.successorId === selectedTask.id).length === 0 ? (
                <li className="text-muted">Tidak ada hubungan dependensi.</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
