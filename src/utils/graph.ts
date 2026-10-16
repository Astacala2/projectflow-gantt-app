/**
 * Util graf orientasional untuk jaringan tugas (node = tugas, edge = dependensi).
 */

export interface GraphEdge {
  from: string;
  to: string;
}

/** Membangun adjacency map dari daftar node dan edge. */
export function buildAdjacency(nodeIds: string[], edges: GraphEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) {
    const list = adjacency.get(edge.from);
    if (list && !list.includes(edge.to)) list.push(edge.to);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
  }
  return adjacency;
}

/**
 * Menemukan satu siklus (berupa daftar node berurutan yang kembali ke node pertama).
 * Mengembalikan null jika graf acyclic.
 */
export function findCycle(nodeIds: string[], edges: GraphEdge[]): string[] | null {
  const adjacency = buildAdjacency(nodeIds, edges);
  const state = new Map<string, 0 | 1 | 2>(); // 0 = belum, 1 = di jalur, 2 = selesai
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    state.set(node, 1);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        const index = stack.indexOf(next);
        return [...stack.slice(index), next];
      }
      if (nextState === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };

  for (const id of nodeIds) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Topological sort (Kahn). `cycleIds` berisi node yang terlibat atau terpengaruh siklus
 * sehingga dapat dikecualikan dari perhitungan.
 */
export function topoSort(
  nodeIds: string[],
  edges: GraphEdge[],
): { order: string[]; cycleIds: string[] } {
  const cycle = findCycle(nodeIds, edges);
  if (cycle) {
    const cycleSet = new Set(cycle);
    // Node yang berada di siklus tidak dapat diurutkan.
    return { order: [], cycleIds: [...cycleSet] };
  }

  const indegree = new Map<string, number>();
  const adjacency = buildAdjacency(nodeIds, edges);
  for (const id of adjacency.keys()) indegree.set(id, 0);
  for (const edge of edges) {
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = [...(indegree.entries() ?? [])]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  return { order, cycleIds: [] };
}

/** True jika ada jalur orientasional dari `from` ke `to`. */
export function hasPath(edges: GraphEdge[], from: string, to: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const visited = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}
