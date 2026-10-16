import { useEffect, useState } from 'react';
import type { Member, RateUnit } from '../types';
import { RATE_UNITS } from '../types';
import { Modal } from './Modal';
import { Field } from './ui';
import { db, useAction } from '../hooks/useAppData';
import type { FieldErrors } from '../utils/validation';

interface MemberFormModalProps {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
  onSaved?: (member: Member) => void;
}

/** Formulir tambah/ubah anggota tim (sumber daya manusia). */
export function MemberFormModal({ open, onClose, member, onSaved }: MemberFormModalProps) {
  const runAction = useAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [skills, setSkills] = useState('');
  const [rate, setRate] = useState(0);
  const [rateUnit, setRateUnit] = useState<RateUnit>('jam');
  const [dailyCapacity, setDailyCapacity] = useState(8);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(member?.name ?? '');
    setEmail(member?.email ?? '');
    setRole(member?.role ?? '');
    setSkills(member?.skills ?? '');
    setRate(member?.rate ?? 0);
    setRateUnit(member?.rateUnit ?? 'jam');
    setDailyCapacity(member?.dailyCapacity ?? 8);
    setActive(member?.active ?? true);
    setNotes(member?.notes ?? '');
  }, [open, member]);

  const submit = () => {
    const payload = { name, email, role, skills, rate: Number(rate), rateUnit, dailyCapacity: Number(dailyCapacity), active, notes };
    const result = runAction(
      () => (member ? db.updateMember(member.id, payload) : db.createMember(payload)),
      member ? 'Anggota berhasil diperbarui.' : 'Anggota berhasil ditambahkan.',
    );
    if (!result.ok) {
      setErrors({ general: result.error });
      return;
    }
    if (result.value) onSaved?.(result.value);
    onClose();
  };

  return (
    <Modal
      title={member ? 'Ubah Anggota Tim' : 'Tambah Anggota Tim'}
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
        <Field label="Nama lengkap" htmlFor="member-name" error={errors.name} required>
          <input id="member-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="member-email" error={errors.email}>
          <input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Peran" htmlFor="member-role" error={errors.role} required hint="mis. Frontend Developer, QA Tester">
          <input id="member-role" value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field label="Keahlian" htmlFor="member-skills" hint="Pisahkan dengan koma">
          <input id="member-skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        <Field label="Tarif biaya (opsional)" htmlFor="member-rate" error={errors.rate} hint="Hanya untuk estimasi biaya sumber daya; bukan sistem penggajian.">
          <input id="member-rate" type="number" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
        <Field label="Satuan tarif" htmlFor="member-rate-unit">
          <select id="member-rate-unit" value={rateUnit} onChange={(e) => setRateUnit(e.target.value as RateUnit)}>
            {RATE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                per {unit}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kapasitas kerja harian (jam)" htmlFor="member-capacity" error={errors.dailyCapacity}>
          <input
            id="member-capacity"
            type="number"
            min={1}
            max={24}
            value={dailyCapacity}
            onChange={(e) => setDailyCapacity(Number(e.target.value))}
          />
        </Field>
        <Field label="Status keanggotaan" htmlFor="member-active">
          <select id="member-active" value={active ? 'aktif' : 'nonaktif'} onChange={(e) => setActive(e.target.value === 'aktif')}>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </Field>
        <Field label="Catatan" htmlFor="member-notes">
          <textarea id="member-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
