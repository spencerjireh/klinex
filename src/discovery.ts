import { networkInterfaces } from "node:os";
import { runCommand } from "./command.ts";
import { parseLsofListeners, parsePsDetails, parseSsListeners } from "./parse.ts";
import type { DevHeuristic, DiscoveryResult, ListenerRecord, ProcessInfo, ProbeProtocol, ServerEntry } from "./types.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);
const WILDCARD_HOSTS = new Set(["*", "0.0.0.0", "::", "0:0:0:0:0:0:0:0"]);
const DEV_PORT_SCORES = new Map<number, number>([
  [3000, 22],
  [3001, 14],
  [4173, 24],
  [4200, 24],
  [4321, 30],
  [5000, 12],
  [5173, 36],
  [8000, 18],
  [8080, 18],
  [8787, 20],
]);

const DEV_SIGNALS = [
  { pattern: /\bnext(?:\s+dev)?\b/i, score: 80, framework: "Next.js", reason: "Command looks like Next.js dev mode" },
  { pattern: /\bvite\b/i, score: 72, framework: "Vite", reason: "Command mentions Vite" },
  { pattern: /\bastro\b/i, score: 68, framework: "Astro", reason: "Command mentions Astro" },
  { pattern: /\bnuxt\b/i, score: 68, framework: "Nuxt", reason: "Command mentions Nuxt" },
  { pattern: /webpack(?:-dev-server)?/i, score: 56, framework: "Webpack", reason: "Command mentions Webpack dev server" },
  { pattern: /\bbun\b.*\s--hot\b/i, score: 48, framework: "Bun", reason: "Command is running Bun hot reload" },
  { pattern: /python(?:\d(?:\.\d+)?)?\s+-m\s+http\.server/i, score: 52, framework: "Python", reason: "Command is Python's local HTTP server" },
  { pattern: /manage\.py\s+runserver/i, score: 60, framework: "Django", reason: "Command is Django runserver" },
  { pattern: /\brails(?:\s+s(?:erver)?)?\b/i, score: 60, framework: "Rails", reason: "Command is Rails server mode" },
  { pattern: /\bphp\b.*\s-S\s/i, score: 48, framework: "PHP", reason: "Command is PHP's built-in web server" },
];

const NEGATIVE_SIGNALS = [
  /\bsshd\b/i,
  /\bpostgres(?:ql)?\b/i,
  /\bpostmaster\b/i,
  /\bredis-server\b/i,
  /\bmysqld\b/i,
  /\bmariadbd\b/i,
  /\bdocker-proxy\b/i,
  /\bnginx\b/i,
  /\bapache2?\b/i,
  /\bhttpd\b/i,
  /\bmemcached\b/i,
  /\bss\b/i,
];

export function normalizeHost(rawHost: string, localAddresses: Set<string>): {
  bindHost: string;
  browserHost: string;
  displayHost: string;
  isLocalReachable: boolean;
} {
  const host = canonicalizeHost(rawHost);

  if (WILDCARD_HOSTS.has(host)) {
    return {
      bindHost: host,
      browserHost: "localhost",
      displayHost: host,
      isLocalReachable: true,
    };
  }

  if (LOOPBACK_HOSTS.has(host)) {
    return {
      bindHost: host,
      browserHost: "localhost",
      displayHost: host,
      isLocalReachable: true,
    };
  }

  return {
    bindHost: host,
    browserHost: host,
    displayHost: host,
    isLocalReachable: localAddresses.has(stripZoneId(host)),
  };
}

export function formatUrl(protocol: ProbeProtocol, host: string, port: number): string {
  const needsBrackets = host.includes(":") && !host.startsWith("[");
  const safeHost = needsBrackets ? `[${host}]` : host;
  return `${protocol}://${safeHost}:${port}`;
}

export function scoreDevServer(command: string, processName: string, port: number): DevHeuristic {
  const combined = `${processName} ${command}`.trim();
  let score = 0;
  let framework: string | null = null;
  const reasons: string[] = [];

  for (const signal of DEV_SIGNALS) {
    if (!signal.pattern.test(combined)) {
      continue;
    }

    score += signal.score;
    framework ??= signal.framework;
    reasons.push(signal.reason);
  }

  const portScore = DEV_PORT_SCORES.get(port);
  if (portScore) {
    score += portScore;
    reasons.push(`Port ${port} is common for dev servers`);
  }

  if (/\b(dev|serve|preview|hot|watch)\b/i.test(combined)) {
    score += 10;
    reasons.push("Command includes a dev-mode keyword");
  }

  if (/\b(node|bun|python|ruby|php)\b/i.test(combined)) {
    score += 4;
  }

  if (port < 1024) {
    score -= 10;
  }

  if (NEGATIVE_SIGNALS.some((pattern) => pattern.test(combined))) {
    score -= 90;
    reasons.push("Looks more like a system service than a dev server");
  }

  return {
    score,
    framework,
    reasons,
  };
}

export function mergeEntryState(previousEntries: ServerEntry[], nextEntries: ServerEntry[]): ServerEntry[] {
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));

  return nextEntries.map((entry) => {
    const previous = previousById.get(entry.id);
    if (!previous) {
      return entry;
    }

    const protocol = previous.protocolHint ?? entry.protocolHint ?? "http";
    return {
      ...entry,
      probe: previous.probe,
      protocolHint: previous.protocolHint,
      browserUrl: formatUrl(protocol, entry.browserHost, entry.port),
    };
  });
}

export async function discoverServers(): Promise<DiscoveryResult> {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return {
      entries: [],
      warning: `Unsupported platform: ${process.platform}`,
    };
  }

  const localAddresses = collectLocalAddresses();
  const warnings: string[] = [];

  let listeners: ListenerRecord[] = [];
  if (process.platform === "darwin") {
    const result = await runCommand(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"]);
    if (result.notFound) {
      return { entries: [], warning: "lsof is required on macOS" };
    }

    listeners = parseLsofListeners(result.stdout);
  } else {
    const [ssResult, lsofResult] = await Promise.all([
      runCommand(["ss", "-ltnpH"]),
      runCommand(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"]),
    ]);

    const ssListeners = !ssResult.notFound && ssResult.stdout ? parseSsListeners(ssResult.stdout) : null;
    const lsofListeners = !lsofResult.notFound ? parseLsofListeners(lsofResult.stdout) : null;
    if (!ssListeners && !lsofListeners) {
      return { entries: [], warning: "Neither ss nor lsof is installed" };
    }

    if (ssListeners?.missingProcessCount) {
      warnings.push("Some Linux listeners could not be identified without elevated privileges");
    }

    listeners = mergeLinuxListeners(ssListeners?.listeners ?? [], lsofListeners ?? []);
  }

  const dedupedListeners = dedupeListeners(listeners).filter((listener) => {
    const normalized = normalizeHost(listener.host, localAddresses);
    return normalized.isLocalReachable;
  });

  const mergedListeners = mergeListenerRows(dedupedListeners);
  const processInfo = await loadProcessInfo(mergedListeners.map((listener) => listener.pid).filter((pid): pid is number => pid !== null));
  const entries = mergedListeners.map((listener) => toServerEntry(listener, processInfo.get(listener.pid ?? -1), localAddresses));

  return {
    entries,
    warning: warnings.length > 0 ? warnings.join(". ") : null,
  };
}

function collectLocalAddresses(): Set<string> {
  const interfaces = networkInterfaces();
  const addresses = new Set<string>(LOOPBACK_HOSTS);

  for (const records of Object.values(interfaces)) {
    for (const record of records ?? []) {
      if (record.address) {
        addresses.add(canonicalizeHost(record.address));
      }
    }
  }

  return addresses;
}

function dedupeListeners(listeners: ListenerRecord[]): ListenerRecord[] {
  const seen = new Set<string>();
  const deduped: ListenerRecord[] = [];

  for (const listener of listeners) {
    const key = `${listener.pid ?? "unknown"}:${listener.processName ?? "unknown"}:${canonicalizeHost(listener.host)}:${listener.port}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(listener);
  }

  return deduped;
}

function mergeLinuxListeners(ssListeners: ListenerRecord[], lsofListeners: ListenerRecord[]): ListenerRecord[] {
  if (lsofListeners.length === 0) {
    return ssListeners;
  }

  const merged = [...lsofListeners];

  for (const listener of ssListeners) {
    if (listener.pid !== null) {
      merged.push(listener);
      continue;
    }

    const redundant = lsofListeners.some((known) => known.port === listener.port && areHostsCompatible(known.host, listener.host));
    if (!redundant) {
      merged.push(listener);
    }
  }

  return merged;
}

async function loadProcessInfo(pids: number[]): Promise<Map<number, ProcessInfo>> {
  if (pids.length === 0) {
    return new Map();
  }

  const pidList = [...new Set(pids)].join(",");
  const result = await runCommand(["ps", "-o", "pid=,ppid=,user=,command=", "-p", pidList]);
  if (result.notFound || result.exitCode !== 0) {
    return new Map();
  }

  return parsePsDetails(result.stdout);
}

function toServerEntry(listener: ListenerRecord, processInfo: ProcessInfo | undefined, localAddresses: Set<string>): ServerEntry {
  const bindHosts = getMergedHosts(listener.host);
  const normalizedHosts = bindHosts.map((host) => normalizeHost(host, localAddresses));
  const displayHost = summarizeHosts(bindHosts, normalizedHosts.map((item) => item.bindHost));
  const browserHost = resolveBrowserHost(normalizedHosts.map((item) => item.bindHost));
  const primaryBindHost = normalizedHosts[0]?.bindHost ?? "unknown";
  const ownerKnown = listener.pid !== null;
  const processName = listener.processName ?? "unknown";
  const command = processInfo?.command ?? processName;
  const heuristic = scoreDevServer(command, processName, listener.port);
  const notes = [...heuristic.reasons];

  if (bindHosts.some((host) => WILDCARD_HOSTS.has(canonicalizeHost(host)))) {
    notes.push("Wildcard bind is reachable locally via localhost");
  }

  if (!ownerKnown) {
    notes.push("Process ownership is unavailable without elevated privileges");
  }

  const protocol: ProbeProtocol = "http";
  return {
    id: `${listener.pid ?? "unknown"}:${bindHosts.join("|")}:${listener.port}`,
    source: listener.source,
    pid: listener.pid,
    ppid: processInfo?.ppid ?? null,
    user: processInfo?.user ?? listener.user,
    processName,
    command,
    bindHosts,
    bindHost: primaryBindHost,
    browserHost,
    displayHost,
    port: listener.port,
    browserUrl: formatUrl(protocol, browserHost, listener.port),
    protocolHint: null,
    probe: null,
    framework: heuristic.framework,
    devScore: heuristic.score,
    isLikelyDev: heuristic.score >= 35,
    isLocalReachable: normalizedHosts.some((item) => item.isLocalReachable),
    ownerKnown,
    notes,
  };
}

export function mergeListenerRows(listeners: ListenerRecord[]): ListenerRecord[] {
  const merged: ListenerRecord[] = [];

  for (const listener of listeners) {
    const currentHost = canonicalizeHost(listener.host);
    const existing = merged.find((candidate) => {
      if (!areOwnersCompatible(candidate, listener) || candidate.port !== listener.port) {
        return false;
      }

      return getMergedHosts(candidate.host).some((host) => areHostsCompatible(host, currentHost));
    });

    if (!existing) {
      merged.push({
        ...listener,
        host: currentHost,
      });
      continue;
    }

    const nextHosts = [...getMergedHosts(existing.host), currentHost];
    existing.host = nextHosts.map(canonicalizeHost).filter(unique).sort().join("|");
    existing.source = existing.source === listener.source ? existing.source : "merged";
    existing.user ??= listener.user;
    existing.processName ??= listener.processName;
  }

  return merged;
}

function areOwnersCompatible(left: ListenerRecord, right: ListenerRecord): boolean {
  if (left.pid !== null && right.pid !== null) {
    return left.pid === right.pid;
  }

  if (left.pid === null && right.pid === null) {
    return true;
  }

  return false;
}

function areHostsCompatible(left: string, right: string): boolean {
  const leftKind = classifyHost(left);
  const rightKind = classifyHost(right);
  if (leftKind.kind === rightKind.kind && (leftKind.kind === "loopback" || leftKind.kind === "wildcard")) {
    return true;
  }

  return leftKind.host === rightKind.host;
}

function resolveBrowserHost(hosts: string[]): string {
  if (hosts.some((host) => WILDCARD_HOSTS.has(host) || LOOPBACK_HOSTS.has(host))) {
    return "localhost";
  }

  return hosts[0] ?? "localhost";
}

function summarizeHosts(rawHosts: string[], normalizedHosts: string[]): string {
  const hostKinds = normalizedHosts.map((host) => classifyHost(host).kind);
  if (hostKinds.every((kind) => kind === "loopback") || hostKinds.every((kind) => kind === "wildcard")) {
    return "localhost";
  }

  if (rawHosts.length === 1) {
    return normalizedHosts[0] ?? rawHosts[0] ?? "unknown";
  }

  return normalizedHosts.join(" + ");
}

function getMergedHosts(host: string): string[] {
  return host.split("|").map((item) => canonicalizeHost(item)).filter(Boolean);
}

function classifyHost(rawHost: string): { host: string; kind: "loopback" | "wildcard" | "specific" } {
  const host = canonicalizeHost(rawHost);
  if (LOOPBACK_HOSTS.has(host)) {
    return { host, kind: "loopback" };
  }

  if (WILDCARD_HOSTS.has(host)) {
    return { host, kind: "wildcard" };
  }

  return { host, kind: "specific" };
}

function canonicalizeHost(rawHost: string): string {
  return stripZoneId(rawHost.replace(/^\[/, "").replace(/\]$/, "").trim().toLowerCase());
}

function stripZoneId(host: string): string {
  const percentIndex = host.indexOf("%");
  return percentIndex === -1 ? host : host.slice(0, percentIndex);
}

function unique<T>(value: T, index: number, values: T[]): boolean {
  return values.indexOf(value) === index;
}
