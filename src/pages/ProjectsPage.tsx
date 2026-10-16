import { useMemo, useState } from 'react';
import type { Project, ProjectStatus } from '../types';
import { DEFAULT_WORKING_DAYS, PROJECT_STATUSES } from '../types';
import { db, useAction, useAppData } from '../hooks/useAppData';
import { Modal, ConfirmDialog } from '../components/Modal';
import { EmptyState, Field, ProjectStatusBadge, ProgressBar, SectionCard, formatNumber } from '../components/ui';
import { Icon } from '../components/Sidebar';
import { WEEKDAY_LABELS } from '../utils/calendar';
import { formatDateID } from '../utils/date';
import type { FieldErrors } from '../utils/validation';

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
}

/** Formulir tambah/ubah proyek beserta konfigurasi kalender kerjanya. */
function ProjectFormModal({ open, onClose, project }: ProjectFormModalProps) {
  const runAction = useAction();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [manager, setManager] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Perencanaan');
  const [workingDays, setWorkingDays] = useState<number[]>([...DEFAULT_WORKING_DAYS]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loaded, setLoaded] = useState(false);

  if (open && !loaded) {
    setLoaded(true);
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setOrganization(project?.organization ?? '');
    setManager(project?.manager ?? '');
    setStartDate(project?.startDate ?? new Date().toISOString().slice(0, 10));
    setTargetEndDate(project?.targetEndDate ?? '');
    setStatus(project?.status ?? 'Perencanaan');
    setWorkingDays(project?.workingDays ?? [...DEFAULT_WORKING_DAYS]);
    setErrors({});
  }
  if (!open && loaded) setLoaded(false);

  const toggleDay = (day: number) => {
    setWorkingDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b),
    );
  };

  const submit = () => {
    const payload = { name, description, organization, manager, startDate, targetEndDate, status, workingDays };
    const result = runAction(
      () => (project ? db.updateProject(project.id, payload) : db.createProject(payload)),
      project ? 'Proyek berhasil diperbarui.' : 'Proyek berhasil dibuat.',
    );
    if (!result.ok) {
      setErrors({ general: result.error });
      return;
    }
    onClose();
  };

  return (
    <Modal
      title={project ? 'Ubah Proyek' : 'Buat Proyek Baru'}
      open={open}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            Simpan
          </button>
        </>
      }
    >
      {errors.general ? <div className="alert alert-error">{errors.general}</div> : null}
      <div className="form-grid">
        <Field label="Nama proyek" htmlFor="proj-name" error={errors.name} required>
          <input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Pengembangan Website Profil Organisasi" />
        </Field>
        <Field label="Organisasi / klien" htmlFor="proj-org" error={errors.organization} required>
          <input id="proj-org" value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </Field>
        <Field label="Manajer proyek" htmlFor="proj-manager" error={errors.manager} required>
          <input id="proj-manager" value={manager} onChange={(e) => setManager(e.target.value)} />
        </Field>
        <Field label="Status proyek" htmlFor="proj-status">
          <select id="proj-status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tanggal mulai" htmlFor="proj-start" error={errors.startDate} required>
          <input id="proj-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Target tanggal selesai" htmlFor="proj-end" error={errors.targetEndDate} required>
          <input id="proj-end" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
        </Field>
        <Field
          label="Kalender kerja (hari kerja dalam seminggu)"
          htmlFor="proj-cal"
          error={errors.workingDays}
          hint="Hari yang tidak dicentang dianggap akhir pekan dan tidak dihitung sebagai hari kerja."
        >
          <div className="weekday-picker" id="proj-cal">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <label key={day} className={`weekday-chip ${workingDays.includes(day) ? 'is-active' : ''}`}>
                <input type="checkbox" checked={workingDays.includes(day)} onChange={() => toggleDay(day)} />
                {WEEKDAY_LABELS[day]}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Deskripsi" htmlFor="proj-desc">
          <textarea id="proj-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

interface DetailModalProps {
  project: Project | null;
  onClose: () => void;
}

/** Ringkasan proyek: jadwal hasil analisis, jumlah tugas, dan konflik. */
function ProjectDetailModal({ project, onClose }: DetailModalProps) {
  const data = useAppData();
  if (!project) return null;
  const tasks = data.tasks.filter((task) => task.projectId === project.id);
  const schedule = db.scheduleOf(project.id);
  const workload = db.workloadOf(project.id);
  const leaves = tasks.filter((task) => !db.hasChildren(task.id));
  const lateTasks = leaves.filter((task) => {
    const entry = schedule.entries[task.id];
    return entry && task.status !== 'Selesai' && task.status !== 'Dibatalkan' && entry.end < new Date().toISOString().slice(0, 10);
  });

  return (
    <Modal title={project.name} open={!!project} onClose={onClose} width={760}>
      <div className="detail-grid">
        <div>
          <h4>Identitas proyek</h4>
          <dl>
            <dt>Organisasi / klien</dt>
            <dd>{project.organization}</dd>
            <dt>Manajer proyek</dt>
            <dd>{project.manager}</dd>
            <dt>Status</dt>
            <dd>
              <ProjectStatusBadge status={project.status} />
            </dd>
            <dt>Rencana</dt>
            <dd>
              {formatDateID(project.startDate)} → {formatDateID(project.targetEndDate)}
            </dd>
            <dt>Proyek berjalan</dt>
            <dd>
              {schedule.projectStart && schedule.projectFinish
                ? `${formatDateID(schedule.projectStart)} → ${formatDateID(schedule.projectFinish)} (${schedule.duration} hari kerja)`
                : 'Belum ada tugas terjadwal'}
            </dd>
          </dl>
        </div>
        <div>
          <h4>Ringkasan</h4>
          <ul className="summary-list">
            <li>
              <span>Total tugas</span>
              <strong>{tasks.length}</strong>
            </li>
            <li>
              <span>Tugas selesai</span>
              <strong>{leaves.filter((task) => task.status === 'Selesai').length}</strong>
            </li>
            <li>
              <span>Tugas kritis</span>
              <strong>{schedule.criticalIds.length}</strong>
            </li>
            <li>
              <span>Tugas terlambat</span>
              <strong className={lateTasks.length > 0 ? 'text-danger' : ''}>{lateTasks.length}</strong>
            </li>
            <li>
              <span>Konflik beban kerja</span>
              <strong className={workload.conflicts.length > 0 ? 'text-danger' : ''}>{workload.conflicts.length}</strong>
            </li>
            <li>
              <span>Anggota tim</span>
              <strong>{data.members.length}</strong>
            </li>
          </ul>
          <h4>Progres proyek (berbobot durasi tugas daun)</h4>
          <ProgressBar value={project.progress} />
          <p className="text-muted small">
            Hari libur terdaftar: {data.holidays.filter((holiday) => holiday.projectId === project.id).length} hari ·
            Hari kerja: {project.workingDays.map((day) => WEEKDAY_LABELS[day]).join(', ')}
          </p>
        </div>
      </div>
      <p className="text-muted small">Diperbarui: {new Date(project.updatedAt).toLocaleString('id-ID')}</p>
    </Modal>
  );
}

/** Halaman manajemen proyek (CRUD + ringkasan). */
export function ProjectsPage() {
  const data = useAppData();
  const runAction = useAction();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [detail, setDetail] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [keyword, setKeyword] = useState('');

  const projects = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return data.projects;
    return data.projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.organization.toLowerCase().includes(query) ||
        project.manager.toLowerCase().includes(query),
    );
  }, [data.projects, keyword]);

  const confirmDelete = () => {
    if (!deleting) return;
    const result = runAction(() => db.deleteProject(deleting.id), 'Proyek beserta tugas dan dependensinya dihapus.');
    if (result.ok) setDeleting(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Proyek</h1>
          <p>Kelola proyek pengembangan website &amp; aplikasi beserta kalender kerjanya.</p>
        </div>
        <div className="page-actions">
          <input
            className="search-input"
            placeholder="Cari proyek, klien, manajer..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            aria-label="Cari proyek"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Icon name="plus" /> Proyek Baru
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={data.projects.length === 0 ? 'Belum ada proyek' : 'Tidak ada hasil pencarian'}
          message={
            data.projects.length === 0
              ? 'Buat proyek pertama Anda untuk mulai merencanakan tugas, jadwal, dan sumber daya.'
              : `Tidak ditemukan proyek yang cocok dengan "${keyword}".`
          }
          action={
            data.projects.length === 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Buat Proyek
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="project-grid">
          {projects.map((project) => {
            const schedule = db.scheduleOf(project.id);
            const taskCount = data.tasks.filter((task) => task.projectId === project.id).length;
            return (
              <article key={project.id} className="card project-card">
                <div className="card-body">
                  <div className="project-card-head">
                    <h3>{project.name}</h3>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <p className="text-muted">{project.organization}</p>
                  <dl className="project-meta">
                    <div>
                      <dt>Manajer</dt>
                      <dd>{project.manager}</dd>
                    </div>
                    <div>
                      <dt>Periode</dt>
                      <dd>
                        {formatDateID(project.startDate)} → {formatDateID(project.targetEndDate)}
                      </dd>
                    </div>
                    <div>
                      <dt>Jadwal terhitung</dt>
                      <dd>
                        {schedule.projectStart && schedule.projectFinish
                          ? `${formatDateID(schedule.projectStart)} → ${formatDateID(schedule.projectFinish)}`
                          : 'Belum ada tugas'}
                      </dd>
                    </div>
                    <div>
                      <dt>Jumlah tugas</dt>
                      <dd>{formatNumber(taskCount)} tugas · {schedule.criticalIds.length} kritis</dd>
                    </div>
                  </dl>
                  <ProgressBar value={project.progress} />
                  <div className="project-card-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setDetail(project)}>
                      Lihat Detail
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditing(project);
                        setFormOpen(true);
                      }}
                    >
                      Ubah
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => setDeleting(project)}>
                      Hapus
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SectionCard title="Semua proyek" subtitle="Tabel ringkas untuk perbandingan cepat antar proyek.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Proyek</th>
                <th>Klien</th>
                <th>Periode</th>
                <th>Status</th>
                <th style={{ width: 180 }}>Progres</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.organization}</td>
                  <td>
                    {formatDateID(project.startDate)} → {formatDateID(project.targetEndDate)}
                  </td>
                  <td>
                    <ProjectStatusBadge status={project.status} />
                  </td>
                  <td>
                    <ProgressBar value={project.progress} small />
                  </td>
                </tr>
              ))}
              {data.projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Belum ada data proyek.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <ProjectFormModal open={formOpen} onClose={() => setFormOpen(false)} project={editing} />
      <ProjectDetailModal project={detail} onClose={() => setDetail(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Hapus proyek?"
        message={`Proyek "${deleting?.name}" beserta seluruh tugas, dependensi, penugasan, dan hari liburnya akan dihapus permanen.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
