/**
 * Util struktur pohon tugas (tugas induk & subtugas) untuk tabel dan Gantt Chart.
 */
import type { Task } from '../types';

export interface TaskTreeNode {
  task: Task;
  depth: number;
  children: Task[];
}

/** Membangun pohon tugas dari daftar datar (diurutkan: induk lalu anak sesuai urutan input). */
export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenMap = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const list = childrenMap.get(task.parentId) ?? [];
    list.push(task);
    childrenMap.set(task.parentId, list);
  }

  const nodes: TaskTreeNode[] = [];
  const walk = (task: Task, depth: number) => {
    const children = childrenMap.get(task.id) ?? [];
    nodes.push({ task, depth, children });
    for (const child of children) walk(child, depth + 1);
  };

  for (const root of childrenMap.get(null) ?? []) {
    if (byId.has(root.id)) walk(root, 0);
  }
  // Tugas yatim (induknya terhapus) tetap ditampilkan di akhir daftar.
  const visited = new Set(nodes.map((node) => node.task.id));
  for (const task of tasks) {
    if (!visited.has(task.id)) nodes.push({ task, depth: 0, children: [] });
  }
  return nodes;
}

/**
 * Meratakan pohon menjadi baris tabel/Gantt menghormati status dilipat.
 * Tugas induk yang dilipat menyembunyikan seluruh subtugasnya.
 */
export function flattenTaskTree(
  tasks: Task[],
  collapsed: ReadonlySet<string>,
): { task: Task; depth: number; hasChildren: boolean; isCollapsed: boolean }[] {
  const rows: { task: Task; depth: number; hasChildren: boolean; isCollapsed: boolean }[] = [];
  const childrenMap = new Map<string | null, Task[]>();
  for (const task of tasks) {
    const list = childrenMap.get(task.parentId) ?? [];
    list.push(task);
    childrenMap.set(task.parentId, list);
  }
  const walk = (task: Task, depth: number) => {
    const children = childrenMap.get(task.id) ?? [];
    const isCollapsed = collapsed.has(task.id);
    rows.push({ task, depth, hasChildren: children.length > 0, isCollapsed });
    if (!isCollapsed) {
      for (const child of children) walk(child, depth + 1);
    }
  };
  for (const root of childrenMap.get(null) ?? []) walk(root, 0);
  const visited = new Set(rows.map((row) => row.task.id));
  for (const task of tasks) {
    if (!visited.has(task.id)) rows.push({ task, depth: 0, hasChildren: false, isCollapsed: false });
  }
  return rows;
}

/** Mencari tugas induk paling atas dari sebuah tugas. */
export function rootAncestorOf(task: Task, byId: Map<string, Task>): Task {
  let current = task;
  const guard = new Set<string>();
  while (current.parentId && !guard.has(current.id)) {
    guard.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}
