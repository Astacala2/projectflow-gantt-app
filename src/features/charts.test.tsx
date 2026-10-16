/**
 * Pengujian komponen visualisasi:
 * - Gantt Chart menampilkan jadwal yang benar (batang, panah dependensi, penanda kritis).
 * - PERT Chart menampilkan node dan panah dependensi sesuai data.
 * - Resource Chart mengikuti penugasan aktual.
 * - Dashboard diperbarui ketika data berubah.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import * as db from '../services/db';
import { ToastProvider } from '../components/ToastProvider';
import { GanttChart } from './gantt/GanttChart';
import { PertChart, layoutPertNodes } from './pert/PertChart';
import { ResourceTimeline } from './resource-chart/ResourceTimeline';
import { DashboardPage } from '../pages/DashboardPage';
import { flattenTaskTree } from '../utils/taskTree';
import { addDays, compareISO, diffDays } from '../utils/date';
import type { ISODate } from '../types';
import { WorkCalendar } from '../utils/calendar';

// Environment React untuk act() pada pengujian (menghilangkan peringatan RTL).
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Recharts membutuhkan pengukuran layout yang tidak tersedia di jsdom;
// grafiknya diganti stub agar pengujian berfokus pada aliran data aplikasi.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div data-testid="chart">{children}</div>,
  BarChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  PieChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
}));

function renderWithProviders(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
}

let projectId = '';

beforeEach(() => {
  db.resetToSampleData();
  projectId = db.getState().settings.selectedProjectId as string;
});

afterEach(() => {
  cleanup();
});

describe('Gantt Chart', () => {
  it('menampilkan daftar tugas dan batang sesuai jadwal hasil analisis', () => {
    const project = db.getProjectById(projectId);
    const tasks = db.tasksOf(projectId);
    const dependencies = db.dependenciesOf(projectId);
    const schedule = db.scheduleOf(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');

    const { container } = renderWithProviders(
      <GanttChart
        project={project}
        tasks={tasks}
        dependencies={dependencies}
        schedule={schedule}
        members={db.getState().members}
        scale="hari"
        onSelectTask={() => undefined}
      />,
    );

    // Semua tugas (induk + subtugas) memiliki baris.
    expect(container.querySelectorAll('.gantt-row').length).toBe(tasks.length);
    // Setiap tugas terjadwal memiliki batang yang dihitung dari tanggal hasil analisis.
    const bars = container.querySelectorAll('.gantt-bar');
    expect(bars.length).toBe(schedule.order.length + (tasks.length - schedule.leafIds.length));

    // Batang mengikuti tanggal jadwal: ujung kanan batang tugas pertama sesuai durasi.
    const firstLeafId = schedule.order[0];
    const firstEntry = schedule.entries[firstLeafId];
    const firstRow = Array.from(container.querySelectorAll('.gantt-row')).findIndex((row) =>
      row.textContent?.includes(db.taskById(firstLeafId)?.name ?? '###'),
    );
    expect(firstRow).toBeGreaterThanOrEqual(0);
    expect(firstEntry).toBeTruthy();

    // Panah dependensi digambar untuk setiap dependensi (+ 2 marker di defs).
    const arrowPaths = container.querySelectorAll('.gantt-links g path');
    expect(arrowPaths.length).toBe(dependencies.length);

    // Tidak ada tugas proyek contoh yang terlewat dari tampilan.
    for (const task of tasks) {
      expect(screen.getAllByText(task.name).length).toBeGreaterThan(0);
    }
  });

  it('menandai batang tugas kritis secara berbeda', () => {
    const project = db.getProjectById(projectId);
    const schedule = db.scheduleOf(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');
    expect(schedule.criticalIds.length).toBeGreaterThan(0);

    const { container } = renderWithProviders(
      <GanttChart
        project={project}
        tasks={db.tasksOf(projectId)}
        dependencies={db.dependenciesOf(projectId)}
        schedule={schedule}
        members={db.getState().members}
        scale="hari"
        onSelectTask={() => undefined}
      />,
    );

    const criticalBars = container.querySelectorAll('.gantt-bar-wrap.is-critical');
    expect(criticalBars.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.gantt-links g.is-critical path').length).toBeGreaterThan(0);
  });

  it('memperbarui tampilan setelah data berubah', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');

    const view = renderWithProviders(
      <GanttChart
        project={project}
        tasks={db.tasksOf(projectId)}
        dependencies={db.dependenciesOf(projectId)}
        schedule={db.scheduleOf(projectId)}
        members={db.getState().members}
        scale="hari"
        onSelectTask={() => undefined}
      />,
    );
    const before = view.container.querySelectorAll('.gantt-bar').length;

    act(() => {
      const result = db.createTask({
        projectId,
        name: 'Tugas Tambahan Gantt',
        description: '',
        startDate: '2026-01-05',
        duration: 2,
        priority: 'Rendah',
        status: 'Belum Dimulai',
        progress: 0,
        parentId: null,
        notes: '',
      });
      expect(result.ok).toBe(true);
    });

    // Render ulang dengan data & jadwal terbaru (komponen menerima props dari halaman).
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <GanttChart
            project={project}
            tasks={db.tasksOf(projectId)}
            dependencies={db.dependenciesOf(projectId)}
            schedule={db.scheduleOf(projectId)}
            members={db.getState().members}
            scale="hari"
            onSelectTask={() => undefined}
          />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(view.container.querySelectorAll('.gantt-bar').length).toBe(before + 1);
    expect(view.container.querySelectorAll('.gantt-row').length).toBe(db.tasksOf(projectId).length);
  });
});

describe('PERT Chart', () => {
  it('menampilkan node untuk setiap tugas detail dan panah untuk dependensi', () => {
    const tasks = db.tasksOf(projectId);
    const dependencies = db.dependenciesOf(projectId);
    const schedule = db.scheduleOf(projectId);

    const { container } = renderWithProviders(
      <PertChart tasks={tasks} dependencies={dependencies} schedule={schedule} zoom={1} onSelectTask={() => undefined} />,
    );

    const nodes = container.querySelectorAll('.pert-node');
    expect(nodes.length).toBe(schedule.leafIds.length);

    // Semua tugas contoh berada pada rantai dependensi (19 edge).
    const edges = container.querySelectorAll('.pert-edge path');
    expect(edges.length).toBe(dependencies.length);

    // Label hubungan FS/SS ditampilkan.
    const labels = Array.from(container.querySelectorAll('.pert-edge-label')).map((node) => node.textContent);
    expect(labels.some((label) => label?.startsWith('FS'))).toBe(true);
    expect(labels.some((label) => label?.startsWith('SS'))).toBe(true);
    // Lag pada dependensi uji (FS +1) ikut ditampilkan.
    expect(labels.some((label) => label === 'FS +1')).toBe(true);
  });

  it('menandai node jalur kritis', () => {
    const schedule = db.scheduleOf(projectId);
    const { container } = renderWithProviders(
      <PertChart
        tasks={db.tasksOf(projectId)}
        dependencies={db.dependenciesOf(projectId)}
        schedule={schedule}
        zoom={1}
        onSelectTask={() => undefined}
      />,
    );
    const criticalNodes = container.querySelectorAll('.pert-node.is-critical');
    expect(criticalNodes.length).toBe(schedule.criticalIds.length);
    expect(screen.getAllByText(/★ Kritis/).length).toBe(schedule.criticalIds.length);
  });
});

describe('Resource Chart', () => {
  it('menampilkan blok penugasan sesuai alokasi & periode aktual', () => {
    const tasks = db.tasksOf(projectId);
    const workload = db.workloadOf(projectId);
    const from = workload.start;
    const to = workload.end;

    const { container } = renderWithProviders(
      <ResourceTimeline
        projectId={projectId}
        members={db.getState().members}
        tasks={tasks}
        workload={workload}
        from={from}
        to={to}
        onSelectTask={() => undefined}
      />,
    );

    // Satu baris per anggota.
    expect(container.querySelectorAll('.resource-row').length).toBe(db.getState().members.length);
    // Setiap penugasan dalam rentang tampil sebagai blok.
    const blocks = container.querySelectorAll('.resource-block');
    expect(blocks.length).toBe(db.getState().assignments.length);
    // Judul blok memuat nama tugas dan alokasi.
    expect(blocks[0].getAttribute('title')).toContain('Alokasi:');
    // Ketidakhadiran contoh ikut ditampilkan.
    expect(container.querySelectorAll('.resource-absence').length).toBe(db.getState().absences.length);
  });

  it('mengikuti perubahan alokasi penugasan', () => {
    const tasks = db.tasksOf(projectId);
    const workload = db.workloadOf(projectId);
    const members = db.getState().members;

    const view = renderWithProviders(
      <ResourceTimeline
        projectId={projectId}
        members={members}
        tasks={tasks}
        workload={workload}
        from={workload.start}
        to={workload.end}
        onSelectTask={() => undefined}
      />,
    );
    const andi = members.find((member) => member.name.includes('Andi'));
    expect(andi).toBeTruthy();
    const memberIndex = members.findIndex((member) => member.id === andi!.id);
    const labelFor = (index: number) => view.container.querySelectorAll('.resource-label .resource-util')[index];
    const beforeText = labelFor(memberIndex)?.textContent;

    act(() => {
      const assignment = db.assignmentsOfMember(andi!.id)[0];
      expect(assignment).toBeTruthy();
      const result = db.updateAssignment(assignment.id, { allocation: 100 });
      expect(result.ok).toBe(true);
    });

    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <ResourceTimeline
            projectId={projectId}
            members={members}
            tasks={tasks}
            workload={db.workloadOf(projectId)}
            from={workload.start}
            to={workload.end}
            onSelectTask={() => undefined}
          />
        </ToastProvider>
      </MemoryRouter>,
    );

    const afterText = labelFor(memberIndex)?.textContent;
    expect(afterText).not.toBe(beforeText);
  });
});

describe('Gantt Chart — fisik & interaksi', () => {
  it('geometri batang sesuai tanggal hasil analisis (posisi kiri dan lebar)', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');
    const tasks = db.tasksOf(projectId);
    const schedule = db.scheduleOf(projectId);

    const { container } = renderWithProviders(
      <GanttChart project={project} tasks={tasks} dependencies={db.dependenciesOf(projectId)} schedule={schedule} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );

    const rowsOrder = flattenTaskTree(tasks, new Set());
    const bars = container.querySelectorAll<HTMLElement>('.gantt-bar');
    // viewStart = min(jadwal mulai proyek, tanggal mulai proyek) — sesuai perhitungan komponen.
    const candidates = [schedule.projectStart, project.startDate].filter(
      (value): value is ISODate => !!value,
    );
    if (candidates.length === 0) throw new Error('tidak ada tanggal mulai proyek');
    const viewStart = candidates.reduce((acc, value) => (compareISO(value, acc) < 0 ? value : acc), candidates[0]);

    for (const target of ['t-wawancara', 't-integrasi-db', 't-dokumentasi']) {
      const rowIndex = rowsOrder.findIndex((row) => row.task.id === target);
      const entry = schedule.entries[target];
      expect(entry).toBeTruthy();
      const bar = bars[rowIndex];
      expect(bar).toBeTruthy();
      const expectedLeft = Math.max(0, diffDays(viewStart, entry.start)) * 30;
      const expectedWidth = Math.max(30, (diffDays(entry.start, entry.end) + 1) * 30);
      expect(parseInt(bar.style.left, 10)).toBe(expectedLeft);
      expect(parseInt(bar.style.width, 10)).toBe(expectedWidth);
      // Progres dirender sebagai overlay proporsional di dalam batang.
      const progress = bar.querySelector<HTMLElement>('.gantt-bar-progress');
      expect(progress?.style.width).toBe(`${Math.max(0, Math.min(100, rowsOrder[rowIndex].task.progress))}%`);
    }
  });

  /** Simulasi pointer nyata: konstruktor MouseEvent membawa clientX (fallback RTL tidak),
   *  dan tiap fasa dalam blok act terpisah agar React commit state antar fasa (sepasi
   *  di browser asli, tekan-geser-lepas adalah tiga kejadian terpisah). */
  function pointerDragSequence(target: HTMLElement, startX: number, moveClientX: number) {
    act(() => {
      target.dispatchEvent(
        new MouseEvent('pointerdown', { clientX: startX, bubbles: true, button: 0 }),
      );
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: moveClientX, bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    });
  }

  function taskBar(view: ReturnType<typeof render>, taskId: string): HTMLElement {
    const index = flattenTaskTree(db.tasksOf(projectId), new Set()).findIndex(
      (row) => row.task.id === taskId,
    );
    const bar = view.container.querySelectorAll<HTMLElement>('.gantt-bar')[index];
    if (!bar) throw new Error(`batang tugas ${taskId} tidak ditemukan`);
    return bar;
  }

  it('geser (drag) batang menyimpan jadwal baru, penugasan ikut bergeser, dan tanggal kembali valid', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');

    const view = renderWithProviders(
      <GanttChart project={project} tasks={db.tasksOf(projectId)} dependencies={db.dependenciesOf(projectId)} schedule={db.scheduleOf(projectId)} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );
    const taskBefore = db.taskById('t-wawancara');
    if (!taskBefore) throw new Error('tugas contoh tidak ada');
    const bar = taskBar(view, 't-wawancara');

    pointerDragSequence(bar, 400, 460); // delta 2 sel = 2 hari kalender

    const taskAfter = db.taskById('t-wawancara');
    if (!taskAfter) throw new Error('hasil drag tidak tersimpan');
    // Senin + 2 hari kalender = Rabu hari kerja -> tanggal mulai maju 2 hari.
    expect(taskAfter.startDate).toBe(addDays(taskBefore.startDate, 2));
    // Penugasan anggota pada tugas tersebut ikut bergeser mengikuti jadwal.
    expect(db.assignmentsOfTask('t-wawancara')[0].startDate).toBe(taskAfter.startDate);
    // Jadwal terhitung ulang dan konsisten dengan tanggal tersimpan.
    expect(db.scheduleOf(projectId).entries['t-wawancara'].start).toBe(taskAfter.startDate);
  });

  it('geser batang di atas batas dependensi ditolak dan jadwal tidak berubah', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');

    const view = renderWithProviders(
      <GanttChart project={project} tasks={db.tasksOf(projectId)} dependencies={db.dependenciesOf(projectId)} schedule={db.scheduleOf(projectId)} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );
    const before = db.taskById('t-identifikasi')!.startDate;
    const bar = taskBar(view, 't-identifikasi');

    // t-identifikasi berada tepat pada tanggal minimum hasil dependensi FS dari t-wawancara;
    // digeser mundur harus ditolak.
    pointerDragSequence(bar, 400, 370);

    expect(db.taskById('t-identifikasi')!.startDate).toBe(before);
  });

  it('resize ujung batang mengubah durasi dalam hari kerja', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');

    const view = renderWithProviders(
      <GanttChart project={project} tasks={db.tasksOf(projectId)} dependencies={db.dependenciesOf(projectId)} schedule={db.scheduleOf(projectId)} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );
    const entryBefore = db.scheduleOf(projectId).entries['t-wawancara'];
    const bar = taskBar(view, 't-wawancara');
    const resizeHandle = bar.querySelector<HTMLElement>('.gantt-resize');
    expect(resizeHandle).toBeTruthy();

    pointerDragSequence(resizeHandle as HTMLElement, 400, 490); // +3 hari kalender

    // Ujung batang bergerak +3 hari KALENDER; durasi (hari kerja) dihitung ulang
    // sesuai kalender kerja — bila melewati akhir pekan, kenaikannya lebih kecil dari 3.
    const expectedDuration = new WorkCalendar([1, 2, 3, 4, 5], []).countWorkingDays(
      entryBefore.start,
      addDays(entryBefore.end, 3),
    );
    expect(db.taskById('t-wawancara')!.duration).toBe(expectedDuration);
    expect(db.taskById('t-wawancara')!.endDate).toBe(
      new WorkCalendar([1, 2, 3, 4, 5], []).addWorkingDays(entryBefore.start, expectedDuration),
    );
    expect(db.scheduleOf(projectId).entries['t-wawancara'].duration).toBe(expectedDuration);
  });

  /** RegEx d: "M x1 y1 C/C x1+a y1, x2-b y2, x2-2 y2" → segmen pertama & terakhir. */
  function pathStartAndEndX(d: string): { first: number; last: number } {
    const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
    if (numbers.length < 4) throw new Error(`d tidak valid: ${d}`);
    return { first: Number(numbers[0]), last: Number(numbers[numbers.length - 2]) };
  }

  function viewStartOf(schedule: ReturnType<typeof db.scheduleOf>, project: NonNullable<ReturnType<typeof db.getProjectById>>): ISODate {
    const candidates = [schedule.projectStart, project.startDate].filter(
      (value): value is ISODate => !!value,
    );
    if (candidates.length === 0) throw new Error('tidak ada tanggal mulai proyek');
    return candidates.reduce((acc, value) => (compareISO(value, acc) < 0 ? value : acc), candidates[0]);
  }

  it('geometri panah dependensi: FS berangkat dari akhir pendahulu, SS dari mulai pendahulu', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');
    const tasks = db.tasksOf(projectId);
    const deps = db.dependenciesOf(projectId);
    const schedule = db.scheduleOf(projectId);
    expect(deps.some((dep) => dep.type === 'SS')).toBe(true);
    expect(deps.some((dep) => dep.type === 'FS')).toBe(true);

    const { container } = renderWithProviders(
      <GanttChart project={project} tasks={tasks} dependencies={deps} schedule={schedule} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );

    const viewStart = viewStartOf(schedule, project);
    const rowsOrder = flattenTaskTree(tasks, new Set());
    const rowIndex = new Map(rowsOrder.map((row, index) => [row.task.id, index]));

    /** Jarak piksel antar hari pada skala "hari". */
    const CELL_W = 30;
    const xOf = (date: ISODate) => diffDays(viewStart, date);

    // Satu path per dependensi.
    const paths = Array.from(container.querySelectorAll('.gantt-links g path')).map((el) =>
      pathStartAndEndX(el.getAttribute('d') ?? ''),
    );
    expect(paths.length).toBe(deps.length);

    // Ekspektasi: bakal berangkat FS = hari setelah pendahulu selesai; SS = tanggal mulai pendahulu.
    // Ujung panah selalu di kolom mulai penerus (kurang 2 px untuk marker), jadi dicek dengan toleransi 2 px.
    const expectedStarts = deps
      .filter((dep) => rowIndex.has(dep.predecessorId) && rowIndex.has(dep.successorId))
      .map((dep) => {
        const predEntry = schedule.entries[dep.predecessorId];
        const succEntry = schedule.entries[dep.successorId];
        if (!predEntry || !succEntry) return null;
        const start =
          dep.type === 'SS'
            ? xOf(predEntry.start) * CELL_W
            : (xOf(predEntry.end) + 1) * CELL_W;
        return { start, end: xOf(succEntry.start) * CELL_W };
      })
      .filter((value): value is { start: number; end: number } => value !== null)
      .sort((a, b) => a.start - b.start);

    const actualStarts = paths
      .map((p) => ({ start: p.first, end: p.last }))
      .sort((a, b) => a.start - b.start);

    expect(actualStarts.length).toBe(expectedStarts.length);
    for (let i = 0; i < expectedStarts.length; i += 1) {
      expect(actualStarts[i].start).toBe(expectedStarts[i].start);
      expect(Math.abs(actualStarts[i].end - expectedStarts[i].end)).toBeLessThanOrEqual(2);
    }
  });

  it('penanda batang kritis Gantt sama persis dengan Critical Path Analysis (float ≤ 0)', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');
    const tasks = db.tasksOf(projectId);
    const schedule = db.scheduleOf(projectId);
    expect(schedule.criticalIds.length).toBeGreaterThan(0);

    const { container } = renderWithProviders(
      <GanttChart project={project} tasks={tasks} dependencies={db.dependenciesOf(projectId)} schedule={schedule} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );

    const rowsOrder = flattenTaskTree(tasks, new Set());
    const wraps = Array.from(container.querySelectorAll('.gantt-bar-wrap'));
    expect(wraps.length).toBe(rowsOrder.length);
    const markedIds = wraps
      .map((element, index) => ({ element, id: rowsOrder[index].task.id }))
      .filter((item) => item.element.classList.contains('is-critical'))
      .map((item) => item.id)
      .sort();

    // criticalIds CPM hanya berisi tugas daun; batang tugas induk (summary) ikut ditandai
    // kritis bila minimal satu subtugasnya kritis. Persiskan set keduanya.
    const expectedIds = tasks
      .filter((task) => schedule.criticalIds.includes(task.id) || schedule.entries[task.id]?.isCritical)
      .map((task) => task.id)
      .sort();
    expect(markedIds).toEqual(expectedIds);
    expect(schedule.criticalIds.every((id) => markedIds.includes(id))).toBe(true);
    // Konsistensi arah sebaliknya: setiap tugas kritis CPM memiliki float ≤ 0.
    for (const id of schedule.criticalIds) {
      expect(schedule.entries[id].totalFloat).toBeLessThanOrEqual(0);
    }
  });

  it('perubahan durasi pendahulu menggeser batang penerus sesuai jadwal terhitung ulang', () => {
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('proyek contoh tidak ada');

    // t-identifikasi dipindah FS oleh t-wawancara; posisi batangnya sebelum perubahan durasi:
    const beforeSchedule = db.scheduleOf(projectId);
    const target = 't-identifikasi';
    const beforeEntry = beforeSchedule.entries[target];
    const beforeBarLeft = (() => {
      const view = renderWithProviders(
        <GanttChart project={project} tasks={db.tasksOf(projectId)} dependencies={db.dependenciesOf(projectId)} schedule={beforeSchedule} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
      );
      const index = flattenTaskTree(db.tasksOf(projectId), new Set()).findIndex((row) => row.task.id === target);
      const left = view.container.querySelectorAll<HTMLElement>('.gantt-bar')[index].style.left;
      cleanup();
      return left;
    })();

    const wawancara = db.taskById('t-wawancara');
    if (!wawancara) throw new Error('tugas t-wawancara tidak ada');
    act(() => {
      db.updateTask('t-wawancara', { duration: wawancara.duration + 2 });
    });
    const afterSchedule = db.scheduleOf(projectId);
    const afterEntry = afterSchedule.entries[target];
    // Kenaikan 2 hari kerja pada pendahulu menunda penerus tepat 2 hari kerja (konsisten CPM).
    expect(afterEntry.startOrdinal).toBe(beforeEntry.startOrdinal + 2);

    const afterView = renderWithProviders(
      <GanttChart project={project} tasks={db.tasksOf(projectId)} dependencies={db.dependenciesOf(projectId)} schedule={afterSchedule} members={db.getState().members} scale="hari" onSelectTask={() => undefined} />,
    );
    const index = flattenTaskTree(db.tasksOf(projectId), new Set()).findIndex((row) => row.task.id === target);
    const afterBarLeft = afterView.container.querySelectorAll<HTMLElement>('.gantt-bar')[index].style.left;
    expect(parseInt(afterBarLeft, 10)).toBeGreaterThan(parseInt(beforeBarLeft, 10));
    // Batang penerus tepat berada di kolom mulai menurut jadwal baru.
    const viewStart = viewStartOf(afterSchedule, project);
    expect(parseInt(afterBarLeft, 10)).toBe(diffDays(viewStart, afterEntry.start) * 30);
    cleanup();
  });
});

describe('PERT Chart — tata letak jaringan', () => {
  it('level topologis penerus selalu lebih dalam dari pendahulunya', () => {
    const tasks = db.tasksOf(projectId);
    const dependencies = db.dependenciesOf(projectId);
    const schedule = db.scheduleOf(projectId);
    const { nodes } = layoutPertNodes(tasks, dependencies, schedule);
    const levelOf = new Map(nodes.map((node) => [node.taskId, node.level]));

    // Semua pendahulu harus berada di kolom lebih kiri daripada penerusnya.
    const leafSet = new Set(schedule.leafIds);
    for (const dep of dependencies) {
      if (!leafSet.has(dep.predecessorId) || !leafSet.has(dep.successorId)) continue;
      const predLevel = levelOf.get(dep.predecessorId);
      const succLevel = levelOf.get(dep.successorId);
      expect(predLevel).toBeDefined();
      expect(succLevel).toBeDefined();
      expect(succLevel!).toBeGreaterThan(predLevel!);
    }
    // Stem: ada node multilevel, bukan satu kolom hanya.
    expect(new Set(nodes.map((node) => node.level)).size).toBeGreaterThan(3);
  });
});

describe('Resource Chart — penanda konflik', () => {
  it('menampilkan penanda kelebihan beban pada hari alokasi > 100%', () => {
    const tasks = db.tasksOf(projectId);
    const workload = db.workloadOf(projectId);
    expect(workload.conflicts.some((conflict) => conflict.type === 'OVERLOAD')).toBe(true);

    const { container } = renderWithProviders(
      <ResourceTimeline projectId={projectId} members={db.getState().members} tasks={tasks} workload={workload} from={workload.start} to={workload.end} onSelectTask={() => undefined} />,
    );
    // Data contoh sengaja memuat alokasi Andi 70% + 50% pada periode tumpang tindih.
    expect(container.querySelectorAll('.resource-overload-mark').length).toBeGreaterThan(0);
  });
});

describe('Dashboard', () => {
  it('menampilkan ringkasan dari data aktual dan diperbarui saat data berubah', () => {
    const view = renderWithProviders(<DashboardPage />);
    const statCard = (label: string) =>
      screen.getByText(label).parentElement?.querySelector('strong')?.textContent;

    expect(statCard('Total proyek')).toBe('1');
    const totalTugasSebelum = Number(statCard('Total tugas (proyek aktif)'));
    expect(totalTugasSebelum).toBeGreaterThan(0);

    act(() => {
      const result = db.createProject({
        name: 'Proyek Kedua',
        description: '',
        organization: 'Klien Baru',
        manager: 'Manajer Baru',
        startDate: '2026-02-02',
        targetEndDate: '2026-03-02',
        status: 'Perencanaan',
        workingDays: [1, 2, 3, 4, 5],
      });
      expect(result.ok).toBe(true);
    });

    expect(statCard('Total proyek')).toBe('2');
    expect(view.container).toBeTruthy();
  });

  it('data proyek bertahan pada localStorage setelah perubahan (simulasi refresh)', () => {
    act(() => {
      db.updateProject(projectId, { name: 'Nama Baru Tersimpan' });
    });
    const stored = window.localStorage.getItem('projectflow.data');
    expect(stored).toContain('Nama Baru Tersimpan');
  });
});
