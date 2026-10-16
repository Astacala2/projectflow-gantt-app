import { useMemo, useState } from 'react';
import type { Dependency, Task, TaskPriority, TaskStatus } from '../types';
import { TASK_PRIORITIES, TASK_STATUSES } from '../types';
import { db, useAction, useAppData } from '../hooks/useAppData';
import { useSelectedProject } from '../hooks/useAppData';
import { ConfirmDialog, Modal } from '../components/Modal';
import {
  DependencyTypeBadge,
  EmptyState,
  PriorityBadge,
  ProgressBar,
  SectionCard,
  TaskStatusBadge,
  WarningPanel,
} from '../components/ui';
import { TaskFormModal } from '../components/TaskFormModal';
import { DependencyFormModal } from '../components/DependencyFormModal';
import { AssignmentFormModal } from '../components/AssignmentFormModal';
import { flattenTaskTree } from '../utils/taskTree';
import { formatDateID } from '../utils/date';

type TabKey = 'tugas' | 'dependensi';

/** Halaman manajemen tugas, subtugas, dan ketergantungan tugas. */
export function TasksPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const runAction = useAction();

  const [tab, setTab] = useState<TabKey>('tugas');
  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [filterMember, setFilterMember] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [assignmentTask, setAssignmentTask] = useState<Task | null>(null);

  const [depFormOpen, setDepFormOpen] = useState(false);
  const [editingDep, setEditingDep] = useState<Dependency | null>(null);
  const [deletingDep, setDeletingDep] = useState<Dependency | null>(null);

  const tasks = useMemo(
    () => (project ? db.tasksOf(project.id) : []),
    [project, data],
  );
  const dependencies = useMemo(
    () => (project ? db.dependenciesOf(project.id) : []),
    [project, data],
  );
  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const memberName = (memberId: string) => data.members.find((member) => member.id === memberId)?.name ?? '(dihapus)';

  const filteredTasks = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return tasks.filter((task) => {
      if (query && !task.name.toLowerCase().includes(query) && !task.description.toLowerCase().includes(query)) return false;
      if (filterStatus && task.status !== filterStatus) return false;
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterMember) {
        const assigned = data.assignments.some(
          (assignment) => assignment.taskId === task.id && assignment.memberId === filterMember,
        );
        if (!assigned) return false;
      }
      return true;
    });
  }, [tasks, keyword, filterStatus, filterPriority, filterMember, data.assignments]);

  const rows = useMemo(() => flattenTaskTree(filteredTasks, collapsed), [filteredTasks, collapsed]);

  const toggleCollapse = (taskId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  if (!project) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat proyek terlebih dahulu pada halaman Proyek untuk mengelola tugas." />
      </div>
    );
  }

  const scheduleWarnings = (schedule?.warnings ?? []).filter((warning) => warning.taskId);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tugas &amp; Subtugas</h1>
          <p>
            Proyek <strong>{project.name}</strong> · {tasks.length} tugas ·{' '}
            {dependencies.length} dependensi
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setEditingDep(null);
              setDepFormOpen(true);
            }}
          >
            + Dependensi
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingTask(null);
              setDefaultParentId(null);
              setTaskFormOpen(true);
            }}
          >
            + Tugas Baru
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tugas'}
          className={`tab ${tab === 'tugas' ? 'active' : ''}`}
          onClick={() => setTab('tugas')}
        >
          Tugas &amp; Subtugas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'dependensi'}
          className={`tab ${tab === 'dependensi' ? 'active' : ''}`}
          onClick={() => setTab('dependensi')}
        >
          Ketergantungan Tugas ({dependencies.length})
        </button>
      </div>

      {tab === 'tugas' ? (
        <SectionCard
          title="Struktur tugas"
          subtitle="Durasi dalam hari kerja; tanggal mengikuti kalender kerja proyek dan aturan dependensi."
          actions={
            <div className="toolbar">
              <input
                className="search-input"
                placeholder="Cari tugas..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                aria-label="Cari tugas"
              />
              <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as TaskStatus | '')} aria-label="Filter status">
                <option value="">Semua status</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select value={filterPriority} onChange={(event) => setFilterPriority(event.target.value as TaskPriority | '')} aria-label="Filter prioritas">
                <option value="">Semua prioritas</option>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <select value={filterMember} onChange={(event) => setFilterMember(event.target.value)} aria-label="Filter anggota">
                <option value="">Semua anggota</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCollapsed(new Set(rows.filter((row) => row.hasChildren).map((row) => row.task.id)))}
              >
                Lipat semua
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCollapsed(new Set())}>
                Buka semua
              </button>
            </div>
          }
        >
          <WarningPanel items={scheduleWarnings} />
          <div className="table-wrap">
            <table className="table table-tasks">
              <thead>
                <tr>
                  <th>Nama tugas</th>
                  <th>Jadwal (hasil analisis)</th>
                  <th>Durasi</th>
                  <th>Prioritas</th>
                  <th>Status</th>
                  <th style={{ width: 140 }}>Progres</th>
                  <th>Anggota</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const entry = schedule?.entries[row.task.id];
                  const assigned = data.assignments
                    .filter((assignment) => assignment.taskId === row.task.id)
                    .map((assignment) => memberName(assignment.memberId));
                  return (
                    <tr key={row.task.id} className={entry?.isCritical ? 'row-critical' : ''}>
                      <td style={{ paddingLeft: 10 + row.depth * 18 }}>
                        {row.hasChildren ? (
                          <button type="button" className="gantt-toggle" onClick={() => toggleCollapse(row.task.id)}>
                            {row.isCollapsed ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="gantt-toggle-placeholder">·</span>
                        )}
                        <span className={`task-name ${row.task.parentId ? 'is-subtask' : ''}`}>{row.task.name}</span>
                        {entry?.isCritical ? <span className="badge badge-danger" title="Tugas jalur kritis (float 0)">Kritis</span> : null}
                      </td>
                      <td>
                        {entry ? (
                          <>
                            {formatDateID(entry.start)} → {formatDateID(entry.end)}
                            <br />
                            <small className="text-muted">
                              Float: {entry.totalFloat} hari
                              {entry.hasSuccessors ? '' : ' · akhir rantai'}
                            </small>
                          </>
                        ) : (
                          formatDateID(row.task.startDate)
                        )}
                      </td>
                      <td>{entry ? entry.duration : row.task.duration} hr</td>
                      <td>
                        <PriorityBadge priority={row.task.priority} />
                      </td>
                      <td>
                        <TaskStatusBadge status={row.task.status} />
                      </td>
                      <td>
                        <ProgressBar value={row.task.progress} small />
                      </td>
                      <td>
                        {assigned.length > 0 ? assigned.join(', ') : <span className="text-muted">—</span>}
                      </td>
                      <td className="table-actions">
                        <button type="button" className="btn-icon" title="Lihat detail" onClick={() => setDetailTask(row.task)}>
                          👁
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Tambah subtugas"
                          onClick={() => {
                            setEditingTask(null);
                            setDefaultParentId(row.task.id);
                            setTaskFormOpen(true);
                          }}
                        >
                          ＋
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Tugaskan anggota"
                          onClick={() => setAssignmentTask(row.task)}
                        >
                          👥
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Ubah"
                          onClick={() => {
                            setEditingTask(row.task);
                            setDefaultParentId(null);
                            setTaskFormOpen(true);
                          }}
                        >
                          ✎
                        </button>
                        <button type="button" className="btn-icon" title="Hapus" onClick={() => setDeletingTask(row.task)}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        title={tasks.length === 0 ? 'Belum ada tugas' : 'Tidak ada hasil filter'}
                        message={
                          tasks.length === 0
                            ? 'Tambahkan tugas induk lalu buat subtugasnya, misalnya: Analisis Kebutuhan → Wawancara Pengguna.'
                            : 'Ubah kata kunci atau filter untuk melihat tugas lain.'
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="Ketergantungan tugas (FS &amp; SS)"
          subtitle="FS: penerus mulai setelah pendahulu selesai. SS: penerus mulai setelah pendahulu mulai. Lag dalam hari kerja."
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pendahulu</th>
                  <th></th>
                  <th>Penerus</th>
                  <th>Jenis</th>
                  <th>Lag</th>
                  <th>Catatan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {dependencies.map((dep) => (
                  <tr key={dep.id}>
                    <td>{taskById.get(dep.predecessorId)?.name ?? '(tugas dihapus)'}</td>
                    <td>→</td>
                    <td>{taskById.get(dep.successorId)?.name ?? '(tugas dihapus)'}</td>
                    <td>
                      <DependencyTypeBadge type={dep.type} lag={dep.lag} />
                    </td>
                    <td>{dep.lag} hr</td>
                    <td className="text-muted">{dep.note || '—'}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        title="Ubah"
                        onClick={() => {
                          setEditingDep(dep);
                          setDepFormOpen(true);
                        }}
                      >
                        ✎
                      </button>
                      <button type="button" className="btn-icon" title="Hapus" onClick={() => setDeletingDep(dep)}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
                {dependencies.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        title="Belum ada dependensi"
                        message="Hubungkan tugas yang saling bergantung agar penjadwalan dan jalur kritis dapat dihitung."
                        action={
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              setEditingDep(null);
                              setDepFormOpen(true);
                            }}
                          >
                            Tambah Dependensi
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Detail tugas */}
      <Modal title={detailTask?.name ?? 'Detail Tugas'} open={!!detailTask} onClose={() => setDetailTask(null)} width={720}>
        {detailTask && schedule ? (
          <TaskDetailContent task={detailTask} />
        ) : null}
      </Modal>

      <TaskFormModal
        open={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
        project={project}
        tasks={tasks}
        task={editingTask}
        defaultParentId={defaultParentId}
      />
      <DependencyFormModal
        open={depFormOpen}
        onClose={() => setDepFormOpen(false)}
        project={project}
        tasks={tasks}
        dependencies={dependencies}
        dependency={editingDep}
      />
      <AssignmentFormModal
        open={!!assignmentTask}
        onClose={() => setAssignmentTask(null)}
        task={assignmentTask}
        members={data.members}
      />
      <ConfirmDialog
        open={!!deletingTask}
        title="Hapus tugas?"
        message={`Tugas "${deletingTask?.name}" beserta subtugas, penugasan, dan dependensi yang menunjuk kepadanya akan dihapus.`}
        onConfirm={() => {
          if (!deletingTask) return;
          const result = runAction(() => db.deleteTask(deletingTask.id), 'Tugas dihapus.');
          if (result.ok) setDeletingTask(null);
        }}
        onCancel={() => setDeletingTask(null)}
      />
      <ConfirmDialog
        open={!!deletingDep}
        title="Hapus dependensi?"
        message="Hubungan antar tugas ini akan dihapus dan jadwal akan dihitung ulang tanpa batasan tersebut."
        onConfirm={() => {
          if (!deletingDep) return;
          const result = runAction(() => db.deleteDependency(deletingDep.id), 'Dependensi dihapus.');
          if (result.ok) setDeletingDep(null);
        }}
        onCancel={() => setDeletingDep(null)}
      />
    </div>
  );
}

/** Isi dialog detail tugas: jadwal, dependensi, penugasan, catatan. */
function TaskDetailContent({ task }: { task: Task }) {
  const data = useAppData();
  const schedule = db.scheduleOf(task.projectId);
  const entry = schedule.entries[task.id];
  const dependencies = db.dependenciesOf(task.projectId).filter(
    (dep) => dep.predecessorId === task.id || dep.successorId === task.id,
  );
  const assignments = db.assignmentsOfTask(task.id);
  const taskName = (id: string) => data.tasks.find((item) => item.id === id)?.name ?? '(dihapus)';
  const warnings = schedule.warnings.filter((warning) => warning.taskId === task.id);

  return (
    <div className="task-detail">
      <WarningPanel items={warnings} />
      <div className="detail-grid">
        <div>
          <h4>Jadwal</h4>
          <dl>
            <dt>Tanggal mulai (rencana pengguna)</dt>
            <dd>{formatDateID(task.startDate)}</dd>
            <dt>Tanggal mulai hasil analisis</dt>
            <dd>{entry ? formatDateID(entry.start) : '-'}</dd>
            <dt>Tanggal selesai hasil analisis</dt>
            <dd>{entry ? formatDateID(entry.end) : '-'}</dd>
            <dt>Durasi</dt>
            <dd>{entry ? entry.duration : task.duration} hari kerja</dd>
            <dt>Float (slack)</dt>
            <dd>{entry ? `${entry.totalFloat} hari kerja` : '-'}</dd>
            <dt>Kritis</dt>
            <dd>{entry?.isCritical ? 'Ya — masuk jalur kritis' : 'Tidak'}</dd>
          </dl>
        </div>
        <div>
          <h4>Informasi</h4>
          <dl>
            <dt>Prioritas</dt>
            <dd>{task.priority}</dd>
            <dt>Status</dt>
            <dd>{task.status}</dd>
            <dt>Progres</dt>
            <dd>
              <ProgressBar value={task.progress} />
            </dd>
            <dt>Tugas induk</dt>
            <dd>{task.parentId ? taskName(task.parentId) : '— (tingkat atas)'}</dd>
          </dl>
        </div>
      </div>

      <h4>Deskripsi</h4>
      <p>{task.description || <span className="text-muted">Tidak ada deskripsi.</span>}</p>
      <h4>Catatan</h4>
      <p>{task.notes || <span className="text-muted">Tidak ada catatan.</span>}</p>

      <h4>Dependensi terkait</h4>
      {dependencies.length === 0 ? (
        <p className="text-muted">Tidak ada dependensi.</p>
      ) : (
        <ul className="summary-list">
          {dependencies.map((dep) => (
            <li key={dep.id}>
              <span>
                {taskName(dep.predecessorId)} → {taskName(dep.successorId)}
              </span>
              <DependencyTypeBadge type={dep.type} lag={dep.lag} />
            </li>
          ))}
        </ul>
      )}

      <h4>Anggota yang ditugaskan</h4>
      {assignments.length === 0 ? (
        <p className="text-muted">Belum ada anggota yang ditugaskan.</p>
      ) : (
        <ul className="summary-list">
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              <span>
                {data.members.find((member) => member.id === assignment.memberId)?.name ?? '(dihapus)'} — {assignment.role}
              </span>
              <strong>{assignment.allocation}%</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
