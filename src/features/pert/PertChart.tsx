/**
 * PERT Chart / Network Diagram.
 *
 * Node = tugas detail (tugas daun), panah = dependensi FS/SS dengan lag.
 * Tata letak memakai kolom berdasarkan tingkat (level) topologis sehingga
 * arah jaringan selalu kiri → kanan dan mudah dibaca. Seluruh posisi dihitung
 * dari data dependensi aktual, bukan gambar statis.
 */
import { useMemo } from 'react';
import type { Dependency, Task } from '../../types';
import type { ScheduleResult } from '../../utils/schedule';
import { buildChildrenMap, leafTaskIds } from '../../utils/schedule';

const NODE_W = 230;
const NODE_H = 96;
const GAP_X = 110;
const GAP_Y = 26;

export interface PertChartProps {
  tasks: Task[];
  dependencies: Dependency[];
  schedule: ScheduleResult;
  zoom: number;
  onSelectTask: (taskId: string) => void;
  selectedTaskId?: string | null;
}

interface PositionedNode {
  taskId: string;
  task: Task;
  x: number;
  y: number;
  level: number;
}

/** Menghitung tata letak node PERT berdasarkan level topologis. */
export function layoutPertNodes(
  tasks: Task[],
  dependencies: Dependency[],
  schedule: ScheduleResult,
): { nodes: PositionedNode[]; width: number; height: number } {
  const leaves = leafTaskIds(tasks);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const networkIds = tasks.filter((task) => leaves.has(task.id)).map((task) => task.id);

  const predsOf = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (!leaves.has(dep.predecessorId) || !leaves.has(dep.successorId)) {
      // Dependensi pada tugas induk diwakili oleh tugas daunnya (lihat expandDependencies).
      continue;
    }
    predsOf.set(dep.successorId, [...(predsOf.get(dep.successorId) ?? []), dep.predecessorId]);
  }

  // Level = jarak dependensi terpanjang dari sumber.
  const levelOf = new Map<string, number>();
  const visitLevel = (id: string, guard: Set<string>): number => {
    const cached = levelOf.get(id);
    if (cached !== undefined) return cached;
    if (guard.has(id)) return 0;
    guard.add(id);
    const preds = predsOf.get(id) ?? [];
    const level = preds.length === 0 ? 0 : Math.max(...preds.map((pred) => visitLevel(pred, guard) + 1));
    levelOf.set(id, level);
    return level;
  };
  for (const id of networkIds) visitLevel(id, new Set());

  const maxLevel = Math.max(0, ...networkIds.map((id) => levelOf.get(id) ?? 0));
  const columns: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const id of networkIds) {
    columns[levelOf.get(id) ?? 0].push(id);
  }

  // Urutkan dalam kolom mengikuti urutan jadwal agar silang panah minimal.
  const orderIndex = new Map(schedule.order.map((id, index) => [id, index]));
  for (const column of columns) {
    column.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  }

  const nodes: PositionedNode[] = [];
  let maxRows = 0;
  columns.forEach((column, level) => {
    maxRows = Math.max(maxRows, column.length);
    column.forEach((taskId, rowIndex) => {
      const task = byId.get(taskId);
      if (!task) return;
      nodes.push({
        taskId,
        task,
        level,
        x: 24 + level * (NODE_W + GAP_X),
        y: 24 + rowIndex * (NODE_H + GAP_Y),
      });
    });
  });

  return {
    nodes,
    width: 24 + (maxLevel + 1) * (NODE_W + GAP_X) + 24,
    height: 24 + Math.max(1, maxRows) * (NODE_H + GAP_Y) + 24,
  };
}

/** Diagram jaringan tugas (PERT) dengan node interaktif dan penanda jalur kritis. */
export function PertChart({ tasks, dependencies, schedule, zoom, onSelectTask, selectedTaskId }: PertChartProps) {
  const { nodes, width, height } = useMemo(
    () => layoutPertNodes(tasks, dependencies, schedule),
    [tasks, dependencies, schedule],
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.taskId, node])), [nodes]);
  const childrenMap = useMemo(() => buildChildrenMap(tasks), [tasks]);
  const leaves = useMemo(() => leafTaskIds(tasks), [tasks]);

  // Representasi tugas induk pada diagram: satu node agregat di kolom paling awal? Tidak —
  // jaringan memakai tugas daun; dependensi yang menunjuk induk dipecah ke anaknya.
  const leafDescendants = (taskId: string): string[] =>
    leaves.has(taskId)
      ? [taskId]
      : (childrenMap.get(taskId) ?? []).flatMap((child) => leafDescendants(child.id));

  const edges = dependencies.flatMap((dep) => {
    const preds = leafDescendants(dep.predecessorId);
    const succs = leafDescendants(dep.successorId);
    return preds.flatMap((pred) =>
      succs.map((succ) => ({ ...dep, from: pred, to: succ, key: `${dep.id}-${pred}-${succ}` })),
    );
  });

  return (
    <div className="pert-wrap">
      <div className="pert-canvas" style={{ width: width * zoom, height: height * zoom }}>
        <div className="pert-inner" style={{ width, height, transform: `scale(${zoom})` }}>
          <svg className="pert-edges" width={width} height={height}>
            <defs>
              <marker id="pert-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" fill="#1d4ed8" />
              </marker>
              <marker id="pert-arrow-critical" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" fill="#dc2626" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const fromEntry = schedule.entries[edge.from];
              const toEntry = schedule.entries[edge.to];
              const criticalEdge = fromEntry?.isCritical && toEntry?.isCritical;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_H / 2;
              const c = Math.max(40, (x2 - x1) / 2);
              const d = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
              const label = `${edge.type}${edge.lag ? ` +${edge.lag}` : ''}`;                return (
                  <g key={edge.key} className={criticalEdge ? 'pert-edge is-critical' : 'pert-edge'}>
                    <path
                      d={d}
                      fill="none"
                      stroke={criticalEdge ? '#dc2626' : '#1d4ed8'}
                      strokeWidth={criticalEdge ? 2.2 : 1.4}
                      markerEnd={`url(#${criticalEdge ? 'pert-arrow-critical' : 'pert-arrow'})`}
                    >
                      <title>{edge.type === 'FS' ? 'Finish to Start' : 'Start to Start'}{edge.lag ? `, lag ${edge.lag} hari kerja` : ''}</title>
                    </path>
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 7}
                      textAnchor="middle"
                      className={`pert-edge-label ${criticalEdge ? 'is-critical' : ''}`}
                    >
                      {label}
                    </text>
                  </g>
                );
            })}
          </svg>

          {nodes.map((node) => {
            const entry = schedule.entries[node.taskId];
            const critical = entry?.isCritical;
            const selected = selectedTaskId === node.taskId;
            return (
              <button
                key={node.taskId}
                type="button"
                className={`pert-node ${critical ? 'is-critical' : ''} ${selected ? 'is-selected' : ''}`}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                onClick={() => onSelectTask(node.taskId)}
              >
                <span className="pert-node-name" title={node.task.name}>
                  {node.task.name}
                </span>
                <span className="pert-node-meta">
                  <span className="pert-chip">{entry ? entry.duration : node.task.duration} hr</span>
                  <span className="pert-chip">{node.task.progress}%</span>
                  <span className={`pert-chip ${node.task.status === 'Selesai' ? 'is-done' : ''}`}>{node.task.status}</span>
                </span>
                <span className="pert-node-dates">
                  {entry ? `${entry.start} → ${entry.end}` : 'Terjadwal otomatis'}
                </span>
                <span className={`pert-node-flag ${critical ? 'is-critical' : ''}`}>
                  {critical ? '★ Kritis' : entry ? `Float ${entry.totalFloat} hr` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
