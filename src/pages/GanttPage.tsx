import { useMemo, useState } from 'react';
import type { GanttScale } from '../types';
import { GANTT_SCALES } from '../types';
import { db, useAppData, useSelectedProject } from '../hooks/useAppData';
import { GanttChart } from '../features/gantt/GanttChart';
import { Modal } from '../components/Modal';
import { EmptyState, PriorityBadge, ProgressBar, SectionCard, TaskStatusBadge, WarningPanel } from '../components/ui';
import { formatDateID } from '../utils/date';

const SCALE_LABEL: Record<GanttScale, string> = { hari: 'Harian', minggu: 'Mingguan', bulan: 'Bulanan' };

/** Halaman Gantt Chart interaktif. */
export function GanttPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = useMemo(() => (project ? db.tasksOf(project.id) : []), [project, data]);
  const dependencies = useMemo(() => (project ? db.dependenciesOf(project.id) : []), [project, data]);
  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  if (!project || !schedule) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat atau pilih proyek untuk menampilkan Gantt Chart." />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Gantt Chart</h1>
          <p>
            {project.name} · {tasks.length} tugas · jadwal {schedule.projectStart ? formatDateID(schedule.projectStart) : '-'} →{' '}
            {schedule.projectFinish ? formatDateID(schedule.projectFinish) : '-'}
          </p>
        </div>
        <div className="page-actions">
          <label className="inline-field">
            <span>Skala waktu</span>
            <select
              value={data.settings.ganttScale}
              onChange={(event) => db.setGanttScale(event.target.value as GanttScale)}
              aria-label="Skala waktu Gantt"
            >
              {GANTT_SCALES.map((scale) => (
                <option key={scale} value={scale}>
                  {SCALE_LABEL[scale]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <WarningPanel items={schedule.warnings.filter((warning) => warning.taskId)} />

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch bar-normal" /> Batang tugas non-kritis
        </span>
        <span className="legend-item">
          <span className="legend-swatch bar-critical" /> Tugas jalur kritis
        </span>
        <span className="legend-item">
          <span className="legend-swatch bar-progress" /> Progres pengerjaan
        </span>
        <span className="legend-item">
          <span className="legend-swatch arrow" /> Panah dependensi (biru = normal, merah = kritis)
        </span>
        <span className="legend-item text-muted">Seret batang untuk menggeser jadwal · seret tepi kanan untuk mengubah durasi</span>
      </div>

      <SectionCard>
        {tasks.length === 0 ? (
          <EmptyState
            title="Belum ada tugas"
            message="Tambahkan tugas pada halaman Tugas untuk menampilkan jadwal proyek."
          />
        ) : (
          <GanttChart
            project={project}
            tasks={tasks}
            dependencies={dependencies}
            schedule={schedule}
            members={data.members}
            scale={data.settings.ganttScale}
            onSelectTask={(taskId) => setSelectedTaskId(taskId)}
          />
        )}
      </SectionCard>

      <Modal title={selectedTask?.name ?? 'Detail Tugas'} open={!!selectedTask} onClose={() => setSelectedTaskId(null)} width={640}>
        {selectedTask && schedule ? (
          <div className="task-detail">
            <div className="detail-grid">
              <div>
                <dl>
                  <dt>Jadwal hasil analisis</dt>
                  <dd>
                    {schedule.entries[selectedTask.id]
                      ? `${formatDateID(schedule.entries[selectedTask.id].start)} → ${formatDateID(schedule.entries[selectedTask.id].end)}`
                      : '-'}
                  </dd>
                  <dt>Durasi</dt>
                  <dd>{schedule.entries[selectedTask.id]?.duration ?? selectedTask.duration} hari kerja</dd>
                  <dt>Float (slack)</dt>
                  <dd>{schedule.entries[selectedTask.id]?.totalFloat ?? '-'} hari kerja</dd>
                  <dt>Kritis</dt>
                  <dd>{schedule.entries[selectedTask.id]?.isCritical ? 'Ya' : 'Tidak'}</dd>
                </dl>
              </div>
              <div>
                <dl>
                  <dt>Status</dt>
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
                  <dt>Anggota</dt>
                  <dd>
                    {db.assignmentsOfTask(selectedTask.id)
                      .map((assignment) => data.members.find((member) => member.id === assignment.memberId)?.name ?? '')
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </dd>
                </dl>
              </div>
            </div>
            {selectedTask.description ? <p>{selectedTask.description}</p> : null}
            <p className="text-muted small">
              Untuk mengubah jadwal secara presisi, gunakan formulir Ubah Tugas pada halaman Tugas; perubahan akan
              otomatis memperbarui dependensi, jalur kritis, dan seluruh visualisasi.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
