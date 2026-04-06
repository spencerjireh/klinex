import { Socket } from "node:net";
import { formatUrl, isCommonDevPort } from "./discovery.ts";
import { extractHtmlTitle } from "./parse.ts";
import type { ProbeProtocol, ProbeResult, ServerEntry } from "./types.ts";

const PROBE_TTL_MS = 15_000;
const MAX_PROBE_TARGETS = 8;
const PROBE_TIMEOUT_MS = 1_500;

export async function probeEntries(entries: ServerEntry[], selectedId: string | null, force: boolean): Promise<ServerEntry[]> {
  const candidates = pickProbeCandidates(entries, selectedId);
  const candidateIds = new Set(candidates.map((entry) => entry.id));
  const updates = new Map<string, ServerEntry>();

  await runWithConcurrency(candidates, 4, async (entry) => {
    if (!force && isFresh(entry.probe)) {
      return;
    }

    const probe = await probeEntry(entry);
    updates.set(entry.id, applyProbe(entry, probe));
  });

  return entries.map((entry) => (candidateIds.has(entry.id) ? updates.get(entry.id) ?? entry : entry));
}

export function applyProbe(entry: ServerEntry, probe: ProbeResult): ServerEntry {
  const protocol = probe.state === "success" ? probe.protocol : entry.protocolHint;
  const browserUrl = entry.hasHttpUi && protocol && protocol !== "tcp"
    ? formatUrl(protocol, entry.browserHost, entry.port)
    : entry.browserUrl;

  return {
    ...entry,
    probe,
    protocolHint: probe.state === "success" && probe.protocol !== "tcp" ? probe.protocol ?? entry.protocolHint : entry.protocolHint,
    browserUrl,
    endpoint: browserUrl ?? entry.endpoint,
  };
}

async function probeEntry(entry: ServerEntry): Promise<ProbeResult> {
  if (entry.probeKind === "tcp") {
    return probeTcpEntry(entry);
  }

  if (entry.probeKind === "none") {
    return {
      state: "failed",
      checkedAt: Date.now(),
      error: "No probe available",
    };
  }

  const protocols = chooseProtocols(entry.protocolHint);

  for (const protocol of protocols) {
    try {
      const url = formatUrl(protocol, entry.browserHost, entry.port);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        redirect: "follow",
      });

      const contentType = response.headers.get("content-type") ?? "";
      let title: string | undefined;
      if (/text\/html/i.test(contentType)) {
        const html = await response.text();
        title = extractHtmlTitle(html.slice(0, 8_192));
      }

      return {
        state: "success",
        checkedAt: Date.now(),
        protocol,
        status: response.status,
        title,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (protocol === protocols[protocols.length - 1]) {
        return {
          state: "failed",
          checkedAt: Date.now(),
          error: message,
        };
      }
    }
  }

  return {
    state: "failed",
    checkedAt: Date.now(),
    error: "Probe did not complete",
  };
}

function chooseProtocols(protocolHint: ProbeProtocol | null): ProbeProtocol[] {
  if (protocolHint === "https") {
    return ["https", "http"];
  }

  return ["http", "https"];
}

export function pickProbeCandidates(entries: ServerEntry[], selectedId: string | null): ServerEntry[] {
  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) : undefined;
  const topEntries = entries
    .filter((entry) => entry.isRelevantService || isCommonDevPort(entry.port))
    .sort((left, right) => right.devScore - left.devScore || left.port - right.port)
    .slice(0, MAX_PROBE_TARGETS);

  const merged = selected ? [selected, ...topEntries] : topEntries;
  const seen = new Set<string>();

  return merged.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }

    seen.add(entry.id);
    return true;
  });
}

async function probeTcpEntry(entry: ServerEntry): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (result: ProbeResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS, () => {
      finish({
        state: "failed",
        checkedAt: Date.now(),
        protocol: "tcp",
        reachable: false,
        error: "TCP probe timed out",
      });
    });

    socket.once("connect", () => {
      finish({
        state: "success",
        checkedAt: Date.now(),
        protocol: "tcp",
        reachable: true,
      });
    });

    socket.once("error", (error) => {
      finish({
        state: "failed",
        checkedAt: Date.now(),
        protocol: "tcp",
        reachable: false,
        error: error.message,
      });
    });

    socket.connect(entry.port, entry.browserHost);
  });
}

function isFresh(probe: ProbeResult | null): boolean {
  return probe !== null && Date.now() - probe.checkedAt < PROBE_TTL_MS;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) {
          break;
        }

        await task(item);
      }
    }),
  );
}
