import { describe, expect, it } from 'vitest';
import type { Dependency, Task } from '../types';
import { WorkCalendar } from './calendar';
import { computeSchedule, earliestAllowedStart, expandDependencies, leafTaskIds } from './schedule';

const cal = new WorkCalendar([1, 2, 3, 4, 5], []);
const BASE = cal.ordinal('2026-01-05'); // hari kerja pertama pada contoh (Senin)

/** Mengubah ordinal absolut menjadi posisi relatif terhadap hari pertama contoh (1-based). */
function rel(ordinal: number): number {
  return ordinal - BASE + 1;
}

function makeTask(id: string, duration: number, startDate = '2026-01-05', parentId: string | null = null): Task {
  return {
    id,
    projectId: 'p1',
    name: `Tugas ${id}`,
    description: '',
    startDate,
    duration,
    endDate: '',
    priority: 'Sedang',
    status: 'Belum Dimulai',
    progress: 0,
    parentId,
    notes: '',
  };
}

function makeDep(predecessorId: string, successorId: string, type: Dependency['type'] = 'FS', lag = 0): Dependency {
  return {
    id: `d-${predecessorId}-${successorId}-${type}-${lag}`,
    projectId: 'p1',
    predecessorId,
    successorId,
    type,
    lag,
    note: '',
  };
}

describe('computeSchedule — jaringan dengan hasil yang diketahui', () => {
  /**
   * Jaringan contoh (semua mulai pada hari kerja pertama bila tidak dibatasi):
   *   A(4) FS-> C(3), B(2) FS-> C(3), C(3) FS-> D(6), A(4) FS+3-> E(2)
   * Hasil yang diketahui (posisi hari kerja relatif):
   *   A: 1-4 | B: 1-2 | C: 5-7 | D: 8-13 | E: 8-9
   *   Durasi proyek = 13 hari kerja; float: A=0, B=1, C=0, D=0, E=4
   */
  const tasks = [
    makeTask('A', 4),
    makeTask('B', 2),
    makeTask('C', 3),
    makeTask('D', 6),
    makeTask('E', 2),
  ];
  const deps = [
    makeDep('A', 'C', 'FS', 0),
    makeDep('B', 'C', 'FS', 0),
    makeDep('C', 'D', 'FS', 0),
    makeDep('A', 'E', 'FS', 3),
  ];

  it('menghitung ES/EF dan durasi proyek sesuai contoh', () => {
    const result = computeSchedule(tasks, deps, cal);
    expect(result.ok).toBe(true);
    expect(result.duration).toBe(13);

    expect(rel(result.entries.A.startOrdinal)).toBe(1);
    expect(rel(result.entries.A.endOrdinal)).toBe(4);
    expect(rel(result.entries.B.endOrdinal)).toBe(2);
    expect(rel(result.entries.C.startOrdinal)).toBe(5);
    expect(rel(result.entries.C.endOrdinal)).toBe(7);
    expect(rel(result.entries.D.startOrdinal)).toBe(8);
    expect(rel(result.entries.D.endOrdinal)).toBe(13);
    // E dimulai 3 hari kerja setelah hari selesai A (FS + lag 3): 4 + 3 = posisi 8.
    expect(rel(result.entries.E.startOrdinal)).toBe(8);
    expect(rel(result.entries.E.endOrdinal)).toBe(9);
  });

  it('menandai tugas kritis hanya berdasarkan total float nol', () => {
    const result = computeSchedule(tasks, deps, cal);
    expect(result.entries.A.totalFloat).toBe(0);
    expect(result.entries.B.totalFloat).toBe(2);
    expect(result.entries.C.totalFloat).toBe(0);
    expect(result.entries.D.totalFloat).toBe(0);
    expect(result.entries.E.totalFloat).toBe(4);
    expect([...result.criticalIds].sort()).toEqual(['A', 'C', 'D']);
    expect(result.entries.B.isCritical).toBe(false);
    expect(result.entries.E.isCritical).toBe(false);
  });

  it('menghitung backward pass (LS/LF) yang konsisten', () => {
    const result = computeSchedule(tasks, deps, cal);
    expect(rel(result.entries.D.lateStartOrdinal)).toBe(8);
    expect(rel(result.entries.C.lateStartOrdinal)).toBe(5);
    expect(rel(result.entries.C.lateFinishOrdinal)).toBe(7);
    expect(rel(result.entries.B.lateFinishOrdinal)).toBe(4);
    expect(rel(result.entries.B.lateStartOrdinal)).toBe(3);
    expect(rel(result.entries.E.lateFinishOrdinal)).toBe(13);
  });

  it('mengonversi ordinal menjadi tanggal kalender kerja', () => {
    const result = computeSchedule(tasks, deps, cal);
    expect(result.entries.A.start).toBe('2026-01-05');
    expect(result.entries.C.start).toBe('2026-01-09'); // hari kerja ke-5
    expect(result.projectStart).toBe('2026-01-05');
    expect(result.projectFinish).toBe('2026-01-21'); // hari kerja ke-13
  });
});

describe('computeSchedule — dependensi FS dan SS dengan lag', () => {
  it('FS: penerus mulai tepat setelah pendahulu selesai', () => {
    const result = computeSchedule([makeTask('A', 3), makeTask('B', 2)], [makeDep('A', 'B', 'FS', 0)], cal);
    expect(rel(result.entries.B.startOrdinal)).toBe(4);
    expect(result.entries.B.start).toBe('2026-01-08');
  });

  it('FS + lag positif menambah jeda hari kerja', () => {
    const result = computeSchedule([makeTask('A', 3), makeTask('B', 2)], [makeDep('A', 'B', 'FS', 2)], cal);
    expect(rel(result.entries.B.startOrdinal)).toBe(6); // 3 hari A + 2 lag + 1
    expect(result.entries.B.start).toBe('2026-01-12');
  });

  it('SS: penerus mulai bersamaan dengan pendahulu bila lag nol', () => {
    const result = computeSchedule([makeTask('A', 5), makeTask('B', 3)], [makeDep('A', 'B', 'SS', 0)], cal);
    expect(rel(result.entries.B.startOrdinal)).toBe(1);
    expect(rel(result.entries.A.startOrdinal)).toBe(1);
  });

  it('SS + lag menunda penerus sebesar lag hari kerja', () => {
    const result = computeSchedule([makeTask('A', 5), makeTask('B', 3)], [makeDep('A', 'B', 'SS', 2)], cal);
    expect(rel(result.entries.B.startOrdinal)).toBe(3);
  });

  it('SS: tanggal pengguna yang melanggar dependensi SS dikoreksi dan diberi peringatan', () => {
    // B dimulai bersamaan dengan A, tetapi SS+1 mensyaratkan B mulai 1 hari kerja setelah A.
    const tasks = [makeTask('A', 5, '2026-01-05'), makeTask('B', 2, '2026-01-05')];
    const result = computeSchedule(tasks, [makeDep('A', 'B', 'SS', 1)], cal);
    expect(result.entries.B.start).toBe('2026-01-06');
    expect(result.warnings.some((warning) => warning.code === 'START_CONFLICT' && warning.taskId === 'B')).toBe(true);
  });

  it('menghormati tanggal mulai pengguna bila tidak melanggar dependensi', () => {
    const tasks = [makeTask('A', 3), makeTask('B', 2, '2026-01-19')];
    const result = computeSchedule(tasks, [makeDep('A', 'B', 'FS', 0)], cal);
    expect(result.entries.B.start).toBe('2026-01-19');
  });

  it('mengoreksi tanggal pengguna yang melanggar dependensi dan memberi peringatan', () => {
    const tasks = [makeTask('A', 3), makeTask('B', 2, '2026-01-05')];
    const result = computeSchedule(tasks, [makeDep('A', 'B', 'FS', 0)], cal);
    expect(result.entries.B.start).toBe('2026-01-08');
    expect(result.warnings.some((item) => item.code === 'START_CONFLICT' && item.taskId === 'B')).toBe(true);
  });

  it('perubahan durasi pendahulu otomatis memperbarui jadwal penerus', () => {
    const tasks = [makeTask('A', 3), makeTask('B', 2)];
    const deps = [makeDep('A', 'B', 'FS', 0)];
    const before = computeSchedule(tasks, deps, cal);
    expect(before.entries.B.start).toBe('2026-01-08');

    const changed = computeSchedule([makeTask('A', 6), makeTask('B', 2)], deps, cal);
    expect(changed.entries.A.end).toBe('2026-01-12');
    expect(changed.entries.B.start).toBe('2026-01-13');
  });
});

describe('computeSchedule — validasi data', () => {
  it('menolak siklus dependensi dan tidak menghasilkan jadwal palsu', () => {
    const tasks = [makeTask('A', 2), makeTask('B', 2), makeTask('C', 2)];
    const deps = [makeDep('A', 'B'), makeDep('B', 'C'), makeDep('C', 'A')];
    const result = computeSchedule(tasks, deps, cal);
    expect(result.ok).toBe(false);
    expect(result.cycleIds.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.code === 'CYCLE')).toBe(true);
    expect(Object.keys(result.entries)).toHaveLength(0);
  });

  it('durasi tidak valid ditandai peringatan dan dianggap 1 hari', () => {
    const result = computeSchedule([makeTask('A', 0), makeTask('B', 1)], [makeDep('A', 'B')], cal);
    expect(result.warnings.some((warning) => warning.code === 'INVALID_DURATION')).toBe(true);
    expect(result.entries.A.duration).toBe(1);
  });

  it('tanggal mulai tidak valid ditandai peringatan', () => {
    const result = computeSchedule([makeTask('A', 2, '31-12-2026')], [], cal);
    expect(result.warnings.some((warning) => warning.code === 'INVALID_START')).toBe(true);
  });

  it('proyek tanpa tugas menghasilkan status kosong yang jelas', () => {
    const result = computeSchedule([], [], cal);
    expect(result.ok).toBe(true);
    expect(result.duration).toBe(0);
    expect(result.warnings.some((warning) => warning.code === 'EMPTY_PROJECT')).toBe(true);
  });
});

describe('computeSchedule — tugas induk dan subtugas', () => {
  const tasks = [
    makeTask('P', 1, '2026-01-05', null),
    makeTask('C1', 3, '2026-01-05', 'P'),
    makeTask('C2', 2, '2026-01-09', 'P'),
    makeTask('X', 1),
  ];
  const deps = [makeDep('P', 'X', 'FS', 0)];

  it('menjadikan tugas daun sebagai node jaringan', () => {
    expect([...leafTaskIds(tasks)].sort()).toEqual(['C1', 'C2', 'X']);
  });

  it('mengagregasi tanggal tugas induk dari subtugasnya', () => {
    const result = computeSchedule(tasks, deps, cal);
    expect(result.entries.P.isSummary).toBe(true);
    expect(result.entries.P.start).toBe(result.entries.C1.start);
    // C2 dimulai Jumat 2026-01-09 dan berdurasi 2 hari kerja -> selesai 2026-01-12.
    expect(result.entries.C2.end).toBe('2026-01-12');
    expect(result.entries.P.end).toBe('2026-01-12');
  });

  it('dependensi pada tugas induk diterapkan ke seluruh subtugasnya', () => {
    const { edges } = expandDependencies(tasks, deps);
    const targets = edges.map((edge) => `${edge.pred}->${edge.succ}`);
    expect(targets).toContain('C1->X');
    expect(targets).toContain('C2->X');

    const result = computeSchedule(tasks, deps, cal);
    // X mulai setelah subtugas terakhir (C2) selesai.
    expect(result.entries.X.start).toBe('2026-01-13');
  });
});

describe('earliestAllowedStart', () => {
  it('menghitung batas awal minimum dari FS + lag', () => {
    const tasks = [makeTask('A', 3), makeTask('B', 2)];
    const deps = [makeDep('A', 'B', 'FS', 2)];
    expect(earliestAllowedStart('B', tasks, deps, cal)).toBe('2026-01-12');
  });

  it('menghitung batas awal minimum dari SS', () => {
    const tasks = [makeTask('A', 3), makeTask('B', 2)];
    const deps = [makeDep('A', 'B', 'SS', 1)];
    expect(earliestAllowedStart('B', tasks, deps, cal)).toBe('2026-01-06');
  });

  it('mengembalikan null untuk tugas tanpa pendahulu', () => {
    expect(earliestAllowedStart('A', [makeTask('A', 1)], [], cal)).toBeNull();
  });
});

describe('computeSchedule — durasi & lag mengecualikan akhir pekan dan hari libur', () => {
  // Senin–Jumat, dengan Rabu 7 Januari 2026 sebagai hari libur.
  const calLibur = new WorkCalendar([1, 2, 3, 4, 5], ['2026-01-07']);

  it('durasi tugas tidak menghitung hari libur dan akhir pekan', () => {
    // A mulai Selasa 06, durasi 2 hari kerja: Sel, Kam (Rabu libur dilewati) → selesai Kamis 08.
    const result = computeSchedule([makeTask('A', 2, '2026-01-06')], [], calLibur);
    expect(result.entries.A.start).toBe('2026-01-06');
    expect(result.entries.A.end).toBe('2026-01-08');
    expect(result.projectFinish).toBe('2026-01-08');
  });

  it('FS lag 0: penerus mulai pada hari kerja setelah pendahulu selesai, hari libur dilewati', () => {
    // A dur 3 mulai Senin 05: Sen 05, Sel 06, Kam 08 (Rabu libur) → selesai Kamis 08.
    // B (FS lag 0) mulai Jumat 09 — bukan Rabu 07 yang libur.
    const result = computeSchedule([makeTask('A', 3), makeTask('B', 2)], [makeDep('A', 'B', 'FS', 0)], calLibur);
    expect(result.entries.A.end).toBe('2026-01-08');
    expect(result.entries.B.start).toBe('2026-01-09');
  });

  it('FS + lag melompati akhir pekan: penerus mulai Senin berikutnya', () => {
    // A selesai Kamis 08; lag 1 → Jumat 09; B mulai Senin 12 (Sabtu-Minggu dilewati).
    const result = computeSchedule([makeTask('A', 3), makeTask('B', 2)], [makeDep('A', 'B', 'FS', 1)], calLibur);
    expect(result.entries.B.start).toBe('2026-01-12');
  });

  it('lag SS dihitung hari kerja dan menghasilkan mulai yang tidak pernah hari libur', () => {
    // SS + lag 2 dari Senin 05: dengan kalender standar itu Rabu 07 —
    // karena Rabu libur, penerus mulai Kamis 08.
    const stdResult = computeSchedule([makeTask('A', 5), makeTask('B', 2)], [makeDep('A', 'B', 'SS', 2)], cal);
    expect(stdResult.entries.B.start).toBe('2026-01-07');

    const holidayResult = computeSchedule([makeTask('A', 5), makeTask('B', 2)], [makeDep('A', 'B', 'SS', 2)], calLibur);
    expect(holidayResult.entries.B.start).toBe('2026-01-08');
  });

  it('mengubah hari libur mengubah jadwal: tanggal libur baru menunda dependen FS', () => {
    const deps = [makeDep('A', 'B', 'FS', 0)];
    const tanpaLibur = computeSchedule([makeTask('A', 2), makeTask('B', 2)], deps, new WorkCalendar([1, 2, 3, 4, 5], []));
    const denganLibur = computeSchedule([makeTask('A', 2), makeTask('B', 2)], deps, new WorkCalendar([1, 2, 3, 4, 5], ['2026-01-07']));
    // Tanpa libur: A selesai Selasa 06, B mulai Rabu 07.
    expect(tanpaLibur.entries.B.start).toBe('2026-01-07');
    // Dengan libur Rabu 07: A tetap selesai Selasa 06, tetapi B ditunda ke Kamis 08.
    expect(denganLibur.entries.A.end).toBe('2026-01-06');
    expect(denganLibur.entries.B.start).toBe('2026-01-08');
  });

  it('countWorkingDays mengecualikan akhir pekan dan hari libur', () => {
    expect(calLibur.countWorkingDays('2026-01-05', '2026-01-09')).toBe(4); // Sen, Sel, Kam, Jum
    expect(calLibur.countWorkingDays('2026-01-05', '2026-01-11')).toBe(4); // rentang termasuk akhir pekan
  });
});
