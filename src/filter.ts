import type { FilterResult, ServerEntry, SortMode } from "./types.ts";

export function fuzzyScore(query: string, target: string): number | null {
  const trimmed = query.trim().toLowerCase();
  const haystack = target.toLowerCase();

  if (!trimmed) {
    return 0;
  }

  let queryIndex = 0;
  let score = 0;
  let streak = 0;

  for (let index = 0; index < haystack.length; index += 1) {
    const char = haystack[index];
    if (char !== trimmed[queryIndex]) {
      streak = 0;
      continue;
    }

    score += 8;
    if (index === 0 || /[\s:/_.-]/.test(haystack[index - 1] ?? "")) {
      score += 6;
    }
    if (haystack.slice(index, index + trimmed.length) === trimmed) {
      score += 12;
    }
    if (streak > 0) {
      score += streak * 5;
    }

    streak += 1;
    queryIndex += 1;
    if (queryIndex === trimmed.length) {
      break;
    }
  }

  if (queryIndex !== trimmed.length) {
    return null;
  }

  return score - Math.max(0, haystack.length - trimmed.length) * 0.05;
}

export function shouldShowByDefault(entry: ServerEntry): boolean {
  return (entry.isRelevantService && entry.serviceType !== "system") || entry.probe?.state === "success";
}

export function filterAndSortEntries(
  entries: ServerEntry[],
  selectedId: string | null,
  query: string,
  showAll: boolean,
  sortMode: SortMode,
): FilterResult {
  const visibleEntries = showAll ? entries : entries.filter(shouldShowByDefault);
  const queryText = query.trim();

  const filtered = visibleEntries
    .map((entry) => ({
      entry,
      matchScore: scoreEntryAgainstQuery(entry, queryText),
    }))
    .filter(({ matchScore }) => queryText.length === 0 || matchScore !== null)
    .sort((left, right) => compareEntries(left.entry, right.entry, left.matchScore, right.matchScore, sortMode));

  const sortedEntries = filtered.map(({ entry }) => entry);
  const resolvedSelectedId = resolveSelectedId(sortedEntries, selectedId);

  return {
    entries: sortedEntries,
    selectedId: resolvedSelectedId,
  };
}

export function cycleSortMode(current: SortMode): SortMode {
  switch (current) {
    case "relevance":
      return "port";
    case "port":
      return "process";
    case "process":
      return "relevance";
  }
}

function scoreEntryAgainstQuery(entry: ServerEntry, query: string): number | null {
  if (!query) {
    return 0;
  }

  const fields = [
    `${entry.displayHost}:${entry.port}`,
    entry.processName,
    entry.command,
    entry.serviceType,
    entry.serviceLabel,
    entry.endpoint,
    entry.framework ?? "",
    String(entry.pid),
  ];

  let bestScore: number | null = null;
  for (const field of fields) {
    const score = fuzzyScore(query, field);
    if (score === null) {
      continue;
    }

    if (bestScore === null || score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

function compareEntries(
  left: ServerEntry,
  right: ServerEntry,
  leftMatchScore: number | null,
  rightMatchScore: number | null,
  sortMode: SortMode,
): number {
  if ((leftMatchScore ?? 0) !== (rightMatchScore ?? 0)) {
    return (rightMatchScore ?? 0) - (leftMatchScore ?? 0);
  }

  switch (sortMode) {
    case "port":
      return left.port - right.port || comparePid(left, right);
    case "process":
      return left.processName.localeCompare(right.processName) || left.port - right.port || comparePid(left, right);
    case "relevance":
      return compareRelevance(left, right);
  }
}

function compareRelevance(left: ServerEntry, right: ServerEntry): number {
  const leftProbeScore = left.probe?.state === "success" ? 1 : 0;
  const rightProbeScore = right.probe?.state === "success" ? 1 : 0;
  const leftRelevantScore = left.isRelevantService ? 1 : 0;
  const rightRelevantScore = right.isRelevantService ? 1 : 0;
  const leftHttpScore = left.hasHttpUi ? 1 : 0;
  const rightHttpScore = right.hasHttpUi ? 1 : 0;

  return (
    rightRelevantScore - leftRelevantScore ||
    right.devScore - left.devScore ||
    rightProbeScore - leftProbeScore ||
    rightHttpScore - leftHttpScore ||
    left.port - right.port ||
    comparePid(left, right)
  );
}

function comparePid(left: ServerEntry, right: ServerEntry): number {
  return normalizePid(left.pid) - normalizePid(right.pid);
}

function normalizePid(pid: number | null): number {
  return pid ?? Number.MAX_SAFE_INTEGER;
}

function resolveSelectedId(entries: ServerEntry[], selectedId: string | null): string | null {
  if (entries.length === 0) {
    return null;
  }

  if (selectedId && entries.some((entry) => entry.id === selectedId)) {
    return selectedId;
  }

  return entries[0]?.id ?? null;
}
