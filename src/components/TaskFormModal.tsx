import { useEffect, useState } from 'react';
import type { Project, Task, TaskPriority, TaskStatus } from '../types';
import { TASK_PRIORITIES, TASK_STATUSES } from '../types';
import { Modal } from './Modal';
import { Field } from './ui';
import { db, useAction } from '../hooks/useAppData';
import type { FieldErrors } from '../utils/validation';

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  /** Seluruh tugas proyek (untuk memilih tugas induk). */
  tasks: Task[];
  /** Tugas yang diedit; null/undefined berarti membuat baru. */
  task?: Task | null;
  /** Nilai awal tugas induk saat membuat baru. */
  defaultParentId?: string | null;
  onSaved?: (task: Task) => void;
}

/**
 * Formulir tambah/ubah tugas & subtugas.
 * Durasi dihitung dalam hari kerja; tanggal selesai otomatis dari kalender kerja proyek.
 */
export function TaskFormModal({ open, onClose, project, tasks, task, defaultParentId, onSaved }: TaskFormModalProps) {
  const runAction = useAction();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [startDate, setStartDate] = useState(project.startDate);
  const [duration, setDuration] = useState(1);
  const [priority, setPriority] = useState<TaskPriority>('Sedang');
  const [status, setStatus] = useState<TaskStatus>('Belum Dimulai');
  const [progress, setProgress] = useState(0);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (task) {
      setName(task.name);
      setParentId(task.parentId ?? '');
      setStartDate(task.startDate);
      setDuration(task.duration);
      setPriority(task.priority);
      setStatus(task.status);
      setProgress(task.progress);
      setDescription(task.description);
      setNotes(task.notes);
    } else {
      setName('');
      setParentId(defaultParentId ?? '');
      setStartDate(project.startDate);
      setDuration(1);
      setPriority('Sedang');
      setStatus('Belum Dimulai');
      setProgress(0);
      setDescription('');
      setNotes('');
    }
  }, [open, task, defaultParentId, project.startDate]);

  const submit = () => {
    const payload = {
      name,
      projectId: project.id,
      startDate,
      duration: Number(duration),
      priority,
      status,
      progress: Number(progress),
      parentId: parentId || null,
      description,
      notes,
    };
    // Tugas yang menjadi induk dari dirinya sendiri tidak valid.
    if (task && parentId === task.id) {
      setErrors({ parentId: 'Tugas tidak boleh menjadi sub-tugas dari dirinya sendiri.' });
      return;
    }
    // Cegah memilih keturunan tugas sendiri sebagai induk.
    if (task && parentId) {
      let cursor: Task | undefined = tasks.find((item) => item.id === parentId);
      while (cursor) {
        if (cursor.id === task.id) {
          setErrors({ parentId: 'Pilihan induk akan membuat siklus hierarki tugas.' });
          return;
        }
        cursor = cursor.parentId ? tasks.find((item) => item.id === cursor?.parentId) : undefined;
      }
    }
    const result = runAction(
      () => (task ? db.updateTask(task.id, payload) : db.createTask(payload)),
      task ? 'Tugas berhasil diperbarui.' : 'Tugas berhasil ditambahkan.',
    );
    if (!result.ok) {
      setErrors({ general: result.error });
      return;
    }
    if (result.value) onSaved?.(result.value);
    onClose();
  };

  // Daftar tugas yang boleh dipilih sebagai induk (harus tugas lain dalam proyek sama).
  const parentOptions = tasks.filter((item) => item.id !== task?.id);

  return (
    <Modal
      title={task ? 'Ubah Tugas' : 'Tambah Tugas'}
      open={open}
      onClose={onClose}
      width={680}
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
        <Field label="Nama tugas" htmlFor="task-name" error={errors.name} required>
          <input id="task-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Implementasi Frontend" />
        </Field>
        <Field label="Tugas induk (opsional)" htmlFor="task-parent" error={errors.parentId} hint="Kosongkan untuk tugas tingkat atas; pilih induk untuk membuat sub-tugas.">
          <select id="task-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Tugas tingkat atas —</option>
            {parentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tanggal mulai" htmlFor="task-start" error={errors.startDate} required>
          <input id="task-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field
          label="Durasi (hari kerja)"
          htmlFor="task-duration"
          error={errors.duration}
          hint="Akhir pekan & hari libur proyek tidak dihitung."
          required
        >
          <input
            id="task-duration"
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </Field>
        <Field label="Prioritas" htmlFor="task-priority">
          <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {TASK_PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="task-status">
          <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {TASK_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Progres (${progress}%)`} htmlFor="task-progress" error={errors.progress}>
          <input
            id="task-progress"
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </Field>
        <Field label="Deskripsi" htmlFor="task-description">
          <textarea id="task-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Catatan" htmlFor="task-notes">
          <textarea id="task-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
