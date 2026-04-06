export type ProbeProtocol = "http" | "https" | "tcp";
export type ProbeState = "idle" | "success" | "failed";
export type SortMode = "relevance" | "port" | "process";
export type StopAction = "term-pid" | "kill-pid" | "term-tree" | "kill-tree";
export type ProbeKind = "http" | "tcp" | "none";
export type ServiceType =
  | "web"
  | "database"
  | "cache"
  | "storage"
  | "emulator"
  | "queue"
  | "mail"
  | "search"
  | "observability"
  | "system"
  | "unknown";

export interface CommandResult {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  notFound: boolean;
}

export interface ListenerRecord {
  source: "lsof" | "ss" | "merged";
  pid: number | null;
  user: string | null;
  processName: string | null;
  host: string;
  port: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number | null;
  user: string | null;
  command: string;
}

export interface ProbeResult {
  state: ProbeState;
  checkedAt: number;
  protocol?: ProbeProtocol;
  status?: number;
  title?: string;
  error?: string;
  reachable?: boolean;
}

export interface ServiceHeuristic {
  score: number;
  framework: string | null;
  serviceType: ServiceType;
  serviceLabel: string;
  probeKind: ProbeKind;
  hasHttpUi: boolean;
  isRelevantService: boolean;
  reasons: string[];
}

export interface ServerEntry {
  id: string;
  source: "lsof" | "ss" | "merged";
  pid: number | null;
  ppid: number | null;
  user: string | null;
  processName: string;
  command: string;
  bindHosts: string[];
  bindHost: string;
  browserHost: string;
  displayHost: string;
  port: number;
  browserUrl: string | null;
  endpoint: string;
  protocolHint: ProbeProtocol | null;
  probeKind: ProbeKind;
  probe: ProbeResult | null;
  serviceType: ServiceType;
  serviceLabel: string;
  hasHttpUi: boolean;
  isRelevantService: boolean;
  framework: string | null;
  devScore: number;
  isLikelyDev: boolean;
  isLocalReachable: boolean;
  ownerKnown: boolean;
  notes: string[];
}

export interface DiscoveryResult {
  entries: ServerEntry[];
  warning: string | null;
}

export interface FilterResult {
  entries: ServerEntry[];
  selectedId: string | null;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  permissionDenied?: boolean;
  stillRunning?: boolean;
}

export interface ProcessRelation {
  pid: number;
  ppid: number | null;
}
