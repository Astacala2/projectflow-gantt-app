import { useEffect, useState } from 'react';
import type { Assignment, Member, Task } from '../types';
import { Modal } from './Modal';
import { Field } from './ui';
import { db, useAction } from '../hooks/useAppData';
import type { FieldErrors } from '../utils/validation';

interface AssignmentFormModalProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  members: Member[];
  assignment?: Assignment | null;
  onSaved?: () => void;
}

/**
 * Formulir penugasan anggota ke tugas.
 * Alokasi kerja = bagian kapasitas anggota yang dipakai tugas ini (100% = penuh).
 */
export function AssignmentFormModal({ open, onClose, task, members, assignment, onSaved }: AssignmentFormModalProps) {
  const runAction = useAction();
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState('');
  const [allocation, setAllocation] = useState(50);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open || !task) return;
    setErrors({});
    setMemberId(assignment?.memberId ?? '');
    setRole(assignment?.role ?? '');
    setAllocation(assignment?.allocation ?? 50);
    setStartDate(assignment?.startDate ?? task.startDate);
    setEndDate(assignment?.endDate ?? task.endDate);
    setNote(assignment?.note ?? '');
  }, [open, task, assignment]);

  if (!task) return null;

  const submit = () => {
    const payload = { taskId: task.id, memberId, role, allocation: Number(allocation), startDate, endDate, note };
    const result = runAction(
      () => (assignment ? db.updateAssignment(assignment.id, payload) : db.createAssignment(payload)),
      assignment ? 'Penugasan berhasil diperbarui.' : 'Anggota berhasil ditugaskan.',
    );
    if (!result.ok) {
      setErrors({ general: result.error });
      return;
    }
    onSaved?.();
    onClose();
  };

  // Anggota yang belum ditugaskan pada tugas ini.
  const availableMembers = members.filter(
    (member) => member.id === assignment?.memberId || !assignment,
  );

  return (
    <Modal
      title={assignment ? 'Ubah Penugasan' : `Tugaskan Anggota — ${task.name}`}
      open={open}
      onClose={onClose}
      width={620}
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
        <Field label="Anggota tim" htmlFor="assign-member" error={errors.memberId} required>
          <select id="assign-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">— Pilih anggota —</option>
            {availableMembers.map((member) => (
              <option key={member.id} value={member.id} disabled={!member.active}>
                {member.name} — {member.role}
                {member.active ? '' : ' (nonaktif)'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Peran pada tugas" htmlFor="assign-role" error={errors.role} required hint="mis. Koder utama, Reviewer, Tester">
          <input id="assign-role" value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field
          label={`Alokasi kerja (${allocation}%)`}
          htmlFor="assign-allocation"
          error={errors.allocation}
          hint="Total alokasi anggota pada waktu bersamaan maksimal 100%."
          required
        >
          <input
            id="assign-allocation"
            type="range"
            min={5}
            max={100}
            step={5}
            value={Math.min(100, allocation)}
            onChange={(e) => setAllocation(Number(e.target.value))}
          />
        </Field>
        <Field label="Tanggal mulai penugasan" htmlFor="assign-start" error={errors.startDate} hint={`Tugas berjalan ${task.startDate} s.d. ${task.endDate}.`}>
          <input id="assign-start" type="date" value={startDate} min={task.startDate} max={task.endDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Tanggal selesai penugasan" htmlFor="assign-end" error={errors.endDate}>
          <input id="assign-end" type="date" value={endDate} min={task.startDate} max={task.endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Catatan" htmlFor="assign-note">
          <input id="assign-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
