/**
 * Util validasi formulir. Semua pesan kesalahan menggunakan bahasa Indonesia.
 */
import type {
  DependencyType,
  ISODate,
  ProjectStatus,
  RateUnit,
  TaskPriority,
  TaskStatus,
} from '../types';
import { compareISO, isValidISO } from './date';

export type FieldErrors = Record<string, string>;

export interface ProjectFormInput {
  name: string;
  organization: string;
  manager: string;
  description: string;
  startDate: ISODate;
  targetEndDate: ISODate;
  status: ProjectStatus;
}

export function validateProjectForm(input: ProjectFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name || input.name.trim().length === 0) {
    errors.name = 'Nama proyek wajib diisi.';
  } else if (input.name.trim().length > 120) {
    errors.name = 'Nama proyek maksimal 120 karakter.';
  }
  if (!input.organization || input.organization.trim().length === 0) {
    errors.organization = 'Nama organisasi/klien wajib diisi.';
  }
  if (!input.manager || input.manager.trim().length === 0) {
    errors.manager = 'Nama manajer proyek wajib diisi.';
  }
  if (!isValidISO(input.startDate)) {
    errors.startDate = 'Tanggal mulai tidak valid.';
  }
  if (!isValidISO(input.targetEndDate)) {
    errors.targetEndDate = 'Tanggal target selesai tidak valid.';
  }
  if (
    isValidISO(input.startDate) &&
    isValidISO(input.targetEndDate) &&
    compareISO(input.targetEndDate, input.startDate) < 0
  ) {
    errors.targetEndDate = 'Tanggal target selesai tidak boleh mendahului tanggal mulai.';
  }
  return errors;
}

export interface TaskFormInput {
  name: string;
  projectId: string;
  startDate: ISODate;
  duration: number;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  parentId: string | null;
  description: string;
  notes: string;
}

export function validateTaskForm(input: TaskFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name || input.name.trim().length === 0) {
    errors.name = 'Nama tugas wajib diisi.';
  } else if (input.name.trim().length > 150) {
    errors.name = 'Nama tugas maksimal 150 karakter.';
  }
  if (!input.projectId) {
    errors.projectId = 'Tugas harus terkait dengan sebuah proyek.';
  }
  if (!isValidISO(input.startDate)) {
    errors.startDate = 'Tanggal mulai tidak valid.';
  }
  if (!Number.isFinite(input.duration) || Math.floor(input.duration) < 1) {
    errors.duration = 'Durasi harus berupa angka minimal 1 hari kerja.';
  }
  if (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 100) {
    errors.progress = 'Progres harus berada antara 0 dan 100.';
  }
  return errors;
}

export interface DependencyFormInput {
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lag: number;
}

/** Validasi dependensi: larang self-loop, lintas proyek, lag negatif, dan siklus. */
export function validateDependencyForm(
  input: DependencyFormInput,
  context: { tasks: { id: string; projectId: string }[]; dependencies: { predecessorId: string; successorId: string }[] },
): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.predecessorId) errors.predecessorId = 'Pilih tugas pendahulu.';
  if (!input.successorId) errors.successorId = 'Pilih tugas penerus.';
  if (input.predecessorId && input.predecessorId === input.successorId) {
    errors.successorId = 'Tugas tidak boleh bergantung pada dirinya sendiri.';
  }
  const predecessor = context.tasks.find((t) => t.id === input.predecessorId);
  const successor = context.tasks.find((t) => t.id === input.successorId);
  if (input.predecessorId && !predecessor) errors.predecessorId = 'Tugas pendahulu tidak ditemukan.';
  if (input.successorId && !successor) errors.successorId = 'Tugas penerus tidak ditemukan.';
  if (predecessor && successor && predecessor.projectId !== successor.projectId) {
    errors.successorId = 'Tugas pendahulu dan penerus harus berada dalam proyek yang sama.';
  }
  if (!Number.isFinite(input.lag) || input.lag < 0 || Math.floor(input.lag) !== input.lag) {
    errors.lag = 'Lag harus berupa bilangan bulat >= 0 (hari kerja).';
  }
  if (
    !errors.predecessorId &&
    !errors.successorId &&
    wouldCreateCycle(
      context.dependencies,
      input.predecessorId,
      input.successorId,
    )
  ) {
    errors.successorId =
      'Dependensi ini akan membentuk siklus (loop) dan ditolak. Periksa rantai ketergantungan yang ada.';
  }
  const duplicate = context.dependencies.some(
    (d) => d.predecessorId === input.predecessorId && d.successorId === input.successorId,
  );
  if (duplicate) {
    errors.successorId = 'Dependensi antara kedua tugas tersebut sudah ada.';
  }
  return errors;
}

/**
 * Menambahkan edge predecessor -> successor akan membentuk siklus bila sudah ada
 * jalur successor ⇝ predecessor (atau keduanya tugas yang sama).
 */
export function wouldCreateCycle(
  dependencies: { predecessorId: string; successorId: string }[],
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) return true;
  const adjacency = new Map<string, string[]>();
  for (const dep of dependencies) {
    adjacency.set(dep.predecessorId, [...(adjacency.get(dep.predecessorId) ?? []), dep.successorId]);
  }
  const visited = new Set<string>();
  const queue = [successorId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === predecessorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}

export interface MemberFormInput {
  name: string;
  email: string;
  role: string;
  skills: string;
  rate: number;
  rateUnit: RateUnit;
  dailyCapacity: number;
  active: boolean;
  notes: string;
}

export function validateMemberForm(input: MemberFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.name || input.name.trim().length === 0) {
    errors.name = 'Nama lengkap anggota wajib diisi.';
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Format email tidak valid.';
  }
  if (!input.role || input.role.trim().length === 0) {
    errors.role = 'Peran anggota wajib diisi.';
  }
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    errors.rate = 'Tarif tidak boleh negatif.';
  }
  if (!Number.isFinite(input.dailyCapacity) || input.dailyCapacity <= 0 || input.dailyCapacity > 24) {
    errors.dailyCapacity = 'Kapasitas harian harus antara 1 dan 24 jam.';
  }
  return errors;
}

export interface AssignmentFormInput {
  taskId: string;
  memberId: string;
  role: string;
  allocation: number;
  startDate: ISODate;
  endDate: ISODate;
}

export function validateAssignmentForm(input: AssignmentFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.taskId) errors.taskId = 'Pilih tugas yang akan ditugaskan.';
  if (!input.memberId) errors.memberId = 'Pilih anggota tim.';
  if (!input.role || input.role.trim().length === 0) {
    errors.role = 'Peran pada tugas wajib diisi.';
  }
  if (!Number.isFinite(input.allocation) || input.allocation <= 0 || input.allocation > 200) {
    errors.allocation = 'Alokasi harus antara 1% dan 200% (di atas 100% berarti potensi kelebihan beban).';
  }
  if (!isValidISO(input.startDate)) errors.startDate = 'Tanggal mulai penugasan tidak valid.';
  if (!isValidISO(input.endDate)) errors.endDate = 'Tanggal selesai penugasan tidak valid.';
  if (
    isValidISO(input.startDate) &&
    isValidISO(input.endDate) &&
    compareISO(input.endDate, input.startDate) < 0
  ) {
    errors.endDate = 'Tanggal selesai penugasan tidak boleh mendahului tanggal mulai.';
  }
  return errors;
}

export interface AbsenceFormInput {
  memberId: string;
  startDate: ISODate;
  endDate: ISODate;
  reason: string;
}

export function validateAbsenceForm(input: AbsenceFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.memberId) errors.memberId = 'Pilih anggota yang berketidakhadiran.';
  if (!isValidISO(input.startDate)) errors.startDate = 'Tanggal mulai tidak valid.';
  if (!isValidISO(input.endDate)) errors.endDate = 'Tanggal selesai tidak valid.';
  if (
    isValidISO(input.startDate) &&
    isValidISO(input.endDate) &&
    compareISO(input.endDate, input.startDate) < 0
  ) {
    errors.endDate = 'Tanggal selesai tidak boleh mendahului tanggal mulai.';
  }
  if (!input.reason || input.reason.trim().length === 0) {
    errors.reason = 'Alasan ketidakhadiran wajib diisi.';
  }
  return errors;
}

export interface HolidayFormInput {
  date: ISODate;
  name: string;
}

export function validateHolidayForm(input: HolidayFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidISO(input.date)) errors.date = 'Tanggal libur tidak valid.';
  if (!input.name || input.name.trim().length === 0) errors.name = 'Nama hari libur wajib diisi.';
  return errors;
}
