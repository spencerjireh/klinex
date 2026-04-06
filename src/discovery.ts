import { networkInterfaces } from "node:os";
import { runCommand } from "./command.ts";
import { parseLsofListeners, parsePsDetails, parseSsListeners } from "./parse.ts";
import type { DiscoveryResult, ListenerRecord, ProcessInfo, ProbeKind, ProbeProtocol, ServerEntry, ServiceHeuristic, ServiceType } from "./types.ts";

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
  [5432, 34],
  [3306, 30],
  [27017, 30],
  [6379, 34],
  [11211, 24],
  [9000, 28],
  [4566, 32],
  [5672, 24],
  [4222, 24],
  [9092, 22],
  [1025, 18],
  [8025, 24],
  [9200, 26],
  [7700, 26],
  [9090, 28],
  [3100, 20],
  [9093, 18],
  [15672, 26],
]);

const SERVICE_SIGNALS: Array<{
  pattern: RegExp;
  score: number;
  framework: string | null;
  serviceType: ServiceType;
  serviceLabel: string;
  probeKind: ProbeKind;
  hasHttpUi: boolean;
  isRelevantService: boolean;
  reason: string;
}> = [
  { pattern: /\bnext(?:\s+dev)?\b/i, score: 80, framework: "Next.js", serviceType: "web", serviceLabel: "Next.js", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command looks like Next.js dev mode" },
  { pattern: /\bvite\b/i, score: 72, framework: "Vite", serviceType: "web", serviceLabel: "Vite", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command mentions Vite" },
  { pattern: /\bastro\b/i, score: 68, framework: "Astro", serviceType: "web", serviceLabel: "Astro", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command mentions Astro" },
  { pattern: /\bnuxt\b/i, score: 68, framework: "Nuxt", serviceType: "web", serviceLabel: "Nuxt", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command mentions Nuxt" },
  { pattern: /webpack(?:-dev-server)?/i, score: 56, framework: "Webpack", serviceType: "web", serviceLabel: "Webpack", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command mentions Webpack dev server" },
  { pattern: /\bbun\b.*\s--hot\b/i, score: 48, framework: "Bun", serviceType: "web", serviceLabel: "Bun", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command is running Bun hot reload" },
  { pattern: /python(?:\d(?:\.\d+)?)?\s+-m\s+http\.server/i, score: 52, framework: "Python", serviceType: "web", serviceLabel: "Python", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command is Python's local HTTP server" },
  { pattern: /manage\.py\s+runserver/i, score: 60, framework: "Django", serviceType: "web", serviceLabel: "Django", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command is Django runserver" },
  { pattern: /\brails(?:\s+s(?:erver)?)?\b/i, score: 60, framework: "Rails", serviceType: "web", serviceLabel: "Rails", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command is Rails server mode" },
  { pattern: /\bphp\b.*\s-S\s/i, score: 48, framework: "PHP", serviceType: "web", serviceLabel: "PHP", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command is PHP's built-in web server" },
  { pattern: /\b(postgres(?:ql)?|postmaster)\b/i, score: 74, framework: "Postgres", serviceType: "database", serviceLabel: "Postgres", probeKind: "tcp", hasHttpUi: false, isRelevantService: true, reason: "Command looks like Postgres" },
  { pattern: /\b(mysqld|mariadbd|mariadb)\b/i, score: 70, framework: "MySQL", serviceType: "database", serviceLabel: "MySQL", probeKind: "tcp", hasHttpUi: false, isRelevantService: true, reason: "Command looks like MySQL or MariaDB" },
  { pattern: /\b(mongod|mongodb)\b/i, score: 70, framework: "MongoDB", serviceType: "database", serviceLabel: "MongoDB", probeKind: "tcp", hasHttpUi: false, isRelevantService: true, reason: "Command looks like MongoDB" },
  { pattern: /\b(redis-server|redis|valkey|memcached)\b/i, score: 72, framework: "Redis", serviceType: "cache", serviceLabel: "Cache", probeKind: "tcp", hasHttpUi: false, isRelevantService: true, reason: "Command looks like a cache service" },
  { pattern: /\b(minio|s3rver|fake-s3)\b/i, score: 70, framework: "MinIO", serviceType: "storage", serviceLabel: "Object storage", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command looks like local object storage" },
  { pattern: /\blocalstack\b/i, score: 76, framework: "LocalStack", serviceType: "emulator", serviceLabel: "Cloud emulator", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command looks like LocalStack" },
  { pattern: /\b(rabbitmq|kafka|redpanda|nats-server|nats)\b/i, score: 64, framework: "Broker", serviceType: "queue", serviceLabel: "Queue", probeKind: "tcp", hasHttpUi: false, isRelevantService: true, reason: "Command looks like a queue or broker" },
  { pattern: /\b(mailhog|mailpit)\b/i, score: 72, framework: "Mail", serviceType: "mail", serviceLabel: "Mail", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command looks like a local mail tool" },
  { pattern: /\b(elasticsearch|opensearch|meilisearch)\b/i, score: 72, framework: "Search", serviceType: "search", serviceLabel: "Search", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command looks like a search service" },
  { pattern: /\b(grafana|prometheus|loki|tempo|jaeger)\b/i, score: 74, framework: "Observability", serviceType: "observability", serviceLabel: "Observability", probeKind: "http", hasHttpUi: true, isRelevantService: true, reason: "Command looks like an observability tool" },
];

const PORT_SIGNALS = new Map<number, Omit<ServiceHeuristic, "score" | "reasons">>([
  [3000, { framework: "HTTP", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [3001, { framework: "HTTP", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [4173, { framework: "Preview", serviceType: "web", serviceLabel: "Preview", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [4200, { framework: "Web", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [4321, { framework: "Web", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [5000, { framework: "Web", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [5173, { framework: "Vite", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [8000, { framework: "HTTP", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [8080, { framework: "HTTP", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [8787, { framework: "HTTP", serviceType: "web", serviceLabel: "Web", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [5432, { framework: "Postgres", serviceType: "database", serviceLabel: "Postgres", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [3306, { framework: "MySQL", serviceType: "database", serviceLabel: "MySQL", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [27017, { framework: "MongoDB", serviceType: "database", serviceLabel: "MongoDB", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [6379, { framework: "Redis", serviceType: "cache", serviceLabel: "Cache", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [11211, { framework: "Memcached", serviceType: "cache", serviceLabel: "Cache", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [9000, { framework: "MinIO", serviceType: "storage", serviceLabel: "Object storage", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [4566, { framework: "LocalStack", serviceType: "emulator", serviceLabel: "Cloud emulator", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [5672, { framework: "RabbitMQ", serviceType: "queue", serviceLabel: "Queue", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [4222, { framework: "NATS", serviceType: "queue", serviceLabel: "Queue", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [9092, { framework: "Kafka", serviceType: "queue", serviceLabel: "Queue", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [1025, { framework: "Mail", serviceType: "mail", serviceLabel: "Mail", probeKind: "tcp", hasHttpUi: false, isRelevantService: true }],
  [8025, { framework: "Mail", serviceType: "mail", serviceLabel: "Mail", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [9200, { framework: "Search", serviceType: "search", serviceLabel: "Search", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [7700, { framework: "Search", serviceType: "search", serviceLabel: "Search", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [9090, { framework: "Prometheus", serviceType: "observability", serviceLabel: "Observability", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [3100, { framework: "Loki", serviceType: "observability", serviceLabel: "Observability", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [9093, { framework: "Alertmanager", serviceType: "observability", serviceLabel: "Observability", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
  [15672, { framework: "RabbitMQ", serviceType: "queue", serviceLabel: "Queue", probeKind: "http", hasHttpUi: true, isRelevantService: true }],
]);

const SYSTEM_SIGNALS = [
  /\bsshd\b/i,
  /\bdocker-proxy\b/i,
  /\bnginx\b/i,
  /\bapache2?\b/i,
  /\bhttpd\b/i,
  /\b(cupsd|avahi-daemon|mDNSResponder|systemd-resolved)\b/i,
  /\bss\b/i,
];

export function isCommonDevPort(port: number): boolean {
  return DEV_PORT_SCORES.has(port);
}

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

export function scoreDevServer(command: string, processName: string, port: number): ServiceHeuristic {
  const combined = `${processName} ${command}`.trim();
  let score = 0;
  let framework: string | null = null;
  let serviceType: ServiceType = "unknown";
  let serviceLabel = "Listener";
  let probeKind: ProbeKind = "none";
  let hasHttpUi = false;
  let isRelevantService = false;
  let strongestSignalScore = -1;
  const reasons: string[] = [];

  if (SYSTEM_SIGNALS.some((pattern) => pattern.test(combined))) {
    return {
      score: -100,
      framework: processName,
      serviceType: "system",
      serviceLabel: "System",
      probeKind: "none",
      hasHttpUi: false,
      isRelevantService: false,
      reasons: ["Looks more like a system service than a developer service"],
    };
  }

  for (const signal of SERVICE_SIGNALS) {
    if (!signal.pattern.test(combined)) {
      continue;
    }

    score += signal.score;
    framework ??= signal.framework;
    if (signal.score > strongestSignalScore) {
      strongestSignalScore = signal.score;
      serviceType = signal.serviceType;
      serviceLabel = signal.serviceLabel;
      probeKind = signal.probeKind;
      hasHttpUi = signal.hasHttpUi;
      isRelevantService = signal.isRelevantService;
    }
    reasons.push(signal.reason);
  }

  const portScore = DEV_PORT_SCORES.get(port);
  if (portScore) {
    score += portScore;
    reasons.push(`Port ${port} is common for local developer services`);
  }

  const portSignal = PORT_SIGNALS.get(port);
  if (portSignal) {
    framework ??= portSignal.framework;
    if (serviceType === "unknown") {
      serviceType = portSignal.serviceType;
      serviceLabel = portSignal.serviceLabel;
      probeKind = portSignal.probeKind;
      hasHttpUi = portSignal.hasHttpUi;
      isRelevantService = portSignal.isRelevantService;
    }
  }

  if (/\b(dev|serve|preview|hot|watch)\b/i.test(combined)) {
    score += 10;
    reasons.push("Command includes a dev-mode keyword");
    if (serviceType === "unknown") {
      serviceType = "web";
      serviceLabel = "Web";
      probeKind = "http";
      hasHttpUi = true;
      isRelevantService = true;
    }
  }

  if (/\b(node|bun|python|ruby|php)\b/i.test(combined)) {
    score += 4;
  }

  if (port < 1024) {
    score -= 10;
  }

  if (serviceType === "unknown" && portSignal) {
    serviceType = portSignal.serviceType;
    serviceLabel = portSignal.serviceLabel;
    probeKind = portSignal.probeKind;
    hasHttpUi = portSignal.hasHttpUi;
    isRelevantService = portSignal.isRelevantService;
  }

  return {
    score,
    framework,
    serviceType,
    serviceLabel,
    probeKind,
    hasHttpUi,
    isRelevantService,
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

    const protocol = previous.protocolHint ?? entry.protocolHint;
    const browserUrl = entry.hasHttpUi && protocol ? formatUrl(protocol, entry.browserHost, entry.port) : entry.browserUrl;
    return {
      ...entry,
      probe: previous.probe,
      protocolHint: previous.protocolHint,
      browserUrl,
      endpoint: browserUrl ?? entry.endpoint,
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

  const protocolHint: ProbeProtocol | null = heuristic.hasHttpUi ? "http" : null;
  const browserUrl = heuristic.hasHttpUi && protocolHint ? formatUrl(protocolHint, browserHost, listener.port) : null;
  const endpoint = formatEndpoint(heuristic.serviceType, browserHost, listener.port, browserUrl);
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
    browserUrl,
    endpoint,
    protocolHint,
    probeKind: heuristic.probeKind,
    probe: null,
    serviceType: heuristic.serviceType,
    serviceLabel: heuristic.serviceLabel,
    hasHttpUi: heuristic.hasHttpUi,
    isRelevantService: heuristic.isRelevantService,
    framework: heuristic.framework,
    devScore: heuristic.score,
    isLikelyDev: heuristic.serviceType === "web" && heuristic.score >= 35,
    isLocalReachable: normalizedHosts.some((item) => item.isLocalReachable),
    ownerKnown,
    notes,
  };
}

function formatEndpoint(serviceType: ServiceType, host: string, port: number, browserUrl: string | null): string {
  if (browserUrl) {
    return browserUrl;
  }

  switch (serviceType) {
    case "database":
      return `db://${host}:${port}`;
    case "cache":
      return `cache://${host}:${port}`;
    case "storage":
      return `storage://${host}:${port}`;
    case "emulator":
      return `emulator://${host}:${port}`;
    case "queue":
      return `queue://${host}:${port}`;
    case "mail":
      return `mail://${host}:${port}`;
    case "search":
      return `search://${host}:${port}`;
    case "observability":
      return `obs://${host}:${port}`;
    case "system":
      return `tcp://${host}:${port}`;
    case "unknown":
    case "web":
      return `tcp://${host}:${port}`;
  }
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
