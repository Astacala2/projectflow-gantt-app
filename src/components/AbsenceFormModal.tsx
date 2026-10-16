import { useEffect, useState } from 'react';
import type { Absence, Member } from '../types';
import { Modal } from './Modal';
import { Field } from './ui';
import { db, useAction } from '../hooks/useAppData';
import type { FieldErrors } from '../utils/validation';

interface AbsenceFormModalProps {
  open: boolean;
  onClose: () => void;
  members: Member[];
  absence?: Absence | null;
  defaultMemberId?: string;
  onSaved?: () => void;
}

/** Formulir ketidakhadiran anggota (cuti, sakit, dsb.). */
export function AbsenceFormModal({ open, onClose, members, absence, defaultMemberId, onSaved }: AbsenceFormModalProps) {
  const runAction = useAction();
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMemberId(absence?.memberId ?? defaultMemberId ?? '');
    setStartDate(absence?.startDate ?? '');
    setEndDate(absence?.endDate ?? '');
    setReason(absence?.reason ?? '');
  }, [open, absence, defaultMemberId]);

  const submit = () => {
    const payload = { memberId, startDate, endDate, reason };
    const result = runAction<Absence | void>(
      () => (absence ? db.updateAbsence(absence.id, payload) : db.addAbsence(payload)),
      absence ? 'Ketidakhadiran diperbarui.' : 'Ketidahiran dicatat.',
    );
    if (!result.ok) {
      setErrors({ general: result.error });
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      title={absence ? 'Ubah Ketidakhadiran' : 'Tambah Ketidakhadiran'}
      open={open}
      onClose={onClose}
      width={560}
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
        <Field label="Anggota" htmlFor="abs-member" error={errors.memberId} required>
          <select id="abs-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">— Pilih anggota —</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} — {member.role}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tanggal mulai" htmlFor="abs-start" error={errors.startDate} required>
          <input id="abs-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Tanggal selesai" htmlFor="abs-end" error={errors.endDate} required>
          <input id="abs-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Alasan" htmlFor="abs-reason" error={errors.reason} required>
          <input id="abs-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Cuti tahunan, Sakit" />
        </Field>
      </div>
    </Modal>
  );
}
