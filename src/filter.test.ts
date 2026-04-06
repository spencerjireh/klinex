import { expect, test } from "bun:test";
import { cycleSortMode, filterAndSortEntries, fuzzyScore, shouldShowByDefault } from "./filter.ts";
import type { ServerEntry } from "./types.ts";

const baseEntry: ServerEntry = {
  id: "1:127.0.0.1:3000",
  source: "lsof",
  pid: 1,
  ppid: null,
  user: "dev",
  processName: "node",
  command: "next dev",
  bindHosts: ["127.0.0.1"],
  bindHost: "127.0.0.1",
  browserHost: "localhost",
  displayHost: "127.0.0.1",
  port: 3000,
  browserUrl: "http://localhost:3000",
  endpoint: "http://localhost:3000",
  protocolHint: null,
  probeKind: "http",
  probe: null,
  serviceType: "web",
  serviceLabel: "Web",
  hasHttpUi: true,
  isRelevantService: true,
  framework: "Next.js",
  devScore: 80,
  isLikelyDev: true,
  isLocalReachable: true,
  ownerKnown: true,
  notes: [],
};

test("fuzzyScore matches subsequences", () => {
  expect(fuzzyScore("nxd", "next dev")).toBeGreaterThan(0);
  expect(fuzzyScore("zzz", "next dev")).toBeNull();
});

test("shouldShowByDefault hides unknown low-signal listeners without a successful probe", () => {
  expect(shouldShowByDefault(baseEntry)).toBe(true);
  expect(shouldShowByDefault({ ...baseEntry, serviceType: "unknown", serviceLabel: "Listener", isRelevantService: false, isLikelyDev: false, devScore: 0, browserUrl: null, endpoint: "tcp://localhost:3000", hasHttpUi: false, probeKind: "none" })).toBe(false);
});

test("shouldShowByDefault includes recognized developer infrastructure", () => {
  expect(shouldShowByDefault({
    ...baseEntry,
    browserUrl: null,
    endpoint: "db://localhost:5432",
    probeKind: "tcp",
    serviceType: "database",
    serviceLabel: "Postgres",
    hasHttpUi: false,
    isRelevantService: true,
    framework: "Postgres",
    port: 5432,
    devScore: 34,
    isLikelyDev: false,
  })).toBe(true);
});

test("filterAndSortEntries keeps the selected item when still visible", () => {
  const otherEntry = { ...baseEntry, id: "2:127.0.0.1:5173", pid: 2, port: 5173, framework: "Vite", devScore: 90 };
  const result = filterAndSortEntries([baseEntry, otherEntry], otherEntry.id, "vite", false, "relevance");

  expect(result.selectedId).toBe(otherEntry.id);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.id).toBe(otherEntry.id);
});

test("cycleSortMode rotates through all supported modes", () => {
  expect(cycleSortMode("relevance")).toBe("port");
  expect(cycleSortMode("port")).toBe("process");
  expect(cycleSortMode("process")).toBe("relevance");
});
