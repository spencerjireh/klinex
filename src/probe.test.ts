import { expect, test } from "bun:test";

import { pickProbeCandidates } from "./probe.ts";
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

test("pickProbeCandidates includes common dev ports even with weak heuristics", () => {
  const weak8080Entry: ServerEntry = {
    ...baseEntry,
    id: "2:*:8080",
    pid: 2,
    processName: "java",
    command: "java -jar app.jar",
    port: 8080,
    browserUrl: "http://localhost:8080",
    endpoint: "http://localhost:8080",
    probeKind: "http",
    serviceType: "web",
    serviceLabel: "Web",
    hasHttpUi: true,
    isRelevantService: true,
    framework: null,
    devScore: 18,
    isLikelyDev: false,
    ownerKnown: false,
  };

  expect(pickProbeCandidates([weak8080Entry], null)).toEqual([weak8080Entry]);
});
