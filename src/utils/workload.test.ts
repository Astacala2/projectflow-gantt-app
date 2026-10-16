import { describe, expect, it } from 'vitest';
import type { Absence, Assignment, Member, Task } from '../types';
import { computeWorkload } from './workload';

function makeMember(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    name: `Anggota ${id}`,
    email: '',
    role: 'Developer',
    skills: '',
    rate: 0,
    rateUnit: 'jam',
    dailyCapacity: 8,
    active: true,
    notes: '',
    ...overrides,
  };
}

function makeTask(id: string): Task {
  return {
    id,
    projectId: 'p1',
    name: `Tugas ${id}`,
    description: '',
    startDate: '2026-01-05',
    duration: 5,
    endDate: '2026-01-09',
    priority: 'Sedang',
    status: 'Berjalan',
    progress: 20,
    parentId: null,
    notes: '',
  };
}

function makeAssignment(id: string, taskId: string, memberId: string, allocation: number, start = '2026-01-05', end = '2026-01-09'): Assignment {
  return { id, taskId, memberId, role: 'Pelaksana', allocation, startDate: start, endDate: end, note: '' };
}

const RANGE = { start: '2026-01-05', end: '2026-01-09' };

describe('computeWorkload — alokasi & kelebihan beban', () => {
  it('menjumlahkan alokasi tugas yang tumpang tindih sebagai konflik', () => {
    const members = [makeMember('m1')];
    const tasks = [makeTask('t1'), makeTask('t2')];
    const assignments = [
      makeAssignment('a1', 't1', 'm1', 50),
      makeAssignment('a2', 't2', 'm1', 60),
    ];
    const result = computeWorkload({ members, tasks, assignments, absences: [], ...RANGE });

    const workload = result.byMember.m1;
    // Contoh spesifikasi: 50% + 60% = 110% -> potensi kelebihan beban.
    expect(workload.peakAllocation).toBe(110);
    expect(workload.overloadedDates).toHaveLength(5); // 5-9 Jan
    const overload = result.conflicts.find((conflict) => conflict.type === 'OVERLOAD');
    expect(overload).toBeTruthy();
    expect(overload?.peakAllocation).toBe(110);
  });

  it('tidak menandai konflik bila total alokasi <= 100%', () => {
    const result = computeWorkload({
      members: [makeMember('m1')],
      tasks: [makeTask('t1'), makeTask('t2')],
      assignments: [makeAssignment('a1', 't1', 'm1', 40), makeAssignment('a2', 't2', 'm1', 60)],
      absences: [],
      ...RANGE,
    });
    expect(result.conflicts.filter((conflict) => conflict.type === 'OVERLOAD')).toHaveLength(0);
    expect(result.byMember.m1.peakAllocation).toBe(100);
  });

  it('beban dihitung dari alokasi penugasan yang aktif pada tanggal tersebut', () => {
    // Kedua tugas sama-sama 100%, tetapi berbeda periode -> tidak pernah tumpang tindih.
    const result = computeWorkload({
      members: [makeMember('m1')],
      tasks: [makeTask('t1'), makeTask('t2')],
      assignments: [
        makeAssignment('a1', 't1', 'm1', 100, '2026-01-05', '2026-01-06'),
        makeAssignment('a2', 't2', 'm1', 100, '2026-01-07', '2026-01-09'),
      ],
      absences: [],
      ...RANGE,
    });
    expect(result.byMember.m1.peakAllocation).toBe(100);
    expect(result.conflicts.filter((conflict) => conflict.type === 'OVERLOAD')).toHaveLength(0);
    const jan6 = result.byMember.m1.days.find((day) => day.date === '2026-01-06');
    expect(jan6?.totalAllocation).toBe(100);
    const jan7 = result.byMember.m1.days.find((day) => day.date === '2026-01-07');
    expect(jan7?.slots.map((slot) => slot.taskId)).toEqual(['t2']);
  });

  it('menghitung utilisasi rata-rata pada hari kerja', () => {
    const result = computeWorkload({
      members: [makeMember('m1')],
      tasks: [makeTask('t1')],
      assignments: [makeAssignment('a1', 't1', 'm1', 50)],
      absences: [],
      ...RANGE,
      isNonWorkingDay: (date) => date === '2026-01-10' || date === '2026-01-11',
    });
    // Rentang hanya 5-9 Jan (semua hari kerja), alokasi 50% setiap hari.
    expect(result.byMember.m1.utilization).toBe(50);
  });
});

describe('computeWorkload — ketidakhadiran & status anggota', () => {
  it('mendeteksi penugasan yang bertabrakan dengan ketidakhadiran', () => {
    const absences: Absence[] = [
      { id: 'ab1', memberId: 'm1', startDate: '2026-01-06', endDate: '2026-01-07', reason: 'Sakit' },
    ];
    const result = computeWorkload({
      members: [makeMember('m1')],
      tasks: [makeTask('t1')],
      assignments: [makeAssignment('a1', 't1', 'm1', 100)],
      absences,
      ...RANGE,
    });
    const absenceConflict = result.conflicts.find((conflict) => conflict.type === 'ABSENCE');
    expect(absenceConflict).toBeTruthy();
    expect(absenceConflict?.taskId).toBe('t1');
    expect(absenceConflict?.dates).toEqual(['2026-01-06', '2026-01-07']);

    const workload = result.byMember.m1;
    expect(workload.absenceDates).toEqual(['2026-01-06', '2026-01-07']);
  });

  it('menandai anggota nonaktif yang masih memiliki penugasan', () => {
    const result = computeWorkload({
      members: [makeMember('m1', { active: false })],
      tasks: [makeTask('t1')],
      assignments: [makeAssignment('a1', 't1', 'm1', 100)],
      absences: [],
      ...RANGE,
    });
    expect(result.conflicts.some((conflict) => conflict.type === 'INACTIVE_MEMBER')).toBe(true);
  });

  it('mencantumkan anggota tanpa penugasan', () => {
    const result = computeWorkload({
      members: [makeMember('m1'), makeMember('m2')],
      tasks: [makeTask('t1')],
      assignments: [makeAssignment('a1', 't1', 'm1', 30)],
      absences: [],
      ...RANGE,
    });
    expect(result.unassignedMemberIds).toEqual(['m2']);
  });
});

describe('computeWorkload — estimasi biaya', () => {
  it('menghitung estimasi biaya dari tarif ketika diaktifkan', () => {
    const result = computeWorkload({
      members: [makeMember('m1', { rate: 100000, rateUnit: 'jam', dailyCapacity: 8 })],
      tasks: [makeTask('t1')],
      assignments: [makeAssignment('a1', 't1', 'm1', 50)],
      absences: [],
      ...RANGE,
      costEnabled: true,
    });
    // 5 hari × 50% × 8 jam × 100.000 = 2.000.000
    expect(result.byMember.m1.estimatedCost).toBe(2000000);
  });

  it('tidak menghitung biaya ketika fitur dinonaktifkan', () => {
    const result = computeWorkload({
      members: [makeMember('m1', { rate: 100000, rateUnit: 'jam' })],
      tasks: [makeTask('t1')],
      assignments: [makeAssignment('a1', 't1', 'm1', 50)],
      absences: [],
      ...RANGE,
      costEnabled: false,
    });
    expect(result.byMember.m1.estimatedCost).toBe(0);
  });

  it('estimasi biaya tidak dihitung pada hari libur/akhir pekan', () => {
    const result = computeWorkload({
      members: [makeMember('m1', { rate: 100000, rateUnit: 'jam', dailyCapacity: 8 })],
      tasks: [makeTask('t1')],
      // Penugasan mencakup akhir pekan (10-11 Jan) agar gate hari kerja benar-benar tereksekusi.
      assignments: [makeAssignment('a1', 't1', 'm1', 100, '2026-01-05', '2026-01-12')],
      absences: [],
      start: '2026-01-05',
      end: '2026-01-12',
      costEnabled: true,
      isNonWorkingDay: (date) => date === '2026-01-10' || date === '2026-01-11',
    });
    // Tanpa gate: 8 hari × 8 jam × 100.000 = 6.400.000; dengan gate 6 hari kerja = 4.800.000.
    expect(result.byMember.m1.estimatedCost).toBe(4800000);
  });
});
