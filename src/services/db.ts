/**
 * Lapisan data aplikasi (data layer).
 *
 * Modul ini menyimpan seluruh state aplikasi, melakukan validasi bisnis,
 * dan memastikan setiap perubahan langsung dipersist ke localStorage serta
 * diberitahukan ke seluruh pelanggan (komponen React) melalui mekanisme subscribe.
 *
 * UI tidak pernah mengubah data langsung; selalu melalui fungsi-fungsi di sini
 * sehingga lapisan penyimpanan dapat diganti dengan API pada pengembangan berikutnya.
 */
import type {
  AppData,
  Assignment,
  Dependency,
  Absence,
  Holiday,
  ISODate,
  Member,
  Project,
  ProjectStatus,
  RateUnit,
  Settings,
  Task,
  TaskPriority,
  TaskStatus,
  GanttScale,
} from '../types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../types';
import { clearStorage, exportDataJSON, importDataJSON, readFromStorage, writeToStorage } from './storage';
import { buildSampleData } from './sampleData';
import { getProjectCalendar, WorkCalendar } from '../utils/calendar';
import { compareISO } from '../utils/date';
import { computeSchedule, deriveEndDate, type ScheduleResult } from '../utils/schedule';
import {
  validateAssignmentForm,
  validateAbsenceForm,
  validateDependencyForm,
  validateHolidayForm,
  validateMemberForm,
  validateProjectForm,
  validateTaskForm,
  wouldCreateCycle,
} from '../utils/validation';
import { computeWorkload, type WorkloadSummary } from '../utils/workload';

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string };

const ok = <T>(value?: T): ActionResult<T> => ({ ok: true, value });
const fail = (error: string): ActionResult<never> => ({ ok: false, error });

function uid(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

// ---------------------------------------------------------------------------
// Store: state + subscribe + persist
// ---------------------------------------------------------------------------

function loadInitialData(): AppData {
  const stored = readFromStorage();
  if (stored && stored.projects.length > 0) return stored;
  if (stored && stored.projects.length === 0 && stored.tasks.length === 0) {
    // Penyimpanan ada tetapi kosong (mis. baru saja dikosongkan) -> hormati pilihan pengguna.
    return { ...stored, settings: { ...DEFAULT_SETTINGS, ...stored.settings } };
  }
  const seeded = buildSampleData();
  writeToStorage(seeded);
  return seeded;
}

let state: AppData = loadInitialData();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: AppData): void {
  state = next;
  version += 1;
  writeToStorage(state);
  listeners.forEach((listener) => listener());
}

/** Berlangganan perubahan data (dipakai useSyncExternalStore). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppData {
  return state;
}

/** Nomor versi state — berubah setiap kali data berubah (untuk memoisasi selector). */
export function getStateVersion(): number {
  return version;
}

// ---------------------------------------------------------------------------
// Selector (turunan data, dihitung on-demand dengan cache sederhana)
// ---------------------------------------------------------------------------

interface SelectorCache {
  version: number;
  calendars: Map<string, WorkCalendar>;
  schedules: Map<string, ScheduleResult>;
  workloads: Map<string, WorkloadSummary>;
}

let cache: SelectorCache = { version: -1, calendars: new Map(), schedules: new Map(), workloads: new Map() };

function ensureCache(): SelectorCache {
  if (cache.version !== version) {
    cache = { version, calendars: new Map(), schedules: new Map(), workloads: new Map() };
  }
  return cache;
}

export function getProjectById(projectId: string | null): Project | null {
  if (!projectId) return null;
  return state.projects.find((p) => p.id === projectId) ?? null;
}

export function getHolidays(projectId: string): Holiday[] {
  return state.holidays.filter((h) => h.projectId === projectId);
}

/** Kalender kerja sebuah proyek (cached). */
export function calendarOf(projectId: string): WorkCalendar {
  const store = ensureCache();
  const cached = store.calendars.get(projectId);
  if (cached) return cached;
  const project = getProjectById(projectId);
  const calendar = getProjectCalendar(
    projectId,
    project?.workingDays ?? [1, 2, 3, 4, 5],
    getHolidays(projectId).map((h) => h.date),
  );
  store.calendars.set(projectId, calendar);
  return calendar;
}

export function tasksOf(projectId: string): Task[] {
  return state.tasks.filter((t) => t.projectId === projectId);
}

export function dependenciesOf(projectId: string): Dependency[] {
  return state.dependencies.filter((d) => d.projectId === projectId);
}

/** Hasil analisis jadwal & jalur kritis sebuah proyek (cached per versi data). */
export function scheduleOf(projectId: string): ScheduleResult {
  const store = ensureCache();
  const cached = store.schedules.get(projectId);
  if (cached) return cached;
  const result = computeSchedule(tasksOf(projectId), dependenciesOf(projectId), calendarOf(projectId));
  store.schedules.set(projectId, result);
  return result;
}

/** Beban kerja sumber daya proyek (cached per versi data & rentang). */
export function workloadOf(projectId: string, start?: ISODate, end?: ISODate): WorkloadSummary {
  const schedule = scheduleOf(projectId);
  const rangeStart = start ?? schedule.projectStart ?? getProjectById(projectId)?.startDate ?? '';
  const rangeEnd = end ?? schedule.projectFinish ?? getProjectById(projectId)?.targetEndDate ?? '';
  const key = `${projectId}|${rangeStart}|${rangeEnd}`;
  const store = ensureCache();
  const cached = store.workloads.get(key);
  if (cached) return cached;
  const calendar = calendarOf(projectId);
  const summary = computeWorkload({
    members: state.members,
    tasks: tasksOf(projectId),
    assignments: state.assignments.filter((assignment) =>
      tasksOf(projectId).some((task) => task.id === assignment.taskId),
    ),
    absences: state.absences,
    start: rangeStart,
    end: rangeEnd,
    costEnabled: state.settings.costCalculationEnabled,
    isNonWorkingDay: (date) => !calendar.isWorkingDay(date),
  });
  store.workloads.set(key, summary);
  return summary;
}

/**
 * Progres proyek = rata-rata terbobot progres tugas daun terhadap durasinya
 * (durasi dihitung dalam hari kerja). Metode ini konsisten dipakai di seluruh aplikasi.
 */
export function computeProjectProgress(projectId: string): number {
  const leaves = tasksOf(projectId).filter((t) => !hasChildren(t.id));
  if (leaves.length === 0) return 0;
  const total = leaves.reduce((sum, t) => sum + Math.max(1, t.duration), 0);
  if (total === 0) return 0;
  const weighted = leaves.reduce((sum, t) => sum + t.progress * Math.max(1, t.duration), 0);
  return Math.round(weighted / total);
}

export function hasChildren(taskId: string): boolean {
  return state.tasks.some((t) => t.parentId === taskId);
}

export function childrenOf(taskId: string): Task[] {
  return state.tasks.filter((t) => t.parentId === taskId);
}

export function assignmentsOfTask(taskId: string): Assignment[] {
  return state.assignments.filter((a) => a.taskId === taskId);
}

export function assignmentsOfMember(memberId: string): Assignment[] {
  return state.assignments.filter((a) => a.memberId === memberId);
}

export function absencesOfMember(memberId: string): Absence[] {
  return state.absences.filter((a) => a.memberId === memberId);
}

export function memberById(memberId: string): Member | null {
  return state.members.find((m) => m.id === memberId) ?? null;
}

export function taskById(taskId: string): Task | null {
  return state.tasks.find((t) => t.id === taskId) ?? null;
}

// ---------------------------------------------------------------------------
// Proyek
// ---------------------------------------------------------------------------

export interface ProjectInput {
  name: string;
  description: string;
  organization: string;
  manager: string;
  startDate: ISODate;
  targetEndDate: ISODate;
  status: ProjectStatus;
  workingDays: number[];
}

export function createProject(input: ProjectInput): ActionResult<Project> {
  const errors = validateProjectForm(input);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  if (input.workingDays.length === 0) {
    return fail('Minimal satu hari kerja harus ditentukan pada kalender proyek.');
  }
  const now = new Date().toISOString();
  const project: Project = {
    id: uid('p'),
    name: input.name.trim(),
    description: input.description.trim(),
    organization: input.organization.trim(),
    manager: input.manager.trim(),
    startDate: input.startDate,
    targetEndDate: input.targetEndDate,
    status: input.status,
    progress: 0,
    workingDays: [...new Set(input.workingDays)].sort((a, b) => a - b),
    createdAt: now,
    updatedAt: now,
  };
  commit({
    ...state,
    projects: [...state.projects, project],
    settings: state.settings.selectedProjectId
      ? state.settings
      : { ...state.settings, selectedProjectId: project.id },
  });
  return ok(project);
}

export function updateProject(
  projectId: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): ActionResult<Project> {
  const project = getProjectById(projectId);
  if (!project) return fail('Proyek tidak ditemukan.');
  const merged: Project = { ...project, ...patch, updatedAt: new Date().toISOString() };
  const errors = validateProjectForm(merged);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  commit({
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? merged : p)),
  });
  return ok(merged);
}

export function setProjectStatus(projectId: string, status: ProjectStatus): ActionResult<Project> {
  return updateProject(projectId, { status });
}

export function deleteProject(projectId: string): ActionResult {
  const project = getProjectById(projectId);
  if (!project) return fail('Proyek tidak ditemukan.');
  const taskIds = new Set(state.tasks.filter((t) => t.projectId === projectId).map((t) => t.id));
  commit({
    ...state,
    projects: state.projects.filter((p) => p.id !== projectId),
    tasks: state.tasks.filter((t) => t.projectId !== projectId),
    dependencies: state.dependencies.filter((d) => d.projectId !== projectId),
    holidays: state.holidays.filter((h) => h.projectId !== projectId),
    assignments: state.assignments.filter((a) => !taskIds.has(a.taskId)),
    settings: {
      ...state.settings,
      selectedProjectId:
        state.settings.selectedProjectId === projectId
          ? (state.projects.find((p) => p.id !== projectId)?.id ?? null)
          : state.settings.selectedProjectId,
    },
  });
  return ok();
}

export function setProjectWorkingDays(projectId: string, workingDays: number[]): ActionResult<Project> {
  if (workingDays.length === 0) return fail('Minimal satu hari kerja harus aktif.');
  return updateProject(projectId, { workingDays: [...new Set(workingDays)].sort((a, b) => a - b) });
}

// ---------------------------------------------------------------------------
// Hari libur
// ---------------------------------------------------------------------------

export function addHoliday(projectId: string, input: { date: ISODate; name: string }): ActionResult<Holiday> {
  const errors = validateHolidayForm(input);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  if (state.holidays.some((h) => h.projectId === projectId && h.date === input.date)) {
    return fail('Tanggal tersebut sudah ditandai sebagai hari libur.');
  }
  const holiday: Holiday = { id: uid('h'), projectId, date: input.date, name: input.name.trim() };
  commit({ ...state, holidays: [...state.holidays, holiday] });
  return ok(holiday);
}

export function updateHoliday(holidayId: string, patch: Partial<Pick<Holiday, 'date' | 'name'>>): ActionResult {
  const holiday = state.holidays.find((h) => h.id === holidayId);
  if (!holiday) return fail('Hari libur tidak ditemukan.');
  const merged = { ...holiday, ...patch };
  const errors = validateHolidayForm(merged);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  commit({
    ...state,
    holidays: state.holidays.map((h) => (h.id === holidayId ? merged : h)),
  });
  return ok();
}

export function deleteHoliday(holidayId: string): ActionResult {
  if (!state.holidays.some((h) => h.id === holidayId)) return fail('Hari libur tidak ditemukan.');
  commit({ ...state, holidays: state.holidays.filter((h) => h.id !== holidayId) });
  return ok();
}

// ---------------------------------------------------------------------------
// Tugas & subtugas
// ---------------------------------------------------------------------------

export interface TaskInput {
  projectId: string;
  name: string;
  description: string;
  startDate: ISODate;
  duration: number;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  parentId: string | null;
  notes: string;
}

export function createTask(input: TaskInput): ActionResult<Task> {
  const errors = validateTaskForm(input);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  if (input.parentId) {
    const parent = taskById(input.parentId);
    if (!parent) return fail('Tugas induk tidak ditemukan.');
    if (parent.projectId !== input.projectId) {
      return fail('Sub-tugas harus berada dalam proyek yang sama dengan induknya.');
    }
  }
  const calendar = calendarOf(input.projectId);
  const task: Task = {
    id: uid('t'),
    projectId: input.projectId,
    name: input.name.trim(),
    description: input.description.trim(),
    startDate: input.startDate,
    duration: Math.max(1, Math.floor(input.duration)),
    endDate: deriveEndDate(input.startDate, input.duration, calendar),
    priority: input.priority,
    status: input.status,
    progress: Math.min(100, Math.max(0, Math.round(input.progress))),
    parentId: input.parentId,
    notes: input.notes.trim(),
  };
  commit({ ...state, tasks: [...state.tasks, task] });
  syncProjectProgress(input.projectId);
  return ok(task);
}

export function updateTask(taskId: string, patch: Partial<Omit<Task, 'id' | 'projectId'>>): ActionResult<Task> {
  const task = taskById(taskId);
  if (!task) return fail('Tugas tidak ditemukan.');
  const merged: Task = { ...task, ...patch };
  const errors = validateTaskForm({ ...merged });
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  if (merged.parentId) {
    if (merged.parentId === taskId) return fail('Tugas tidak boleh menjadi sub-tugas dari dirinya sendiri.');
    const parent = taskById(merged.parentId);
    if (!parent) return fail('Tugas induk tidak ditemukan.');
    if (parent.projectId !== task.projectId) return fail('Sub-tugas harus berada dalam proyek yang sama.');
    // Larang menjadikan keturunan sendiri sebagai induk.
    let cursor: Task | null = parent;
    while (cursor) {
      if (cursor.id === taskId) return fail('Pilihan tugas induk akan membuat siklus hierarki.');
      cursor = cursor.parentId ? taskById(cursor.parentId) : null;
    }
  }
  merged.duration = Math.max(1, Math.floor(merged.duration));
  merged.progress = Math.min(100, Math.max(0, Math.round(merged.progress)));
  merged.endDate = deriveEndDate(merged.startDate, merged.duration, calendarOf(task.projectId));
  commit({ ...state, tasks: state.tasks.map((t) => (t.id === taskId ? merged : t)) });
  syncProjectProgress(task.projectId);
  return ok(merged);
}

/** Menghapus tugas beserta subtugas, penugasan, dan dependensi yang menunjuk kepadanya. */
export function deleteTask(taskId: string): ActionResult {
  const task = taskById(taskId);
  if (!task) return fail('Tugas tidak ditemukan.');
  const toDelete = new Set<string>([taskId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of state.tasks) {
      if (candidate.parentId && toDelete.has(candidate.parentId) && !toDelete.has(candidate.id)) {
        toDelete.add(candidate.id);
        grew = true;
      }
    }
  }
  commit({
    ...state,
    tasks: state.tasks.filter((t) => !toDelete.has(t.id)),
    dependencies: state.dependencies.filter(
      (d) => !toDelete.has(d.predecessorId) && !toDelete.has(d.successorId),
    ),
    assignments: state.assignments.filter((a) => !toDelete.has(a.taskId)),
  });
  syncProjectProgress(task.projectId);
  return ok();
}

function syncProjectProgress(projectId: string): void {
  const project = getProjectById(projectId);
  if (!project) return;
  const progress = computeProjectProgress(projectId);
  if (progress === project.progress) return;
  // Update senyap tanpa commit tambahan agar tidak memicu loop.
  state = {
    ...state,
    projects: state.projects.map((p) =>
      p.id === projectId ? { ...p, progress, updatedAt: new Date().toISOString() } : p,
    ),
  };
  writeToStorage(state);
}

// ---------------------------------------------------------------------------
// Dependensi
// ---------------------------------------------------------------------------

export interface DependencyInput {
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: Dependency['type'];
  lag: number;
  note: string;
}

export function createDependency(input: DependencyInput): ActionResult<Dependency> {
  const errors = validateDependencyForm(input, {
    tasks: state.tasks.map((t) => ({ id: t.id, projectId: t.projectId })),
    dependencies: state.dependencies,
  });
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  const dependency: Dependency = {
    id: uid('d'),
    projectId: input.projectId,
    predecessorId: input.predecessorId,
    successorId: input.successorId,
    type: input.type,
    lag: Math.max(0, Math.floor(input.lag)),
    note: input.note.trim(),
  };
  commit({ ...state, dependencies: [...state.dependencies, dependency] });
  return ok(dependency);
}

export function updateDependency(
  dependencyId: string,
  patch: Partial<Pick<Dependency, 'type' | 'lag' | 'note' | 'predecessorId' | 'successorId'>>,
): ActionResult<Dependency> {
  const dependency = state.dependencies.find((d) => d.id === dependencyId);
  if (!dependency) return fail('Dependensi tidak ditemukan.');
  const merged: Dependency = { ...dependency, ...patch };
  const others = state.dependencies.filter((d) => d.id !== dependencyId);
  const errors = validateDependencyForm(merged, {
    tasks: state.tasks.map((t) => ({ id: t.id, projectId: t.projectId })),
    dependencies: others,
  });
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  commit({
    ...state,
    dependencies: state.dependencies.map((d) => (d.id === dependencyId ? merged : d)),
  });
  return ok(merged);
}

export function deleteDependency(dependencyId: string): ActionResult {
  if (!state.dependencies.some((d) => d.id === dependencyId)) {
    return fail('Dependensi tidak ditemukan.');
  }
  commit({ ...state, dependencies: state.dependencies.filter((d) => d.id !== dependencyId) });
  return ok();
}

export { wouldCreateCycle };

// ---------------------------------------------------------------------------
// Sumber daya manusia
// ---------------------------------------------------------------------------

export interface MemberInput {
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

export function createMember(input: MemberInput): ActionResult<Member> {
  const errors = validateMemberForm(input);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  if (input.email && state.members.some((m) => m.email.toLowerCase() === input.email.trim().toLowerCase())) {
    return fail('Email tersebut sudah terdaftar untuk anggota lain.');
  }
  const member: Member = {
    id: uid('m'),
    name: input.name.trim(),
    email: input.email.trim(),
    role: input.role.trim(),
    skills: input.skills.trim(),
    rate: Math.max(0, input.rate),
    rateUnit: input.rateUnit,
    dailyCapacity: input.dailyCapacity,
    active: input.active,
    notes: input.notes.trim(),
  };
  commit({ ...state, members: [...state.members, member] });
  return ok(member);
}

export function updateMember(memberId: string, patch: Partial<Omit<Member, 'id'>>): ActionResult<Member> {
  const member = memberById(memberId);
  if (!member) return fail('Anggota tidak ditemukan.');
  const merged: Member = { ...member, ...patch };
  const errors = validateMemberForm(merged);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  commit({ ...state, members: state.members.map((m) => (m.id === memberId ? merged : m)) });
  return ok(merged);
}

export function toggleMemberActive(memberId: string): ActionResult<Member> {
  const member = memberById(memberId);
  if (!member) return fail('Anggota tidak ditemukan.');
  return updateMember(memberId, { active: !member.active });
}

export function deleteMember(memberId: string): ActionResult {
  if (!memberById(memberId)) return fail('Anggota tidak ditemukan.');
  commit({
    ...state,
    members: state.members.filter((m) => m.id !== memberId),
    assignments: state.assignments.filter((a) => a.memberId !== memberId),
    absences: state.absences.filter((a) => a.memberId !== memberId),
  });
  return ok();
}

// ---------------------------------------------------------------------------
// Ketidakhadiran
// ---------------------------------------------------------------------------

export interface AbsenceInput {
  memberId: string;
  startDate: ISODate;
  endDate: ISODate;
  reason: string;
}

export function addAbsence(input: AbsenceInput): ActionResult<Absence> {
  const errors = validateAbsenceForm(input);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  if (!memberById(input.memberId)) return fail('Anggota tidak ditemukan.');
  const absence: Absence = {
    id: uid('ab'),
    memberId: input.memberId,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason.trim(),
  };
  commit({ ...state, absences: [...state.absences, absence] });
  return ok(absence);
}

export function updateAbsence(absenceId: string, patch: Partial<Omit<Absence, 'id'>>): ActionResult {
  const absence = state.absences.find((a) => a.id === absenceId);
  if (!absence) return fail('Ketidakhadiran tidak ditemukan.');
  const merged = { ...absence, ...patch };
  const errors = validateAbsenceForm(merged);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  commit({ ...state, absences: state.absences.map((a) => (a.id === absenceId ? merged : a)) });
  return ok();
}

export function deleteAbsence(absenceId: string): ActionResult {
  if (!state.absences.some((a) => a.id === absenceId)) return fail('Ketidakhadiran tidak ditemukan.');
  commit({ ...state, absences: state.absences.filter((a) => a.id !== absenceId) });
  return ok();
}

// ---------------------------------------------------------------------------
// Penugasan sumber daya
// ---------------------------------------------------------------------------

export interface AssignmentInput {
  taskId: string;
  memberId: string;
  role: string;
  allocation: number;
  startDate: ISODate;
  endDate: ISODate;
  note: string;
}

export function createAssignment(input: AssignmentInput): ActionResult<Assignment> {
  const errors = validateAssignmentForm(input);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  const task = taskById(input.taskId);
  if (!task) return fail('Tugas tidak ditemukan.');
  const member = memberById(input.memberId);
  if (!member) return fail('Anggota tidak ditemukan.');
  if (!member.active) {
    return fail(
      `${member.name} berstatus nonaktif. Aktifkan kembali anggota sebelum menugaskannya.`,
    );
  }
  if (
    compareISO(input.startDate, task.startDate) < 0 ||
    compareISO(input.endDate, task.endDate) > 0
  ) {
    return fail('Rentang penugasan harus berada di dalam rentang tanggal tugas.');
  }
  if (state.assignments.some((a) => a.taskId === input.taskId && a.memberId === input.memberId)) {
    return fail(`${member.name} sudah ditugaskan pada tugas tersebut.`);
  }
  const assignment: Assignment = {
    id: uid('a'),
    taskId: input.taskId,
    memberId: input.memberId,
    role: input.role.trim(),
    allocation: Math.min(200, Math.max(1, input.allocation)),
    startDate: input.startDate,
    endDate: input.endDate,
    note: input.note.trim(),
  };
  commit({ ...state, assignments: [...state.assignments, assignment] });
  return ok(assignment);
}

export function updateAssignment(
  assignmentId: string,
  patch: Partial<Omit<Assignment, 'id'>>,
): ActionResult<Assignment> {
  const assignment = state.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return fail('Penugasan tidak ditemukan.');
  const merged: Assignment = { ...assignment, ...patch };
  const errors = validateAssignmentForm(merged);
  if (Object.keys(errors).length > 0) return fail(Object.values(errors).join(' '));
  const task = taskById(merged.taskId);
  if (!task) return fail('Tugas tidak ditemukan.');
  if (compareISO(merged.startDate, task.startDate) < 0 || compareISO(merged.endDate, task.endDate) > 0) {
    return fail('Rentang penugasan harus berada di dalam rentang tanggal tugas.');
  }
  commit({
    ...state,
    assignments: state.assignments.map((a) => (a.id === assignmentId ? merged : a)),
  });
  return ok(merged);
}

export function deleteAssignment(assignmentId: string): ActionResult {
  if (!state.assignments.some((a) => a.id === assignmentId)) return fail('Penugasan tidak ditemukan.');
  commit({ ...state, assignments: state.assignments.filter((a) => a.id !== assignmentId) });
  return ok();
}

// ---------------------------------------------------------------------------
// Pengaturan & pengelolaan data
// ---------------------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>): ActionResult {
  commit({ ...state, settings: { ...state.settings, ...patch } });
  return ok();
}

export function selectProject(projectId: string | null): ActionResult {
  if (projectId && !getProjectById(projectId)) return fail('Proyek tidak ditemukan.');
  return updateSettings({ selectedProjectId: projectId });
}

export function setGanttScale(scale: GanttScale): ActionResult {
  return updateSettings({ ganttScale: scale });
}

export function setCostCalculationEnabled(enabled: boolean): ActionResult {
  return updateSettings({ costCalculationEnabled: enabled });
}

/** Memulihkan data contoh (menimpa seluruh data pengguna). */
export function resetToSampleData(): ActionResult {
  const seeded = buildSampleData();
  commit(seeded);
  return ok();
}

/** Mengosongkan seluruh data (memulai dari nol). */
export function clearAllData(): ActionResult {
  const empty: AppData = {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    holidays: [],
    tasks: [],
    dependencies: [],
    members: [],
    absences: [],
    assignments: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  commit(empty);
  return ok();
}

export function exportToJSON(): string {
  return exportDataJSON(state);
}

export function importFromJSON(text: string): ActionResult {
  const result = importDataJSON(text);
  if (!result.ok || !result.data) return fail(result.error ?? 'Gagal mengimpor berkas.');
  commit(result.data);
  return ok();
}

export { clearStorage };

/** Pastikan proyek terpilih valid setelah aplikasi dimuat. */
export function ensureSelectedProject(): void {
  const { selectedProjectId } = state.settings;
  if (selectedProjectId && getProjectById(selectedProjectId)) return;
  const fallback = state.projects[0]?.id ?? null;
  if (fallback !== selectedProjectId) {
    commit({ ...state, settings: { ...state.settings, selectedProjectId: fallback } });
  }
}

ensureSelectedProject();
