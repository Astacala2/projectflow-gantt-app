import { useMemo, useState } from 'react';
import type { Absence, Assignment, Member, Task } from '../types';
import { db, useAction, useAppData, useSelectedProject } from '../hooks/useAppData';
import { ConfirmDialog, Modal } from '../components/Modal';
import {
  EmptyState,
  ProgressBar,
  SectionCard,
  TaskStatusBadge,
  WarningPanel,
  formatCurrency,
} from '../components/ui';
import { MemberFormModal } from '../components/MemberFormModal';
import { AbsenceFormModal } from '../components/AbsenceFormModal';
import { AssignmentFormModal } from '../components/AssignmentFormModal';
import { formatDateID } from '../utils/date';

/** Halaman sumber daya manusia: anggota tim, ketidakhadiran, dan beban kerja. */
export function ResourcesPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const runAction = useAction();

  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState<Absence | null>(null);
  const [absenceDefaultMember, setAbsenceDefaultMember] = useState<string | undefined>(undefined);
  const [assignmentModal, setAssignmentModal] = useState<{ task: Task; assignment: Assignment } | null>(null);
  const [keyword, setKeyword] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState<'semua' | 'aktif' | 'nonaktif'>('semua');

  const roles = useMemo(() => [...new Set(data.members.map((member) => member.role))], [data.members]);

  const members = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return data.members.filter((member) => {
      if (query && !member.name.toLowerCase().includes(query) && !member.skills.toLowerCase().includes(query)) return false;
      if (filterRole && member.role !== filterRole) return false;
      if (filterStatus === 'aktif' && !member.active) return false;
      if (filterStatus === 'nonaktif' && member.active) return false;
      return true;
    });
  }, [data.members, keyword, filterRole, filterStatus]);

  const workload = useMemo(
    () => (project ? db.workloadOf(project.id) : null),
    [project, data],
  );
  const taskById = useMemo(() => new Map(data.tasks.map((task) => [task.id, task])), [data.tasks]);

  const memberAssignments = (memberId: string) =>
    data.assignments
      .filter((assignment) => assignment.memberId === memberId)
      .map((assignment) => ({ assignment, task: taskById.get(assignment.taskId) }))
      .filter((pair): pair is { assignment: Assignment; task: Task } => !!pair.task);

  const memberAbsences = (memberId: string) =>
    data.absences.filter((absence) => absence.memberId === memberId);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Sumber Daya Manusia</h1>
          <p>Kelola anggota tim, ketidakhadiran, dan penugasan pekerjaan.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setEditingAbsence(null);
              setAbsenceModalOpen(true);
            }}
          >
            + Ketidakhadiran
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingMember(null);
              setMemberFormOpen(true);
            }}
          >
            + Anggota Baru
          </button>
        </div>
      </div>

      {workload && workload.conflicts.length > 0 ? (
        <WarningPanel
          title="Peringatan sumber daya"
          items={workload.conflicts.map((conflict) => ({ code: conflict.type, message: conflict.message }))}
        />
      ) : null}

      <SectionCard
        title="Anggota tim"
        subtitle={`${members.length} anggota ditampilkan${data.members.length !== members.length ? ` dari ${data.members.length} total` : ''}.`}
        actions={
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Cari nama atau keahlian..."
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label="Cari anggota"
            />
            <select value={filterRole} onChange={(event) => setFilterRole(event.target.value)} aria-label="Filter peran">
              <option value="">Semua peran</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as 'semua' | 'aktif' | 'nonaktif')}
              aria-label="Filter status keanggotaan"
            >
              <option value="semua">Semua status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Peran</th>
                <th>Keahlian</th>
                <th>Kapasitas</th>
                <th>Tarif</th>
                <th>Beban kerja</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const memberWorkload = workload?.byMember[member.id];
                const taskCount = memberAssignments(member.id).length;
                return (
                  <tr key={member.id} className={!member.active ? 'row-muted' : ''}>
                    <td>
                      <strong>{member.name}</strong>
                      <br />
                      <small className="text-muted">{member.email || '—'}</small>
                    </td>
                    <td>{member.role}</td>
                    <td className="text-muted">{member.skills || '—'}</td>
                    <td>{member.dailyCapacity} jam/hari</td>
                    <td>{member.rate > 0 ? `${formatCurrency(member.rate)}/${member.rateUnit}` : '—'}</td>
                    <td>
                      <ProgressBar value={Math.min(100, memberWorkload?.utilization ?? 0)} small />
                      <small className="text-muted">
                        {taskCount} tugas · puncak {memberWorkload?.peakAllocation ?? 0}%
                      </small>
                    </td>
                    <td>
                      <span className={`badge ${member.active ? 'badge-success' : 'badge-neutral'}`}>
                        {member.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="table-actions">
                      <button type="button" className="btn-icon" title="Lihat detail" onClick={() => setDetailMember(member)}>
                        👁
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Tambah ketidakhadiran"
                        onClick={() => {
                          setEditingAbsence(null);
                          setAbsenceDefaultMember(member.id);
                          setAbsenceModalOpen(true);
                        }}
                      >
                        📅
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Ubah"
                        onClick={() => {
                          setEditingMember(member);
                          setMemberFormOpen(true);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title={member.active ? 'Nonaktifkan' : 'Aktifkan'}
                        onClick={() => {
                          const result = runAction(
                            () => db.toggleMemberActive(member.id),
                            member.active ? `${member.name} dinonaktifkan.` : `${member.name} diaktifkan kembali.`,
                          );
                          void result;
                        }}
                      >
                        ⏻
                      </button>
                      <button type="button" className="btn-icon" title="Hapus" onClick={() => setDeletingMember(member)}>
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title={data.members.length === 0 ? 'Belum ada anggota tim' : 'Tidak ada hasil filter'}
                      message={
                        data.members.length === 0
                          ? 'Tambahkan anggota tim seperti Project Manager, System Analyst, UI/UX Designer, Frontend/Backend Developer, QA Tester, dan Deployment Engineer.'
                          : 'Ubah kata kunci atau filter pencarian.'
                      }
                      action={
                        data.members.length === 0 ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              setEditingMember(null);
                              setMemberFormOpen(true);
                            }}
                          >
                            Tambah Anggota
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Ketidakhadiran terdaftar" subtitle="Anggota yang berketidakhadiran tidak dihitung tersedia pada periode tersebut.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Periode</th>
                <th>Alasan</th>
                <th>Dampak</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.absences.map((absence) => {
                const member = data.members.find((item) => item.id === absence.memberId);
                const clash = workload?.conflicts.some(
                  (conflict) => conflict.type === 'ABSENCE' && conflict.assignmentId &&
                    data.assignments.some(
                      (assignment) =>
                        assignment.id === conflict.assignmentId && assignment.memberId === absence.memberId,
                    ),
                );
                return (
                  <tr key={absence.id}>
                    <td>{member?.name ?? '(dihapus)'}</td>
                    <td>
                      {formatDateID(absence.startDate)} → {formatDateID(absence.endDate)}
                    </td>
                    <td>{absence.reason}</td>
                    <td>
                      {clash ? (
                        <span className="badge badge-danger">Bentrok dengan penugasan</span>
                      ) : (
                        <span className="badge badge-neutral">Tidak ada bentrok</span>
                      )}
                    </td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        title="Ubah"
                        onClick={() => {
                          setEditingAbsence(absence);
                          setAbsenceModalOpen(true);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Hapus"
                        onClick={() => {
                          const result = runAction(() => db.deleteAbsence(absence.id), 'Ketidakhadiran dihapus.');
                          void result;
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
              {data.absences.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Belum ada ketidakhadiran yang terdaftar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Detail anggota */}
      <Modal title={detailMember ? `${detailMember.name} — ${detailMember.role}` : 'Detail Anggota'} open={!!detailMember} onClose={() => setDetailMember(null)} width={760}>
        {detailMember ? (
          <div className="task-detail">
            <div className="detail-grid">
              <div>
                <h4>Profil</h4>
                <dl>
                  <dt>Email</dt>
                  <dd>{detailMember.email || '—'}</dd>
                  <dt>Keahlian</dt>
                  <dd>{detailMember.skills || '—'}</dd>
                  <dt>Kapasitas harian</dt>
                  <dd>{detailMember.dailyCapacity} jam</dd>
                  <dt>Tarif</dt>
                  <dd>{detailMember.rate > 0 ? `${formatCurrency(detailMember.rate)} per ${detailMember.rateUnit}` : '—'}</dd>
                  <dt>Status</dt>
                  <dd>{detailMember.active ? 'Aktif' : 'Nonaktif'}</dd>
                </dl>
              </div>
              <div>
                <h4>Beban kerja</h4>
                <dl>
                  <dt>Utilisasi proyek aktif</dt>
                  <dd>{workload?.byMember[detailMember.id]?.utilization ?? 0}%</dd>
                  <dt>Puncak alokasi</dt>
                  <dd>{workload?.byMember[detailMember.id]?.peakAllocation ?? 0}%</dd>
                  <dt>Konflik beban</dt>
                  <dd>
                    {workload?.conflicts.filter((conflict) => conflict.memberId === detailMember.id).length ?? 0} temuan
                  </dd>
                  {data.settings.costCalculationEnabled ? (
                    <>
                      <dt>Estimasi biaya</dt>
                      <dd>{formatCurrency(workload?.byMember[detailMember.id]?.estimatedCost ?? 0)}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </div>

            <h4>Daftar tugas yang ditugaskan</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tugas</th>
                    <th>Peran</th>
                    <th>Alokasi</th>
                    <th>Periode</th>
                    <th>Status tugas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {memberAssignments(detailMember.id).map(({ assignment, task }) => (
                    <tr key={assignment.id}>
                      <td>{task.name}</td>
                      <td>{assignment.role}</td>
                      <td>{assignment.allocation}%</td>
                      <td>
                        {formatDateID(assignment.startDate)} → {formatDateID(assignment.endDate)}
                      </td>
                      <td>
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn-icon"
                          title="Ubah penugasan"
                          onClick={() => setAssignmentModal({ task, assignment })}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Hapus penugasan"
                          onClick={() => {
                            const result = runAction(() => db.deleteAssignment(assignment.id), 'Penugasan dihapus.');
                            void result;
                          }}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                  {memberAssignments(detailMember.id).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        Anggota ini belum memiliki penugasan.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <h4>Ketidakhadiran</h4>
            <ul className="summary-list">
              {memberAbsences(detailMember.id).map((absence) => (
                <li key={absence.id}>
                  <span>
                    {formatDateID(absence.startDate)} → {formatDateID(absence.endDate)} — {absence.reason}
                  </span>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => {
                      setEditingAbsence(absence);
                      setAbsenceModalOpen(true);
                    }}
                  >
                    ✎
                  </button>
                </li>
              ))}
              {memberAbsences(detailMember.id).length === 0 ? <li className="text-muted">Tidak ada catatan ketidakhadiran.</li> : null}
            </ul>
          </div>
        ) : null}
      </Modal>

      <MemberFormModal
        open={memberFormOpen}
        onClose={() => setMemberFormOpen(false)}
        member={editingMember}
      />
      <AbsenceFormModal
        open={absenceModalOpen}
        onClose={() => setAbsenceModalOpen(false)}
        members={data.members}
        absence={editingAbsence}
        defaultMemberId={editingAbsence ? undefined : absenceDefaultMember ?? detailMember?.id}
      />
      <AssignmentFormModal
        open={!!assignmentModal}
        onClose={() => setAssignmentModal(null)}
        task={assignmentModal?.task ?? null}
        assignment={assignmentModal?.assignment ?? null}
        members={data.members}
      />
      <ConfirmDialog
        open={!!deletingMember}
        title="Hapus anggota?"
        message={`Anggota "${deletingMember?.name}" beserta seluruh penugasan dan ketidakhadirannya akan dihapus.`}
        onConfirm={() => {
          if (!deletingMember) return;
          const result = runAction(() => db.deleteMember(deletingMember.id), 'Anggota dihapus.');
          if (result.ok) setDeletingMember(null);
        }}
        onCancel={() => setDeletingMember(null)}
      />
    </div>
  );
}
