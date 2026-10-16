/**
 * Engine penjadwalan proyek.
 *
 * Model yang dipakai:
 * - Semua perhitungan durasi menggunakan HARI KERJA sesuai kalender kerja proyek
 *   (akhir pekan & hari libur tidak dihitung).
 * - Tugas daun (tanpa subtugas) adalah node jaringan. Tugas induk adalah agregasi
 *   dari seluruh subtugasnya (tanggal = rentang anak, float = float terkecil).
 * - Dependensi FS/SS + lag diterapkan pada pass pertama (forward pass); tanggal mulai
 *   yang ditetapkan pengguna menjadi batas minimum, sehingga bila tanggal pengguna
 *   melanggar aturan dependensi maka aturan dependensi yang menang dan sebuah
 *   peringatan konflik dihasilkan.
 * - Pass kedua (backward pass) menghitung LS/LF/Total Float; tugas dengan float 0
 *   adalah jalur kritis.
 */
import type { DependencyType, ISODate, Task } from '../types';
import { addDays, compareISO, isValidISO } from './date';
import type { WorkCalendar } from './calendar';
import { findCycle, topoSort } from './graph';

export interface SchedulableDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lag: number;
}

export interface ScheduleEdge {
  depId: string;
  pred: string;
  succ: string;
  type: DependencyType;
  lag: number;
}

export type ScheduleWarningCode =
  | 'CYCLE'
  | 'START_CONFLICT'
  | 'MISSING_TASK'
  | 'INVALID_DURATION'
  | 'INVALID_START'
  | 'DEP_ON_SUMMARY'
  | 'EMPTY_PROJECT';

export interface ScheduleWarning {
  code: ScheduleWarningCode;
  message: string;
  taskId?: string;
  dependencyId?: string;
}

export interface ScheduleEntry {
  taskId: string;
  /** Durasi dalam hari kerja (untuk tugas induk = hasil agregasi). */
  duration: number;
  startOrdinal: number;
  endOrdinal: number;
  start: ISODate;
  end: ISODate;
  lateStartOrdinal: number;
  lateFinishOrdinal: number;
  lateStart: ISODate;
  lateFinish: ISODate;
  /** Total float (slack) dalam hari kerja. */
  totalFloat: number;
  isCritical: boolean;
  /** True untuk tugas yang memiliki subtugas. */
  isSummary: boolean;
  /** ID dependensi penentu awal tugas (task penggerak). */
  drivingDependencyId: string | null;
  hasPredecessors: boolean;
  hasSuccessors: boolean;
}

export interface ScheduleResult {
  /** False bila data tidak cukup/sah untuk menghasilkan jadwal valid (mis. ada siklus). */
  ok: boolean;
  entries: Record<string, ScheduleEntry>;
  /** Urutan topologis tugas daun. */
  order: string[];
  leafIds: string[];
  projectStart: ISODate | null;
  projectFinish: ISODate | null;
  /** Durasi minimum proyek dalam hari kerja. */
  duration: number;
  criticalIds: string[];
  warnings: ScheduleWarning[];
  cycleIds: string[];
}

/** Peta induk -> anak. */
export function buildChildrenMap(tasks: Task[]): Map<string | null, Task[]> {
  const map = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const list = map.get(task.parentId) ?? [];
    list.push(task);
    map.set(task.parentId, list);
  }
  return map;
}

/** ID tugas yang tidak memiliki subtugas (node jaringan PERT/CPM). */
export function leafTaskIds(tasks: Task[]): Set<string> {
  const parents = new Set(tasks.map((t) => t.parentId).filter((id): id is string => !!id));
  return new Set(tasks.filter((t) => !parents.has(t.id)).map((t) => t.id));
}

/** Seluruh keturunan tugas (termasuk dirinya sendiri). */
export function descendantIds(taskId: string, childrenMap: Map<string | null, Task[]>): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const child of childrenMap.get(id) ?? []) walk(child.id);
  };
  walk(taskId);
  return out;
}

/**
 * Meng-ekspansi dependensi agar hanya menghubungkan tugas daun:
 * dependensi yang menunjuk tugas induk dipecah menjadi dependensi ke seluruh
 * tugas daun di bawahnya ( FS induk ≡ FS dari semua anak; SS induk ≡ SS dari semua anak ).
 */
export function expandDependencies(
  tasks: Task[],
  dependencies: SchedulableDependency[],
): { edges: ScheduleEdge[]; warnings: ScheduleWarning[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenMap = buildChildrenMap(tasks);
  const leaves = leafTaskIds(tasks);
  const edges: ScheduleEdge[] = [];
  const warnings: ScheduleWarning[] = [];

  for (const dep of dependencies) {
    const predTask = byId.get(dep.predecessorId);
    const succTask = byId.get(dep.successorId);
    if (!predTask || !succTask) {
      warnings.push({
        code: 'MISSING_TASK',
        dependencyId: dep.id,
        message: `Dependensi menunjuk tugas yang tidak ditemukan dan diabaikan.`,
      });
      continue;
    }
    if (!leaves.has(predTask.id) || !leaves.has(succTask.id)) {
      warnings.push({
        code: 'DEP_ON_SUMMARY',
        dependencyId: dep.id,
        message: `Dependensi pada tugas induk diterapkan ke seluruh subtugasnya.`,
      });
    }
    const preds = leaves.has(predTask.id)
      ? [predTask.id]
      : descendantIds(predTask.id, childrenMap).filter((id) => leaves.has(id));
    const succs = leaves.has(succTask.id)
      ? [succTask.id]
      : descendantIds(succTask.id, childrenMap).filter((id) => leaves.has(id));
    for (const p of preds) {
      for (const s of succs) {
        if (p === s) continue;
        edges.push({ depId: dep.id, pred: p, succ: s, type: dep.type, lag: dep.lag });
      }
    }
  }

  return { edges, warnings };
}

/**
 * Menghitung jadwal lengkap sebuah proyek: ES/EF (forward pass), LS/LF (backward pass),
 * total float, penandaan jalur kritis, durasi & tanggal penyelesaian proyek.
 */
export function computeSchedule(
  tasks: Task[],
  dependencies: SchedulableDependency[],
  calendar: WorkCalendar,
): ScheduleResult {
  const warnings: ScheduleWarning[] = [];
  const entries: Record<string, ScheduleEntry> = {};

  if (tasks.length === 0) {
    return {
      ok: true,
      entries,
      order: [],
      leafIds: [],
      projectStart: null,
      projectFinish: null,
      duration: 0,
      criticalIds: [],
      warnings: [{ code: 'EMPTY_PROJECT', message: 'Belum ada tugas pada proyek ini.' }],
      cycleIds: [],
    };
  }

  // ---- Deteksi siklus pada graf lengkap (termasuk tugas induk) ----
  const allEdgesForCycle = dependencies
    .filter((d) => d.predecessorId !== d.successorId)
    .map((d) => ({ from: d.predecessorId, to: d.successorId }));
  const cycle = findCycle(tasks.map((t) => t.id), allEdgesForCycle);
  if (cycle) {
    const cycleIds = [...new Set(cycle)];
    const names = new Map(tasks.map((t) => [t.id, t.name]));
    warnings.push({
      code: 'CYCLE',
      message: `Siklus dependensi terdeteksi: ${cycleIds
        .map((id) => names.get(id) ?? id)
        .join(' → ')}. Perbaiki dependensi sebelum jadwal dapat dihitung.`,
    });
    for (const id of cycleIds) {
      warnings.push({ code: 'CYCLE', taskId: id, message: 'Tugas berada dalam siklus dependensi.' });
    }
    return {
      ok: false,
      entries,
      order: [],
      leafIds: [],
      projectStart: null,
      projectFinish: null,
      duration: 0,
      criticalIds: [],
      warnings,
      cycleIds,
    };
  }

  const childrenMap = buildChildrenMap(tasks);
  const leaves = leafTaskIds(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { edges, warnings: expandWarnings } = expandDependencies(tasks, dependencies);
  warnings.push(...expandWarnings);

  const leafList = tasks.filter((t) => leaves.has(t.id));
  const leafIds = leafList.map((t) => t.id);
  const { order } = topoSort(
    leafIds,
    edges.map((e) => ({ from: e.pred, to: e.succ })),
  );

  // ---- Validasi durasi & tanggal mulai ----
  const predecessorsOf = new Map<string, ScheduleEdge[]>();
  const successorsOf = new Map<string, ScheduleEdge[]>();
  for (const edge of edges) {
    predecessorsOf.set(edge.succ, [...(predecessorsOf.get(edge.succ) ?? []), edge]);
    successorsOf.set(edge.pred, [...(successorsOf.get(edge.pred) ?? []), edge]);
  }

  const durations = new Map<string, number>();
  for (const task of leafList) {
    const duration = Number.isFinite(task.duration) ? Math.floor(task.duration) : NaN;
    if (!Number.isFinite(duration) || duration < 1) {
      warnings.push({
        code: 'INVALID_DURATION',
        taskId: task.id,
        message: `Durasi tugas "${task.name}" tidak valid (harus >= 1 hari kerja). Dianggap 1 hari.`,
      });
      durations.set(task.id, 1);
    } else {
      durations.set(task.id, duration);
    }
  }

  // Tanggal mulai manual -> ordinal. Tanggal rusak memakai tanggal mulai tugas pertama yang valid.
  const fallbackStart = leafList.find((t) => isValidISO(t.startDate))?.startDate ?? '2000-01-03';
  const manualStart = new Map<string, number>();
  for (const task of leafList) {
    if (!isValidISO(task.startDate)) {
      warnings.push({
        code: 'INVALID_START',
        taskId: task.id,
        message: `Tanggal mulai tugas "${task.name}" tidak valid dan diganti tanggal awal proyek.`,
      });
      manualStart.set(task.id, calendar.ordinal(fallbackStart));
    } else {
      manualStart.set(task.id, calendar.ordinal(task.startDate));
    }
  }

  // ---- Forward pass ----
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const driving = new Map<string, string | null>();
  const startNames = new Map(tasks.map((t) => [t.id, t.name]));

  for (const taskId of order) {
    const preds = predecessorsOf.get(taskId) ?? [];
    let start = manualStart.get(taskId) ?? 0;
    let drivingDep: string | null = null;
    let depMin = -Infinity;
    for (const edge of preds) {
      const predStart = es.get(edge.pred) ?? 0;
      const predDur = durations.get(edge.pred) ?? 1;
      const constraint =
        edge.type === 'FS' ? predStart + predDur + edge.lag : predStart + edge.lag;
      if (constraint > depMin) {
        depMin = constraint;
        drivingDep = edge.depId;
      }
      if (constraint > start) start = constraint;
    }
    if (preds.length > 0 && depMin > (manualStart.get(taskId) ?? 0)) {
      const required = calendar.dateFromOrdinal(depMin);
      warnings.push({
        code: 'START_CONFLICT',
        taskId,
        dependencyId: drivingDep ?? undefined,
        message: `Tanggal mulai "${startNames.get(taskId)}" didahulukan aturan dependensi menjadi ${required} (tanggal awal Anda melanggar batasan dependensi).`,
      });
      driving.set(taskId, drivingDep);
    } else if (preds.length > 0) {
      // Tugas ditahan oleh tanggal manual, tetapi dependensi tetap dicatat sebagai penggerak terkuat.
      driving.set(taskId, depMin >= start ? drivingDep : null);
    } else {
      driving.set(taskId, null);
    }
    es.set(taskId, start);
    ef.set(taskId, start + (durations.get(taskId) ?? 1) - 1);
  }

  const leafStartOrdinals = [...es.values()];
  const leafEndOrdinals = [...ef.values()];
  const projectStartOrdinal = leafStartOrdinals.length ? Math.min(...leafStartOrdinals) : 0;
  const projectFinishOrdinal = leafEndOrdinals.length ? Math.max(...leafEndOrdinals) : 0;

  // ---- Backward pass ----
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const taskId of order) lf.set(taskId, projectFinishOrdinal);

  for (const taskId of [...order].reverse()) {
    const succs = successorsOf.get(taskId) ?? [];
    let lateFinish = lf.get(taskId) ?? projectFinishOrdinal;
    for (const edge of succs) {
      const succLateFinish = lf.get(edge.succ) ?? projectFinishOrdinal;
      const succLateStart = succLateFinish - (durations.get(edge.succ) ?? 1) + 1;
      const constraint =
        edge.type === 'FS' ? succLateStart - edge.lag - 1 : succLateFinish - edge.lag;
      if (constraint < lateFinish) lateFinish = constraint;
    }
    lf.set(taskId, lateFinish);
    ls.set(taskId, lateFinish - (durations.get(taskId) ?? 1) + 1);
  }

  const criticalIds: string[] = [];
  for (const taskId of order) {
    const start = es.get(taskId) ?? 0;
    const finish = ef.get(taskId) ?? 0;
    const lateStart = ls.get(taskId) ?? start;
    const lateFinish = lf.get(taskId) ?? finish;
    const totalFloat = lateStart - start;
    const isCritical = totalFloat <= 0;
    if (isCritical) criticalIds.push(taskId);
    const duration = durations.get(taskId) ?? 1;
    entries[taskId] = {
      taskId,
      duration,
      startOrdinal: start,
      endOrdinal: finish,
      start: calendar.dateFromOrdinal(start),
      end: calendar.dateFromOrdinal(finish),
      lateStartOrdinal: lateStart,
      lateFinishOrdinal: lateFinish,
      lateStart: calendar.dateFromOrdinal(lateStart),
      lateFinish: calendar.dateFromOrdinal(lateFinish),
      totalFloat,
      isCritical,
      isSummary: false,
      drivingDependencyId: driving.get(taskId) ?? null,
      hasPredecessors: (predecessorsOf.get(taskId) ?? []).length > 0,
      hasSuccessors: (successorsOf.get(taskId) ?? []).length > 0,
    };
  }

  // ---- Agregasi tugas induk dari subtugasnya (bottom-up) ----
  const depthOf = (taskId: string, seen = new Set<string>()): number => {
    const task = byId.get(taskId);
    if (!task || !task.parentId || seen.has(taskId)) return 0;
    seen.add(taskId);
    return 1 + depthOf(task.parentId, seen);
  };
  const summaryTasks = tasks
    .filter((t) => !leaves.has(t.id))
    .sort((a, b) => depthOf(b.id) - depthOf(a.id));

  for (const parent of summaryTasks) {
    const childEntries = (childrenMap.get(parent.id) ?? [])
      .map((child) => entries[child.id])
      .filter((entry): entry is ScheduleEntry => !!entry);
    if (childEntries.length === 0) {
      warnings.push({
        code: 'INVALID_DURATION',
        taskId: parent.id,
        message: `Tugas induk "${parent.name}" tidak memiliki subtugas terjadwal.`,
      });
      continue;
    }
    const start = Math.min(...childEntries.map((c) => c.startOrdinal));
    const finish = Math.max(...childEntries.map((c) => c.endOrdinal));
    const lateStart = Math.min(...childEntries.map((c) => c.lateStartOrdinal));
    const lateFinish = Math.max(...childEntries.map((c) => c.lateFinishOrdinal));
    entries[parent.id] = {
      taskId: parent.id,
      duration: calendar.countWorkingDays(
        calendar.dateFromOrdinal(start),
        calendar.dateFromOrdinal(finish),
      ),
      startOrdinal: start,
      endOrdinal: finish,
      start: calendar.dateFromOrdinal(start),
      end: calendar.dateFromOrdinal(finish),
      lateStartOrdinal: lateStart,
      lateFinishOrdinal: lateFinish,
      lateStart: calendar.dateFromOrdinal(lateStart),
      lateFinish: calendar.dateFromOrdinal(lateFinish),
      totalFloat: Math.min(...childEntries.map((c) => c.totalFloat)),
      isCritical: childEntries.some((c) => c.isCritical),
      isSummary: true,
      drivingDependencyId: null,
      hasPredecessors: false,
      hasSuccessors: false,
    };
  }

  const projectStart = leafStartOrdinals.length
    ? calendar.dateFromOrdinal(projectStartOrdinal)
    : null;
  const projectFinish = leafEndOrdinals.length
    ? calendar.dateFromOrdinal(projectFinishOrdinal)
    : null;

  return {
    ok: true,
    entries,
    order,
    leafIds,
    projectStart,
    projectFinish,
    duration: Math.max(0, projectFinishOrdinal - projectStartOrdinal + 1),
    criticalIds,
    warnings,
    cycleIds: [],
  };
}

/**
 * Tanggal minimum yang sah untuk memulai sebuah tugas sesuai dependensinya
 * (dipakai validasi drag-and-drop pada Gantt dan form tugas).
 */
export function earliestAllowedStart(
  taskId: string,
  tasks: Task[],
  dependencies: SchedulableDependency[],
  calendar: WorkCalendar,
): ISODate | null {
  const { edges } = expandDependencies(tasks, dependencies);
  const preds = edges.filter((e) => e.succ === taskId);
  if (preds.length === 0) return null;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let min = Infinity;
  for (const edge of preds) {
    const predTask = byId.get(edge.pred);
    if (!predTask) continue;
    const start = calendar.ordinal(predTask.startDate);
    const duration = Math.max(1, Math.floor(predTask.duration || 1));
    const constraint =
      edge.type === 'FS' ? start + duration + edge.lag : start + edge.lag;
    if (constraint < min) min = constraint;
  }
  return Number.isFinite(min) ? calendar.dateFromOrdinal(min) : null;
}

/** Tanggal selesai turunan dari tanggal mulai + durasi hari kerja. */
export function deriveEndDate(
  startDate: ISODate,
  duration: number,
  calendar: WorkCalendar,
): ISODate {
  const safeStart = isValidISO(startDate) ? startDate : startDate;
  return calendar.addWorkingDays(safeStart, Math.max(1, Math.floor(duration || 1)));
}

/** Apakah dua rentang tanggal saling bertumpuk? */
export function rangesOverlap(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): boolean {
  return compareISO(aStart, bEnd) <= 0 && compareISO(bStart, aEnd) <= 0;
}

/** Menambah `days` hari kalender (dipakai modul yang tidak terikat hari kerja). */
export function addCalendarDays(date: ISODate, days: number): ISODate {
  return addDays(date, days);
}
