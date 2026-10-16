/**
 * Critical Path Analysis.
 * Menyediakan ekstraksi jalur kritis dari hasil computeSchedule serta
 * util deskripsi untuk halaman analisis & laporan.
 */
import type { ScheduleEdge, ScheduleResult } from './schedule';

export interface CriticalPathSet {
  /** Daftar jalur kritis (urutan ID tugas dari sumber ke sink). */
  paths: string[][];
  /** Durasi tiap jalur dalam hari kerja (rentang ES pertama sampai EF terakhir). */
  durations: number[];
  /** Pasangan edge kritis yang membentuk jalur (untuk highlight pada PERT). */
  criticalEdges: { pred: string; succ: string; depId: string }[];
}

/**
 * Menemukan seluruh jalur kritis.
 * Edge dianggap kritis bila konstrainnya "ketat" pada kedua pass:
 *  - FS: ES_penerus == EF_pendahulu + 1 + lag  dan  LF_pendahulu == LS_penerus - lag - 1
 *  - SS: ES_penerus == ES_pendahulu + lag     dan  LF_pendahulu == LF_penerus - lag
 */
export function findCriticalPaths(result: ScheduleResult, edges: ScheduleEdge[]): CriticalPathSet {
  const criticalSet = new Set(result.criticalIds);
  const criticalEdges: { pred: string; succ: string; depId: string }[] = [];

  for (const edge of edges) {
    const predEntry = result.entries[edge.pred];
    const succEntry = result.entries[edge.succ];
    if (!predEntry || !succEntry) continue;
    if (!criticalSet.has(edge.pred) || !criticalSet.has(edge.succ)) continue;

    const tight =
      edge.type === 'FS'
        ? succEntry.startOrdinal === predEntry.endOrdinal + 1 + edge.lag &&
          predEntry.lateFinishOrdinal === succEntry.lateStartOrdinal - edge.lag - 1
        : succEntry.startOrdinal === predEntry.startOrdinal + edge.lag &&
          predEntry.lateFinishOrdinal === succEntry.lateFinishOrdinal - edge.lag;
    if (tight) {
      criticalEdges.push({ pred: edge.pred, succ: edge.succ, depId: edge.depId });
    }
  }

  // Bangun adjacency hanya dari edge kritis.
  const adjacency = new Map<string, string[]>();
  const hasCriticalPred = new Set<string>();
  for (const edge of criticalEdges) {
    adjacency.set(edge.pred, [...(adjacency.get(edge.pred) ?? []), edge.succ]);
    hasCriticalPred.add(edge.succ);
  }

  const paths: string[][] = [];
  const MAX_PATHS = 50;
  const walk = (node: string, path: string[]) => {
    if (paths.length >= MAX_PATHS) return;
    const nexts = adjacency.get(node) ?? [];
    if (nexts.length === 0) {
      if (path.length > 0) paths.push([...path]);
      return;
    }
    for (const next of nexts) {
      path.push(next);
      walk(next, path);
      path.pop();
      if (paths.length >= MAX_PATHS) return;
    }
  };

  for (const id of result.criticalIds) {
    if (!hasCriticalPred.has(id)) walk(id, [id]);
  }
  // Kasus kritis terkunci dalam satu siklus kecil tidak mungkin terjadi (siklus ditolak),
  // tetapi bila semua node punya predecessor kritis, mulailah dari node pertama.
  if (paths.length === 0 && result.criticalIds.length > 0) {
    walk(result.criticalIds[0], [result.criticalIds[0]]);
  }

  const durations = paths.map((path) => {
    if (path.length === 0) return 0;
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const id of path) {
      const entry = result.entries[id];
      if (!entry) continue;
      minStart = Math.min(minStart, entry.startOrdinal);
      maxEnd = Math.max(maxEnd, entry.endOrdinal);
    }
    return Number.isFinite(minStart) && Number.isFinite(maxEnd) ? maxEnd - minStart + 1 : 0;
  });

  return { paths, durations, criticalEdges };
}

/** Tugas non kritis yang float-nya paling kecil (kandidat berikutnya menjadi kritis). */
export function nearCriticalTasks(result: ScheduleResult, limit = 5): string[] {
  return Object.values(result.entries)
    .filter((entry) => !entry.isCritical && !entry.isSummary)
    .sort((a, b) => a.totalFloat - b.totalFloat)
    .slice(0, limit)
    .map((entry) => entry.taskId);
}
