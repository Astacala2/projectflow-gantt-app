import { useEffect, useMemo, useState } from 'react';
import type { Dependency, DependencyType, Project, Task } from '../types';
import { DEPENDENCY_TYPES } from '../types';
import { Modal } from './Modal';
import { Field } from './ui';
import { db, useAction } from '../hooks/useAppData';
import type { FieldErrors } from '../utils/validation';

interface DependencyFormModalProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  tasks: Task[];
  /** Daftar dependensi proyek (untuk kebutuhan halaman pemanggil). */
  dependencies?: Dependency[];
  dependency?: Dependency | null;
  defaultSuccessorId?: string;
  onSaved?: () => void;
}

const TYPE_HELP: Record<DependencyType, string> = {
  FS: 'Finish-to-Start: penerus baru boleh mulai setelah pendahulu SELESAI (+ lag).',
  SS: 'Start-to-Start: penerus boleh mulai setelah pendahulu MULAI (+ lag).',
};

/** Formulir tambah/ubah dependensi antar tugas (FS & SS dengan lag hari kerja). */
export function DependencyFormModal({
  open,
  onClose,
  project,
  tasks,
  dependency,
  defaultSuccessorId,
  onSaved,
}: DependencyFormModalProps) {
  const runAction = useAction();
  const [predecessorId, setPredecessorId] = useState('');
  const [successorId, setSuccessorId] = useState('');
  const [type, setType] = useState<DependencyType>('FS');
  const [lag, setLag] = useState(0);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === project.id),
    [tasks, project.id],
  );

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPredecessorId(dependency?.predecessorId ?? '');
    setSuccessorId(dependency?.successorId ?? defaultSuccessorId ?? '');
    setType(dependency?.type ?? 'FS');
    setLag(dependency?.lag ?? 0);
    setNote(dependency?.note ?? '');
  }, [open, dependency, defaultSuccessorId]);

  const submit = () => {
    const payload = {
      projectId: project.id,
      predecessorId,
      successorId,
      type,
      lag: Number(lag),
      note,
    };
    const result = runAction(
      () =>
        dependency
          ? db.updateDependency(dependency.id, payload)
          : db.createDependency(payload),
      dependency ? 'Dependensi berhasil diperbarui.' : 'Dependensi berhasil ditambahkan.',
    );
    if (!result.ok) {
      // Pesan dari validasi bisnis langsung ditampilkan pada field terkait.
      setErrors({ general: result.error });
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      title={dependency ? 'Ubah Dependensi' : 'Tambah Dependensi Tugas'}
      open={open}
      onClose={onClose}
      width={640}
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
        <Field label="Tugas pendahulu" htmlFor="dep-pred" error={errors.predecessorId} required>
          <select id="dep-pred" value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
            <option value="">— Pilih tugas pendahulu —</option>
            {projectTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tugas penerus" htmlFor="dep-succ" error={errors.successorId} required>
          <select id="dep-succ" value={successorId} onChange={(e) => setSuccessorId(e.target.value)}>
            <option value="">— Pilih tugas penerus —</option>
            {projectTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Jenis hubungan" htmlFor="dep-type" hint={TYPE_HELP[type]}>
          <select id="dep-type" value={type} onChange={(e) => setType(e.target.value as DependencyType)}>
            {DEPENDENCY_TYPES.map((item) => (
              <option key={item} value={item}>
                {item === 'FS' ? 'FS — Finish to Start' : 'SS — Start to Start'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lag (hari kerja)" htmlFor="dep-lag" error={errors.lag} hint="Jeda tambahan setelah batasan hubungan terpenuhi.">
          <input id="dep-lag" type="number" min={0} value={lag} onChange={(e) => setLag(Number(e.target.value))} />
        </Field>
        <Field label="Catatan (opsional)" htmlFor="dep-note">
          <input id="dep-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
