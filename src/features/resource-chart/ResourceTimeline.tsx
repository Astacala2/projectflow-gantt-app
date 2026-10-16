/**
 * Resource Chart — visualisasi beban kerja anggota tim sepanjang waktu proyek.
 *
 * Baris = anggota, sumbu waktu = tanggal. Setiap penugasan tampil sebagai blok
 * pada periodenya dengan alokasi kerja; periode ketidahiran tampil sebagai blok
 * bergaris; hari dengan total alokasi > 100% kapasitas ditandai sebagai konflik.
 */
import { useMemo } from 'react';
import type { ISODate, Member, Task } from '../../types';
import type { WorkloadSummary, MemberWorkload } from '../../utils/workload';
import { addDays, compareISO, diffDays, eachDay, formatDayNameID, todayISO } from '../../utils/date';
import { absencesOfMember, assignmentsOfMember, calendarOf } from '../../services/db';

const LANE_H = 22;

export interface ResourceTimelineProps {
  projectId: string;
  members: Member[];
  tasks: Task[];
  workload: WorkloadSummary;
  from: ISODate;
  to: ISODate;
  onSelectTask: (taskId: string) => void;
}

interface Lane {
  start: ISODate;
  end: ISODate;
}

function assignLanes<T extends Lane>(items: T[]): { lanes: T[][]; count: number } {
  const sorted = [...items].sort((a, b) => compareISO(a.start, b.start));
  const lanes: T[][] = [];
  for (const item of sorted) {
    const lane = lanes.find((candidates) =>
      candidates.every((existing) => compareISO(item.start, existing.end) > 0),
    );
    if (lane) lane.push(item);
    else lanes.push([item]);
  }
  return { lanes, count: Math.max(1, lanes.length) };
}

/** Timeline beban kerja sumber daya. */
export function ResourceTimeline({ projectId, members, tasks, workload, from, to, onSelectTask }: ResourceTimelineProps) {
  const calendar = useMemo(() => calendarOf(projectId), [projectId, workload.start, workload.end]);
  const days = useMemo(() => (compareISO(from, to) <= 0 ? eachDay(from, to) : []), [from, to]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const today = todayISO();
  const cellW = days.length > 90 ? 10 : days.length > 45 ? 14 : 20;
  const dayIndexOf = (date: ISODate) => diffDays(from, date);

  const rows = members.map((member) => {
    const memberWorkload: MemberWorkload | undefined = workload.byMember[member.id];
    const assignments = assignmentsOfMember(member.id)
      .filter((assignment) => taskById.has(assignment.taskId))
      .filter((assignment) => compareISO(assignment.startDate, to) <= 0 && compareISO(from, assignment.endDate) <= 0)
      .map((assignment) => ({
        id: assignment.id,
        taskId: assignment.taskId,
        start: assignment.startDate < from ? from : assignment.startDate,
        end: assignment.endDate > to ? to : assignment.endDate,
        allocation: assignment.allocation,
        taskName: taskById.get(assignment.taskId)?.name ?? '(tugas dihapus)',
      }));
    const absences = absencesOfMember(member.id)
      .filter((absence) => compareISO(absence.startDate, to) <= 0 && compareISO(from, absence.endDate) <= 0)
      .map((absence) => ({
        id: absence.id,
        start: absence.startDate < from ? from : absence.startDate,
        end: absence.endDate > to ? to : absence.endDate,
        reason: absence.reason,
      }));
    const { lanes, count } = assignLanes(assignments);
    const overloadDates = new Set(memberWorkload?.overloadedDates ?? []);
    const rowHeight = Math.max(52, count * LANE_H + 26);
    return { member, memberWorkload, lanes, absences, overloadDates, rowHeight };
  });

  const height = rows.reduce((sum, row) => sum + row.rowHeight, 0);

  return (
    <div className="resource-chart">
      <div className="resource-labels">
        <div className="resource-labels-header">Anggota tim</div>
        {rows.map(({ member, memberWorkload, rowHeight }) => (
          <div key={member.id} className="resource-label" style={{ height: rowHeight }}>
            <strong>{member.name}</strong>
            <small>{member.role}</small>
            <span className={`resource-util ${memberWorkload && memberWorkload.utilization > 100 ? 'is-over' : ''}`}>
              Utilisasi {memberWorkload?.utilization ?? 0}%
            </span>
          </div>
        ))}
      </div>

      <div className="resource-scroll">
        <div className="resource-canvas" style={{ width: days.length * cellW, minWidth: '100%' }}>
          <div className="resource-header">
            {days.map((day) => {
              const nonWorking = !calendar.isWorkingDay(day);
              const showLabel = cellW >= 14 ? day.slice(8) === '01' || day.slice(8) === '15' : day.slice(8) === '01';
              return (
                <div
                  key={day}
                  className={`resource-day ${nonWorking ? 'is-nonworking' : ''}`}
                  style={{ width: cellW }}
                  title={`${formatDayNameID(day)} ${day}`}
                >
                  {showLabel ? <span>{day.slice(8)}</span> : null}
                </div>
              );
            })}
          </div>

          <div className="resource-body" style={{ height }}>
            {/* Garis latar per baris */}
            {rows.map(({ member, rowHeight }, rowIndex) => {
              const top = rows.slice(0, rowIndex).reduce((sum, row) => sum + row.rowHeight, 0);
              return (
                <div key={`bg-${member.id}`} className="resource-row-bg" style={{ top, height: rowHeight }}>
                  {days.map((day) => {
                    const nonWorking = !calendar.isWorkingDay(day);
                    return (
                      <div
                        key={day}
                        className={`resource-cell ${nonWorking ? 'is-nonworking' : ''}`}
                        style={{ left: dayIndexOf(day) * cellW, width: cellW }}
                      />
                    );
                  })}
                </div>
              );
            })}

            {rows.map(({ member, lanes, absences, overloadDates, rowHeight }, rowIndex) => {
              const top = rows.slice(0, rowIndex).reduce((sum, row) => sum + row.rowHeight, 0);
              return (
                <div key={member.id} className="resource-row" style={{ top, height: rowHeight }}>
                  {lanes.map((lane, laneIndex) =>
                    lane.map((item) => {
                      const left = dayIndexOf(item.start) * cellW;
                      const width = Math.max(cellW, (diffDays(item.start, item.end) + 1) * cellW);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`resource-block ${item.allocation > 100 ? 'is-over' : ''}`}
                          style={{ left, width, top: 4 + laneIndex * LANE_H, height: LANE_H - 4 }}
                          onClick={() => onSelectTask(item.taskId)}
                          title={`${item.taskName}\nAlokasi: ${item.allocation}% kapasitas\n${item.start} → ${item.end}`}
                        >
                          <span>{width > 60 ? `${item.taskName} · ${item.allocation}%` : `${item.allocation}%`}</span>
                        </button>
                      );
                    }),
                  )}

                  {absences.map((absence) => (
                    <div
                      key={absence.id}
                      className="resource-absence"
                      style={{
                        left: dayIndexOf(absence.start) * cellW,
                        width: Math.max(cellW, (diffDays(absence.start, absence.end) + 1) * cellW),
                        top: rowHeight - 12,
                      }}
                      title={`Ketidakhadiran: ${absence.reason}\n${absence.start} → ${absence.end}`}
                    />
                  ))}

                  {[...overloadDates].map((date) =>
                    compareISO(date, from) >= 0 && compareISO(date, to) <= 0 ? (
                      <div
                        key={`over-${date}`}
                        className="resource-overload-mark"
                        style={{ left: dayIndexOf(date) * cellW, width: cellW, top: 0, height: 4 }}
                        title={`Alokasi melebihi kapasitas pada ${date}`}
                      />
                    ) : null,
                  )}
                </div>
              );
            })}

            {today >= from && today <= to ? (
              <div className="resource-today" style={{ left: dayIndexOf(today) * cellW }} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper perluasan rentang tugas agar filter tanggal mudah dipakai di halaman. */
export function expandRange(start: ISODate, end: ISODate, days: number): { from: ISODate; to: ISODate } {
  return { from: addDays(start, -days), to: addDays(end, days) };
}
