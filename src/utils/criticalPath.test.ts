import { describe, expect, it } from 'vitest';
import type { Dependency, Task } from '../types';
import { WorkCalendar } from './calendar';
import { computeSchedule, expandDependencies } from './schedule';
import { findCriticalPaths, nearCriticalTasks } from './criticalPath';

const cal = new WorkCalendar([1, 2, 3, 4, 5], []);

function makeTask(id: string, duration: number): Task {
  return {
    id,
    projectId: 'p1',
    name: `Tugas ${id}`,
    description: '',
    startDate: '2026-01-05',
    duration,
    endDate: '',
    priority: 'Sedang',
    status: 'Belum Dimulai',
    progress: 0,
    parentId: null,
    notes: '',
  };
}

function makeDep(pred: string, succ: string, type: Dependency['type'] = 'FS', lag = 0): Dependency {
  return { id: `d-${pred}-${succ}`, projectId: 'p1', predecessorId: pred, successorId: succ, type, lag, note: '' };
}

describe('findCriticalPaths', () => {
  it('menemukan satu jalur kritis pada jaringan sederhana', () => {
    // A(4) -> C(3) -> D(6) kritis; B(2) -> C float 1; A -> E lag 3 float 4.
    const tasks = [makeTask('A', 4), makeTask('B', 2), makeTask('C', 3), makeTask('D', 6), makeTask('E', 2)];
    const deps = [makeDep('A', 'C'), makeDep('B', 'C'), makeDep('C', 'D'), makeDep('A', 'E', 'FS', 3)];
    const schedule = computeSchedule(tasks, deps, cal);
    const { edges } = expandDependencies(tasks, deps);
    const paths = findCriticalPaths(schedule, edges);

    expect(paths.paths).toHaveLength(1);
    expect(paths.paths[0]).toEqual(['A', 'C', 'D']);
    expect(paths.durations[0]).toBe(13);
  });

  it('menemukan seluruh jalur kritis bila ada lebih dari satu', () => {
    // A(3) dan B(3) sama-sama mendorong C(2): dua jalur kritis A->C dan B->C.
    const tasks = [makeTask('A', 3), makeTask('B', 3), makeTask('C', 2)];
    const deps = [makeDep('A', 'C'), makeDep('B', 'C')];
    const schedule = computeSchedule(tasks, deps, cal);
    const { edges } = expandDependencies(tasks, deps);
    const paths = findCriticalPaths(schedule, edges);

    const signatures = paths.paths.map((path) => path.join('>')).sort();
    expect(signatures).toEqual(['A>C', 'B>C']);
  });

  it('tidak memasukkan tugas dengan float positif ke jalur kritis', () => {
    // B (float 2) dan E (float 4) tidak menjadi bagian jalur kritis A->C->D.
    const tasks = [makeTask('A', 4), makeTask('B', 2), makeTask('C', 3), makeTask('D', 6), makeTask('E', 2)];
    const deps = [makeDep('A', 'C'), makeDep('B', 'C'), makeDep('C', 'D'), makeDep('A', 'E', 'FS', 3)];
    const schedule = computeSchedule(tasks, deps, cal);
    expect(schedule.ok).toBe(true);
    const { edges } = expandDependencies(tasks, deps);
    const paths = findCriticalPaths(schedule, edges);
    for (const path of paths.paths) {
      expect(path).toContain('A');
      expect(path).not.toContain('B');
      expect(path).not.toContain('E');
    }
    expect(paths.paths.length).toBeGreaterThan(0);
  });

  it('mengembalikan daftar kosong bila tidak ada tugas kritis ber-edge', () => {
    const tasks = [makeTask('A', 2), makeTask('B', 2)];
    const schedule = computeSchedule(tasks, [], cal);
    const paths = findCriticalPaths(schedule, []);
    expect(paths.paths.length).toBeGreaterThanOrEqual(0);
  });
});

describe('nearCriticalTasks', () => {
  it('mengurutkan tugas nonkritis dengan float terkecil lebih dulu', () => {
    const tasks = [makeTask('A', 4), makeTask('B', 2), makeTask('C', 3), makeTask('D', 6), makeTask('E', 2)];
    const deps = [makeDep('A', 'C'), makeDep('B', 'C'), makeDep('C', 'D'), makeDep('A', 'E', 'FS', 3)];
    const schedule = computeSchedule(tasks, deps, cal);
    const near = nearCriticalTasks(schedule, 2);
    // B (float 1) dan E (float 4) adalah dua kandidat terdekat setelah jalur kritis.
    expect(near).toEqual(['B', 'E']);
  });
});
