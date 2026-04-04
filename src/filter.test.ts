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
  protocolHint: null,
  probe: null,
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

test("shouldShowByDefault hides low-signal listeners without a successful probe", () => {
  expect(shouldShowByDefault(baseEntry)).toBe(true);
  expect(shouldShowByDefault({ ...baseEntry, isLikelyDev: false, devScore: 0 })).toBe(false);
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
