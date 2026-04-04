import { runCommand } from "./command.ts";
import { parseProcessRelations } from "./parse.ts";
import type { ProcessRelation } from "./types.ts";

export function resolveProcessTree(rootPid: number, relations: ProcessRelation[]): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const relation of relations) {
    if (relation.ppid === null) {
      continue;
    }

    const siblings = childrenByParent.get(relation.ppid) ?? [];
    siblings.push(relation.pid);
    childrenByParent.set(relation.ppid, siblings);
  }

  const order: Array<{ pid: number; depth: number }> = [{ pid: rootPid, depth: 0 }];
  const visited = new Set<number>([rootPid]);

  for (let index = 0; index < order.length; index += 1) {
    const current = order[index];
    if (!current) {
      continue;
    }

    const children = childrenByParent.get(current.pid) ?? [];
    for (const child of children) {
      if (visited.has(child)) {
        continue;
      }

      visited.add(child);
      order.push({ pid: child, depth: current.depth + 1 });
    }
  }

  return order
    .sort((left, right) => right.depth - left.depth || right.pid - left.pid)
    .map((item) => item.pid);
}

export async function loadProcessRelations(): Promise<ProcessRelation[]> {
  const result = await runCommand(["ps", "-eo", "pid=,ppid="]);
  if (result.notFound || result.exitCode !== 0) {
    return [];
  }

  return parseProcessRelations(result.stdout);
}
