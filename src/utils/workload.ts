/**
 * Perhitungan beban kerja sumber daya (resource workload).
 * Beban dihitung dari alokasi penugasan aktual yang aktif pada suatu tanggal,
 * bukan sekadar jumlah tugas.
 */
import type { Absence, Assignment, ISODate, Member, Task } from '../types';
import { compareISO, diffDays, eachDay } from './date';

export interface WorkloadSlot {
  assignmentId: string;
  taskId: string;
  taskName: string;
  role: string;
  allocation: number;
  start: ISODate;
  end: ISODate;
}

export interface MemberDayLoad {
  date: ISODate;
  /** Total alokasi kapasitas anggota pada tanggal ini (100 = kapasitas penuh). */
  totalAllocation: number;
  slots: WorkloadSlot[];
  absent: boolean;
  absenceReason: string | null;
  overloaded: boolean;
  weekend: boolean;
}

export type WorkloadConflictType = 'OVERLOAD' | 'ABSENCE' | 'INACTIVE_MEMBER';

export interface WorkloadConflict {
  type: WorkloadConflictType;
  memberId: string;
  memberName: string;
  taskId?: string;
  taskName?: string;
  assignmentId?: string;
  dates: ISODate[];
  peakAllocation?: number;
  message: string;
}

export interface MemberWorkload {
  member: Member;
  days: MemberDayLoad[];
  overloadedDates: ISODate[];
  absenceDates: ISODate[];
  /** Puncak alokasi dalam persen kapasitas. */
  peakAllocation: number;
  /** Rata-rata alokasi sepanjang rentang (tingkat pemanfaatan). */
  utilization: number;
  assignedTaskIds: string[];
  /** Estimasi biaya sepanjang rentang (hanya bila diaktifkan). */
  estimatedCost: number;
  /** Hari tanpa penugasan sama sekali. */
  idleDates: ISODate[];
}

export interface WorkloadSummary {
  start: ISODate;
  end: ISODate;
  days: ISODate[];
  byMember: Record<string, MemberWorkload>;
  conflicts: WorkloadConflict[];
  unassignedMemberIds: string[];
}

export interface WorkloadOptions {
  members: Member[];
  tasks: Task[];
  assignments: Assignment[];
  absences: Absence[];
  start: ISODate;
  end: ISODate;
  /** Aktifkan perhitungan estimasi biaya dari tarif anggota. */
  costEnabled?: boolean;
  /** Menandai hari libur/akhir pekan (opsional). */
  isNonWorkingDay?: (date: ISODate) => boolean;
}

function groupConsecutive(dates: ISODate[]): ISODate[][] {
  const sorted = [...dates].sort(compareISO);
  const groups: ISODate[][] = [];
  let current: ISODate[] = [];
  for (const date of sorted) {
    if (current.length === 0) {
      current = [date];
      continue;
    }
    const prev = current[current.length - 1];
    if (diffDays(prev, date) === 1) current.push(date);
    else {
      groups.push(current);
      current = [date];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Menghitung beban kerja seluruh anggota pada rentang tanggal tertentu. */
export function computeWorkload(options: WorkloadOptions): WorkloadSummary {
  const { members, tasks, assignments, absences, start, end, costEnabled = true } = options;
  const days = compareISO(start, end) <= 0 ? eachDay(start, end) : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const conflicts: WorkloadConflict[] = [];
  const byMember: Record<string, MemberWorkload> = {};
  const assignedMemberIds = new Set<string>();

  for (const member of members) {
    const memberAssignments = assignments.filter((a) => a.memberId === member.id);
    const memberAbsences = absences.filter((a) => a.memberId === member.id);
    const memberDays: MemberDayLoad[] = [];
    const assignedTaskIds = new Set<string>();
    let peak = 0;
    let totalAllocationSum = 0;
    let workingDayCount = 0;
    let estimatedCost = 0;

    for (const date of days) {
      const slots: WorkloadSlot[] = [];
      for (const assignment of memberAssignments) {
        if (compareISO(assignment.startDate, date) <= 0 && compareISO(date, assignment.endDate) <= 0) {
          const task = taskById.get(assignment.taskId);
          slots.push({
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskName: task?.name ?? '(tugas dihapus)',
            role: assignment.role,
            allocation: assignment.allocation,
            start: assignment.startDate,
            end: assignment.endDate,
          });
          assignedTaskIds.add(assignment.taskId);
        }
      }
      const totalAllocation = slots.reduce((sum, slot) => sum + slot.allocation, 0);
      const absence = memberAbsences.find(
        (a) => compareISO(a.startDate, date) <= 0 && compareISO(date, a.endDate) <= 0,
      );
      const weekend = options.isNonWorkingDay ? options.isNonWorkingDay(date) : false;
      if (!weekend) {
        workingDayCount += 1;
        totalAllocationSum += totalAllocation;
      }
      if (totalAllocation > 0) peak = Math.max(peak, totalAllocation);

      // Estimasi biaya hanya berlaku pada hari kerja (akhir pekan & libur tidak dihitung).
      if (costEnabled && member.rate > 0 && totalAllocation > 0 && !weekend) {
        const dayCost =
          member.rateUnit === 'jam'
            ? member.rate * member.dailyCapacity * (totalAllocation / 100)
            : member.rate * (totalAllocation / 100);
        estimatedCost += dayCost;
      }

      memberDays.push({
        date,
        totalAllocation,
        slots,
        absent: !!absence,
        absenceReason: absence?.reason ?? null,
        overloaded: totalAllocation > 100,
        weekend,
      });
    }

    for (const group of groupConsecutive(
      memberDays.filter((d) => d.overloaded).map((d) => d.date),
    )) {
      const peakInGroup = Math.max(
        ...memberDays.filter((d) => group.includes(d.date)).map((d) => d.totalAllocation),
      );
      conflicts.push({
        type: 'OVERLOAD',
        memberId: member.id,
        memberName: member.name,
        dates: group,
        peakAllocation: peakInGroup,
        message: `Beban kerja ${member.name} mencapai ${peakInGroup}% kapasitas pada ${group[0]} s.d. ${group[group.length - 1]} (lebih dari 100%).`,
      });
    }

    for (const absence of memberAbsences) {
      const overlapping = memberAssignments.filter(
        (a) =>
          compareISO(a.startDate, absence.endDate) <= 0 &&
          compareISO(absence.startDate, a.endDate) <= 0,
      );
      for (const assignment of overlapping) {
        const task = taskById.get(assignment.taskId);
        const overlapStart = compareISO(assignment.startDate, absence.startDate) > 0 ? assignment.startDate : absence.startDate;
        const overlapEnd = compareISO(assignment.endDate, absence.endDate) < 0 ? assignment.endDate : absence.endDate;
        conflicts.push({
          type: 'ABSENCE',
          memberId: member.id,
          memberName: member.name,
          taskId: assignment.taskId,
          taskName: task?.name ?? '(tugas dihapus)',
          assignmentId: assignment.id,
          dates: eachDay(overlapStart, overlapEnd),
          message: `${member.name} memiliki penugasan "${task?.name ?? '-'}" pada saat ketidakhadiran (${absence.reason}, ${absence.startDate} - ${absence.endDate}).`,
        });
      }
    }

    if (!member.active) {
      for (const assignment of memberAssignments) {
        const task = taskById.get(assignment.taskId);
        conflicts.push({
          type: 'INACTIVE_MEMBER',
          memberId: member.id,
          memberName: member.name,
          taskId: assignment.taskId,
          taskName: task?.name ?? '(tugas dihapus)',
          assignmentId: assignment.id,
          dates: eachDay(assignment.startDate, assignment.endDate).filter((d) =>
            memberAbsences.every(
              (a) => !(compareISO(a.startDate, d) <= 0 && compareISO(d, a.endDate) <= 0),
            ),
          ),
          message: `${member.name} berstatus nonaktif tetapi masih ditugaskan pada "${task?.name ?? '-'}".`,
        });
      }
    }

    const idleDates = memberDays
      .filter((d) => d.totalAllocation === 0 && !d.absent && !d.weekend)
      .map((d) => d.date);

    byMember[member.id] = {
      member,
      days: memberDays,
      overloadedDates: memberDays.filter((d) => d.overloaded).map((d) => d.date),
      absenceDates: memberDays.filter((d) => d.absent).map((d) => d.date),
      peakAllocation: peak,
      utilization: workingDayCount > 0 ? Math.round(totalAllocationSum / workingDayCount) : 0,
      assignedTaskIds: [...assignedTaskIds],
      estimatedCost: Math.round(estimatedCost),
      idleDates,
    };

    if (memberAssignments.length > 0) assignedMemberIds.add(member.id);
  }

  const unassignedMemberIds = members
    .filter((m) => !assignedMemberIds.has(m.id))
    .map((m) => m.id);

  return { start, end, days, byMember, conflicts, unassignedMemberIds };
}

/** Total alokasi anggota pada satu tanggal (untuk tooltip/hover). */
export function allocationOnDate(workload: MemberWorkload, date: ISODate): MemberDayLoad | null {
  return workload.days.find((d) => d.date === date) ?? null;
}

/** Ringkasan beban kerja untuk satu anggota pada seluruh proyek. */
export function memberTaskList(
  memberId: string,
  assignments: Assignment[],
  tasks: Task[],
): { task: Task; assignment: Assignment }[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return assignments
    .filter((a) => a.memberId === memberId)
    .map((a) => ({ assignment: a, task: taskById.get(a.taskId) }))
    .filter((pair): pair is { task: Task; assignment: Assignment } => !!pair.task)
    .sort((a, b) => compareISO(a.task.startDate, b.task.startDate));
}
