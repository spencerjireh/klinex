import type { ListenerRecord, ProcessInfo, ProcessRelation } from "./types.ts";

interface SsProcessRecord {
  processName: string;
  pid: number;
}

export function splitAddressPort(value: string): { host: string; port: number } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("[")) {
    const closeIndex = trimmed.indexOf("]");
    if (closeIndex === -1) {
      return null;
    }

    const hostCore = trimmed.slice(1, closeIndex);
    const remainder = trimmed.slice(closeIndex + 1);
    const colonIndex = remainder.lastIndexOf(":");
    if (!hostCore || colonIndex === -1) {
      return null;
    }

    const scopeSuffix = remainder.slice(0, colonIndex);
    const portText = remainder.slice(colonIndex + 1);
    if (!portText) {
      return null;
    }

    const host = scopeSuffix.startsWith("%") ? `${hostCore}${scopeSuffix}` : hostCore;
    const port = Number.parseInt(portText, 10);
    return Number.isFinite(port) ? { host, port } : null;
  }

  const separatorIndex = trimmed.lastIndexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const host = trimmed.slice(0, separatorIndex);
  const portText = trimmed.slice(separatorIndex + 1);
  const port = Number.parseInt(portText, 10);
  if (!host || !Number.isFinite(port)) {
    return null;
  }

  return { host, port };
}

export function parseLsofListeners(output: string): ListenerRecord[] {
  const listeners: ListenerRecord[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line || line.startsWith("COMMAND")) {
      continue;
    }

    const match = line.match(/^(\S+)\s+(\d+)\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+TCP\s+(.+)\s+\(LISTEN\)$/);
    if (!match) {
      continue;
    }

    const processName = match[1];
    const pidText = match[2];
    const user = match[3];
    const address = match[4];
    if (!processName || !pidText || !user || !address) {
      continue;
    }

    const endpoint = splitAddressPort(address);
    if (!endpoint) {
      continue;
    }

    listeners.push({
      source: "lsof",
      processName,
      pid: Number.parseInt(pidText, 10),
      user,
      host: endpoint.host,
      port: endpoint.port,
    });
  }

  return listeners;
}

export function parseSsListeners(output: string): { listeners: ListenerRecord[]; missingProcessCount: number } {
  const listeners: ListenerRecord[] = [];
  let missingProcessCount = 0;

  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const parsed = parseSsLine(line);
    if (!parsed || parsed.state !== "LISTEN") {
      continue;
    }

    const endpoint = splitAddressPort(parsed.localAddress);
    if (!endpoint) {
      continue;
    }

    const processRecords = parseSsProcessRecords(parsed.remainder);
    if (processRecords.length === 0) {
      missingProcessCount += 1;
      listeners.push({
        source: "ss",
        processName: null,
        pid: null,
        user: null,
        host: endpoint.host,
        port: endpoint.port,
      });
      continue;
    }

    for (const record of processRecords) {
      listeners.push({
        source: "ss",
        processName: record.processName,
        pid: record.pid,
        user: null,
        host: endpoint.host,
        port: endpoint.port,
      });
    }
  }

  return { listeners, missingProcessCount };
}

export function parsePsDetails(output: string): Map<number, ProcessInfo> {
  const processes = new Map<number, ProcessInfo>();

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const pidText = match[1];
    const ppidText = match[2];
    const user = match[3];
    const command = match[4];
    if (!pidText || !ppidText || !user || !command) {
      continue;
    }

    const pid = Number.parseInt(pidText, 10);
    const ppid = Number.parseInt(ppidText, 10);
    processes.set(pid, {
      pid,
      ppid: Number.isFinite(ppid) ? ppid : null,
      user,
      command,
    });
  }

  return processes;
}

export function parseProcessRelations(output: string): ProcessRelation[] {
  const relations: ProcessRelation[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^\s*(\d+)\s+(\d+)\s*$/);
    if (!match) {
      continue;
    }

    const pidText = match[1];
    const ppidText = match[2];
    if (!pidText || !ppidText) {
      continue;
    }

    relations.push({
      pid: Number.parseInt(pidText, 10),
      ppid: Number.parseInt(ppidText, 10),
    });
  }

  return relations;
}

export function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (!match) {
    return undefined;
  }

  const titleText = match[1];
  if (!titleText) {
    return undefined;
  }

  const title = titleText.replace(/\s+/g, " ").trim();
  return title || undefined;
}

function parseSsLine(line: string): { state: string; localAddress: string; remainder: string } | null {
  const tokens = [...line.matchAll(/\S+/g)];
  if (tokens.length < 5) {
    return null;
  }

  const state = tokens[0]?.[0];
  const localAddress = tokens[3]?.[0];
  const peerToken = tokens[4];
  if (!state || !localAddress || !peerToken?.index) {
    if (!state || !localAddress || !peerToken) {
      return null;
    }
  }

  const remainderStart = (peerToken.index ?? 0) + peerToken[0].length;
  return {
    state,
    localAddress,
    remainder: line.slice(remainderStart).trim(),
  };
}

function parseSsProcessRecords(remainder: string): SsProcessRecord[] {
  const usersIndex = remainder.indexOf("users:(");
  if (usersIndex === -1) {
    return [];
  }

  const tuples = remainder.slice(usersIndex).matchAll(/\("([^"]+)"([^)]*)\)/g);
  const records: SsProcessRecord[] = [];
  const seen = new Set<string>();

  for (const tuple of tuples) {
    const processName = tuple[1];
    const attributes = tuple[2] ?? "";
    const pidText = attributes.match(/pid=(\d+)/)?.[1];
    if (!processName || !pidText) {
      continue;
    }

    const pid = Number.parseInt(pidText, 10);
    if (!Number.isFinite(pid)) {
      continue;
    }

    const key = `${pid}:${processName}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    records.push({ processName, pid });
  }

  return records;
}
