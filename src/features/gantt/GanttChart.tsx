/**
 * Gantt Chart interaktif.
 *
 * Dibangun sendiri dengan HTML/CSS + overlay SVG agar seluruh kebutuhan fitur
 * terpenuhi secara dinamis: batang sesuai jadwal hasil engine (hari kerja),
 * progres pada batang, panah dependensi FS/SS + lag, penanda tugas kritis,
 * skala harian/mingguan/bulanan, serta drag (geser jadwal) dan resize (ubah durasi)
 * yang divalidasi terhadap aturan dependensi.
 *
 * Library Gantt pihak ketiga umumnya hanya mendukung FS tanpa lag dan tanpa
 * penandaan jalur kritis, sehingga implementasi sendiri dipilih agar konsisten
 * dengan hasil analisis jalur kritis aplikasi.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dependency, GanttScale, ISODate, Member, Project, Task } from '../../types';
import type { ScheduleResult } from '../../utils/schedule';
import { earliestAllowedStart } from '../../utils/schedule';
import { flattenTaskTree } from '../../utils/taskTree';
import { addDays, compareISO, diffDays, eachDay, formatDayNameID, formatDateShortID, toISO, todayISO } from '../../utils/date';
import * as db from '../../services/db';
import { useToast } from '../../components/ToastProvider';

const ROW_H = 34;
const HEADER_MONTH_H = 26;
const HEADER_WEEK_H = 24;
const HEADER_DAY_H = 22;

const CELL_WIDTH: Record<GanttScale, number> = { hari: 30, minggu: 14, bulan: 6 };

export interface GanttChartProps {
  project: Project;
  tasks: Task[];
  dependencies: Dependency[];
  schedule: ScheduleResult;
  members: Member[];
  scale: GanttScale;
  onSelectTask: (taskId: string) => void;
  /** Dipanggil setelah jadwal diubah lewat interaksi (untuk pesan notifikasi). */
  onScheduleChanged?: () => void;
}

interface DragState {
  taskId: string;
  mode: 'move' | 'resize';
  originX: number;
  deltaDays: number;
  originalStart: ISODate;
  originalEnd: ISODate;
}

/** Header bulan, minggu, dan hari untuk garis waktu. */
function buildTimeline(viewStart: ISODate, viewEnd: ISODate, scale: GanttScale) {
  const days = eachDay(viewStart, viewEnd);
  const months: { label: string; span: number }[] = [];
  const weeks: { label: string; span: number }[] = [];
  const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  let currentMonth = '';
  let monthSpan = 0;
  let currentWeek = '';
  let weekSpan = 0;
  for (const day of days) {
    const [year, month] = day.split('-');
    const monthKey = `${year}-${month}`;
    if (monthKey !== currentMonth) {
      if (currentMonth !== '') months.push({ label: `${MONTHS_ID[Number(currentMonth.slice(5)) - 1]} ${currentMonth.slice(0, 4)}`, span: monthSpan });
      currentMonth = monthKey;
      monthSpan = 0;
    }
    monthSpan += 1;

    // Minggu dikelompokkan mulai Senin.
    const date = new Date(`${day}T00:00:00`);
    const monday = new Date(date);
    const offset = (date.getDay() + 6) % 7;
    monday.setDate(date.getDate() - offset);
    const weekKey = toISO(monday);
    if (weekKey !== currentWeek) {
      if (currentWeek !== '') weeks.push({ label: scale === 'hari' ? `M ${currentWeek.slice(8)}/${currentWeek.slice(5, 7)}` : `M ${currentWeek.slice(8)}/${currentWeek.slice(5, 7)}`, span: weekSpan });
      currentWeek = weekKey;
      weekSpan = 0;
    }
    weekSpan += 1;
  }
  if (currentMonth !== '') months.push({ label: `${MONTHS_ID[Number(currentMonth.slice(5)) - 1]} ${currentMonth.slice(0, 4)}`, span: monthSpan });
  if (currentWeek !== '') weeks.push({ label: `M ${currentWeek.slice(8)}/${currentWeek.slice(5, 7)}`, span: weekSpan });

  return { days, months, weeks };
}

/** Gantt Chart proyek dengan daftar tugas di kiri dan garis waktu di kanan. */
export function GanttChart({
  project,
  tasks,
  dependencies,
  schedule,
  members,
  scale,
  onSelectTask,
  onScheduleChanged,
}: GanttChartProps) {
  const { push } = useToast();
  const calendar = useMemo(() => db.calendarOf(project.id), [project.id, tasks, dependencies]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const viewStart = useMemo(() => {
    const candidates = [schedule.projectStart, project.startDate].filter(Boolean) as ISODate[];
    return candidates.reduce((acc, value) => (compareISO(value, acc) < 0 ? value : acc), candidates[0] ?? todayISO());
  }, [schedule.projectStart, project.startDate]);

  const viewEnd = useMemo(() => {
    const candidates = [schedule.projectFinish, project.targetEndDate, todayISO()].filter(
      (value): value is ISODate => !!value,
    );
    if (candidates.length === 0) return addDays(viewStart, 30);
    const max = candidates.reduce((acc, value) => (compareISO(value, acc) > 0 ? value : acc), candidates[0]);
    return addDays(max, 7);
  }, [schedule.projectFinish, project.targetEndDate, viewStart]);

  const cellW = CELL_WIDTH[scale];
  const rows = useMemo(() => flattenTaskTree(tasks, collapsed), [tasks, collapsed]);
  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.task.id, index));
    return map;
  }, [rows]);

  const { days, months, weeks } = useMemo(() => buildTimeline(viewStart, viewEnd, scale), [viewStart, viewEnd, scale]);
  const gridWidth = days.length * cellW;
  const dayIndexOf = (date: ISODate) => diffDays(viewStart, date);
  const today = todayISO();

  // --- Interaksi geser (drag) & ubah durasi (resize) ---
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return undefined;
    const onPointerMove = (event: PointerEvent) => {
      const delta = Math.round((event.clientX - drag.originX) / cellW);
      setDrag((current) => (current ? { ...current, deltaDays: delta } : current));
    };
    const onPointerUp = () => {
      const finished = dragRef.current;
      setDrag(null);
      if (finished && finished.deltaDays !== 0) applyDrag(finished);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, cellW, tasks, dependencies]);

  const applyDrag = (current: DragState) => {
    const task = tasks.find((item) => item.id === current.taskId);
    if (!task) return;

    if (current.mode === 'move') {
      const rawStart = addDays(current.originalStart, current.deltaDays);
      const newStart = calendar.isWorkingDay(rawStart) ? rawStart : calendar.nextWorkingDay(rawStart);
      const minStart = earliestAllowedStart(task.id, tasks, dependencies, calendar);
      if (minStart && compareISO(newStart, minStart) < 0) {
        push(
          `Jadwal "${task.name}" tidak dapat digeser sebelum ${minStart} karena batasan dependensinya.`,
          'error',
        );
        return;
      }
      const shift = diffDays(current.originalStart, newStart);
      const result = db.updateTask(task.id, { startDate: newStart });
      if (!result.ok) {
        push(result.error, 'error');
        return;
      }
      // Geser penugasan anggota mengikuti pergeseran jadwal tugas.
      for (const assignment of db.assignmentsOfTask(task.id)) {
        db.updateAssignment(assignment.id, {
          startDate: addDays(assignment.startDate, shift),
          endDate: addDays(assignment.endDate, shift),
        });
      }
      push(`Jadwal "${task.name}" dipindah ke ${newStart}.`, 'success');
      onScheduleChanged?.();
      return;
    }

    // Resize: ubah durasi berdasar ujung kanan batang.
    const rawEnd = addDays(current.originalEnd, current.deltaDays);
    const newEnd = compareISO(rawEnd, current.originalStart) < 0
      ? current.originalStart
      : calendar.previousWorkingDay(rawEnd);
    const newDuration = calendar.countWorkingDays(current.originalStart, newEnd);
    if (newDuration < 1) {
      push('Durasi tugas minimal 1 hari kerja.', 'error');
      return;
    }
    const result = db.updateTask(task.id, { duration: newDuration });
    if (!result.ok) {
      push(result.error, 'error');
      return;
    }
    // Tugas yang memanjang boleh menarik penugasannya; yang memendek perlu ditinjau manual.
    for (const assignment of db.assignmentsOfTask(task.id)) {
      if (compareISO(assignment.endDate, newEnd) > 0) {
        if (compareISO(assignment.startDate, newEnd) <= 0) {
          db.updateAssignment(assignment.id, { endDate: newEnd });
        } else {
          push(
            `Penugasan pada "${task.name}" berada di luar rentang tugas baru. Tinjau ulang penugasan tersebut.`,
            'error',
          );
        }
      }
    }
    push(`Durasi "${task.name}" kini ${newDuration} hari kerja.`, 'success');
    onScheduleChanged?.();
  };

  const toggleCollapse = (taskId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const memberNamesOf = (taskId: string) =>
    db
      .assignmentsOfTask(taskId)
      .map((assignment) => members.find((member) => member.id === assignment.memberId)?.name ?? '')
      .filter(Boolean);

  const depsBySuccessor = useMemo(() => {
    const map = new Map<string, Dependency[]>();
    for (const dep of dependencies) {
      map.set(dep.successorId, [...(map.get(dep.successorId) ?? []), dep]);
    }
    return map;
  }, [dependencies]);

  const dragPreview = (task: Task) => {
    if (!drag || drag.taskId !== task.id) return null;
    const entry = schedule.entries[task.id];
    if (!entry) return null;
    const start = drag.mode === 'move' ? addDays(entry.start, drag.deltaDays) : entry.start;
    const end = drag.mode === 'move' ? addDays(entry.end, drag.deltaDays) : addDays(entry.end, drag.deltaDays);
    return { start, end };
  };

  const scrollList = (event: React.UIEvent<HTMLDivElement>) => {
    if (gridRef.current) gridRef.current.scrollTop = event.currentTarget.scrollTop;
  };
  const scrollGrid = (event: React.UIEvent<HTMLDivElement>) => {
    if (listRef.current) listRef.current.scrollTop = event.currentTarget.scrollTop;
  };

  const timelineWidth = gridWidth;
  const headerHeight = HEADER_MONTH_H + HEADER_WEEK_H + (scale === 'hari' ? HEADER_DAY_H : 0);

  return (
    <div className="gantt">
      <div className="gantt-list" ref={listRef} onScroll={scrollList}>
        <div className="gantt-list-header" style={{ height: headerHeight }}>
          <span>Nama tugas</span>
          <span>Durasi</span>
        </div>
        <div className="gantt-list-body">
          {rows.map((row) => {
            const entry = schedule.entries[row.task.id];
            const critical = entry?.isCritical;
            return (
              <div
                key={row.task.id}
                className={`gantt-row ${critical ? 'gantt-row-critical' : ''}`}
                style={{ height: ROW_H, paddingLeft: 8 + row.depth * 16 }}
                onClick={() => onSelectTask(row.task.id)}
                title={row.task.name}
              >
                {row.hasChildren ? (
                  <button
                    type="button"
                    className="gantt-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCollapse(row.task.id);
                    }}
                    aria-label={row.isCollapsed ? 'Buka subtugas' : 'Lipat subtugas'}
                  >
                    {row.isCollapsed ? '▸' : '▾'}
                  </button>
                ) : (
                  <span className="gantt-toggle-placeholder" />
                )}
                <span className={`gantt-name ${row.task.parentId ? 'is-subtask' : ''}`}>{row.task.name}</span>
                <span className="gantt-duration">{entry ? `${entry.duration} hr` : `${row.task.duration} hr`}</span>
              </div>
            );
          })}
          {rows.length === 0 ? <p className="gantt-empty">Belum ada tugas pada proyek ini.</p> : null}
        </div>
      </div>

      <div className="gantt-grid-scroll" ref={gridRef} onScroll={scrollGrid}>
        <div className="gantt-grid" style={{ width: timelineWidth }}>
          <div className="gantt-header" style={{ height: headerHeight }}>
            <div className="gantt-header-months" style={{ height: HEADER_MONTH_H, width: timelineWidth }}>
              {months.map((month, index) => (
                <div key={`${month.label}-${index}`} className="gantt-month" style={{ width: month.span * cellW }}>
                  {month.label}
                </div>
              ))}
            </div>
            <div className="gantt-header-weeks" style={{ height: HEADER_WEEK_H, width: timelineWidth }}>
              {weeks.map((week, index) => (
                <div key={`${week.label}-${index}`} className="gantt-week" style={{ width: week.span * cellW }}>
                  {week.span * cellW > 34 ? week.label : ''}
                </div>
              ))}
            </div>
            {scale === 'hari' ? (
              <div className="gantt-header-days" style={{ height: HEADER_DAY_H, width: timelineWidth }}>
                {days.map((day) => (
                  <div
                    key={day}
                    className={`gantt-day ${calendar.isWorkingDay(day) ? '' : 'is-nonworking'}`}
                    style={{ width: cellW }}
                    title={`${formatDayNameID(day)}, ${formatDateShortID(day)}`}
                  >
                    {day.slice(8)}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="gantt-canvas" style={{ width: timelineWidth, height: Math.max(rows.length * ROW_H, 120) }}>
            {/* Kolom akhir pekan / hari libur */}
            {days.map((day) => {
              const kind = calendar.isHoliday(day)
                ? 'is-holiday'
                : !calendar.isWorkingDay(day)
                  ? 'is-weekend'
                  : '';
              if (!kind) return null;
              return (
                <div
                  key={`bg-${day}`}
                  className={`gantt-col-bg ${kind}`}
                  style={{ left: dayIndexOf(day) * cellW, width: cellW, height: '100%' }}
                />
              );
            })}

            {/* Garis hari ini */}
            {today >= viewStart && today <= viewEnd ? (
              <div
                className="gantt-today"
                style={{ left: dayIndexOf(today) * cellW + cellW / 2, height: '100%' }}
                title={`Hari ini: ${today}`}
              />
            ) : null}

            {/* Batang tugas */}
            {rows.map((row, index) => {
              const entry = schedule.entries[row.task.id];
              if (!entry) return null;
              const preview = dragPreview(row.task);
              const start = preview ? preview.start : entry.start;
              const end = preview ? preview.end : entry.end;
              const left = Math.max(0, dayIndexOf(start)) * cellW;
              const width = Math.max(cellW, (diffDays(start, end) + 1) * cellW);
              const progressWidth = Math.max(0, Math.min(100, row.task.progress));
              const names = memberNamesOf(row.task.id);
              const predecessors = depsBySuccessor.get(row.task.id) ?? [];
              return (
                <div
                  key={`bar-${row.task.id}`}
                  className={`gantt-bar-wrap ${entry.isCritical ? 'is-critical' : ''} ${
                    drag?.taskId === row.task.id ? 'is-dragging' : ''
                  }`}
                  style={{ top: index * ROW_H + 5, height: ROW_H - 10 }}
                >
                  <div
                    className="gantt-bar"
                    style={{ left, width }}
                    onPointerDown={(event) => {
                      // Hanya tolak tombol non-utama yang menyatakan secara eksplisit.
                      if (typeof event.button === 'number' && event.button > 0) return;
                      setDrag({
                        taskId: row.task.id,
                        mode: 'move',
                        originX: event.clientX,
                        deltaDays: 0,
                        originalStart: entry.start,
                        originalEnd: entry.end,
                      });
                    }}
                    onClick={() => onSelectTask(row.task.id)}
                    title={`${row.task.name}\n${entry.start} → ${entry.end} (${entry.duration} hari kerja)\nProgres: ${row.task.progress}%\nPrioritas: ${row.task.priority}\nStatus: ${row.task.status}${
                      entry.isCritical ? '\n★ Tugas kritis (float 0)' : `\nFloat: ${entry.totalFloat} hari kerja`
                    }${names.length ? `\nAnggota: ${names.join(', ')}` : ''}${
                      predecessors.length
                        ? `\nDependensi: ${predecessors
                            .map((dep) => `${dep.type}${dep.lag ? `+${dep.lag}` : ''}`)
                            .join(', ')}`
                        : ''
                    }`}
                  >
                    <div className="gantt-bar-progress" style={{ width: `${progressWidth}%` }} />
                    <span className="gantt-bar-label">
                      {width > 90 ? `${row.task.progress}%` : ''}
                    </span>
                    <span
                      className="gantt-resize"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (typeof event.button === 'number' && event.button > 0) return;
                        setDrag({
                          taskId: row.task.id,
                          mode: 'resize',
                          originX: event.clientX,
                          deltaDays: 0,
                          originalStart: entry.start,
                          originalEnd: entry.end,
                        });
                      }}
                      title="Geser untuk mengubah durasi"
                    />
                  </div>
                </div>
              );
            })}

            {/* Panah dependensi */}
            <svg className="gantt-links" width={timelineWidth} height={Math.max(rows.length * ROW_H, 120)}>
              <defs>
                <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#1d4ed8" />
                </marker>
                <marker id="gantt-arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
                </marker>
              </defs>
              {dependencies.map((dep) => {
                const predRow = rowIndex.get(dep.predecessorId);
                const succRow = rowIndex.get(dep.successorId);
                const predEntry = schedule.entries[dep.predecessorId];
                const succEntry = schedule.entries[dep.successorId];
                if (predRow === undefined || succRow === undefined || !predEntry || !succEntry) return null;
                // Panah FS berangkat dari hari setelah pendahulu selesai (kendala pada selesai);
                // panah SS berangkat dari tanggal mulai pendahulu (kendala pada mulai).
                const x1 =
                  dep.type === 'SS'
                    ? dayIndexOf(predEntry.start) * cellW
                    : (dayIndexOf(predEntry.end) + 1) * cellW;
                const y1 = predRow * ROW_H + ROW_H / 2;
                const x2 = dayIndexOf(succEntry.start) * cellW;
                const y2 = succRow * ROW_H + ROW_H / 2;
                const isCriticalEdge = predEntry.isCritical && succEntry.isCritical;
                const bend = Math.max(x1 + 8, x2 - 12);
                const midY = (y1 + y2) / 2;
                const d =
                  x2 - x1 > 20
                    ? `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2 - 2} ${y2}`
                    : `M ${x1} ${y1} L ${bend} ${y1} L ${bend} ${midY} L ${x2 - 14} ${midY} L ${x2 - 14} ${y2} L ${x2 - 2} ${y2}`;
                return (
                  <g key={dep.id} className={isCriticalEdge ? 'is-critical' : ''}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isCriticalEdge ? '#dc2626' : '#1d4ed8'}
                      strokeWidth={isCriticalEdge ? 2 : 1.3}
                      markerEnd={`url(#${isCriticalEdge ? 'gantt-arrow-critical' : 'gantt-arrow'})`}
                    >
                      <title>{`${dep.type}${dep.lag ? ` +${dep.lag} lag` : ''}: ${predEntry ? predEntry.start : ''} → ${succEntry.start}`}</title>
                    </path>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
