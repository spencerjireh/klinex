import { expect, test } from "bun:test";
import { formatUrl, mergeListenerRows, normalizeHost, scoreDevServer } from "./discovery.ts";
import { parseLsofListeners, parsePsDetails, parseSsListeners } from "./parse.ts";

test("parseLsofListeners extracts loopback and wildcard listeners", () => {
  const output = [
    "COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME",
    "node     123 dev    21u  IPv4 0x1 0t0 TCP 127.0.0.1:3000 (LISTEN)",
    "bun      456 dev    22u  IPv6 0x2 0t0 TCP *:5173 (LISTEN)",
  ].join("\n");

  expect(parseLsofListeners(output)).toEqual([
    { source: "lsof", processName: "node", pid: 123, user: "dev", host: "127.0.0.1", port: 3000 },
    { source: "lsof", processName: "bun", pid: 456, user: "dev", host: "*", port: 5173 },
  ]);
});

test("parseSsListeners extracts pid-backed listeners and counts missing process info", () => {
  const output = [
    'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=123,fd=20))',
    'LISTEN 0 511 *:8080 *:*',
  ].join("\n");

  expect(parseSsListeners(output)).toEqual({
    listeners: [
      { source: "ss", processName: "node", pid: 123, user: null, host: "127.0.0.1", port: 3000 },
      { source: "ss", processName: null, pid: null, user: null, host: "*", port: 8080 },
    ],
    missingProcessCount: 1,
  });
});

test("parseSsListeners handles ipv6 and multiple process tuples", () => {
  const output = [
    'LISTEN 0 511 [::1]:5173 [::]:* users:(("node",pid=2222,fd=21),("node",pid=2222,fd=22))',
    'LISTEN 0 128 [::ffff:127.0.0.1]:4000 [::]:* users:(("bun",pid=5555,fd=12))',
    'LISTEN 0 128 [fe80::1]%eth0:3001 [::]:* users:(("python",pid=6666,fd=5))',
  ].join("\n");

  expect(parseSsListeners(output)).toEqual({
    listeners: [
      { source: "ss", processName: "node", pid: 2222, user: null, host: "::1", port: 5173 },
      { source: "ss", processName: "bun", pid: 5555, user: null, host: "::ffff:127.0.0.1", port: 4000 },
      { source: "ss", processName: "python", pid: 6666, user: null, host: "fe80::1%eth0", port: 3001 },
    ],
    missingProcessCount: 0,
  });
});

test("parsePsDetails preserves full command strings", () => {
  const output = " 123  99 dev bun --hot ./server.ts\n 456 123 root python -m http.server 8000";
  const parsed = parsePsDetails(output);

  expect(parsed.get(123)).toEqual({ pid: 123, ppid: 99, user: "dev", command: "bun --hot ./server.ts" });
  expect(parsed.get(456)?.command).toBe("python -m http.server 8000");
});

test("scoreDevServer ranks common dev servers above system services", () => {
  expect(scoreDevServer("bun --hot ./server.ts", "bun", 5173).score).toBeGreaterThan(70);
  expect(scoreDevServer("/usr/sbin/sshd -D", "sshd", 22).score).toBeLessThan(0);
});

test("scoreDevServer recognizes developer infrastructure on known ports", () => {
  const postgres = scoreDevServer("postgres -D /tmp/dev-db", "postgres", 5432);
  expect(postgres.serviceType).toBe("database");
  expect(postgres.isRelevantService).toBe(true);
  expect(postgres.probeKind).toBe("tcp");
});

test("scoreDevServer keeps system services out of curated view", () => {
  const ssh = scoreDevServer("/usr/sbin/sshd -D", "sshd", 22);
  expect(ssh.serviceType).toBe("system");
  expect(ssh.isRelevantService).toBe(false);
});

test("normalizeHost rewrites wildcard binds to localhost", () => {
  const normalized = normalizeHost("0.0.0.0", new Set(["127.0.0.1", "192.168.1.10"]));
  expect(normalized).toEqual({
    bindHost: "0.0.0.0",
    browserHost: "localhost",
    displayHost: "0.0.0.0",
    isLocalReachable: true,
  });
});

test("formatUrl brackets ipv6 hosts", () => {
  expect(formatUrl("https", "::1", 3000)).toBe("https://[::1]:3000");
});

test("normalizeHost treats ipv4-mapped loopback as local", () => {
  const normalized = normalizeHost("::ffff:127.0.0.1", new Set(["127.0.0.1"]));
  expect(normalized).toEqual({
    bindHost: "::ffff:127.0.0.1",
    browserHost: "localhost",
    displayHost: "::ffff:127.0.0.1",
    isLocalReachable: true,
  });
});

test("mergeListenerRows merges dual-stack loopback listeners for the same pid", () => {
  expect(mergeListenerRows([
    { source: "lsof", processName: "vite", pid: 1111, user: "dev", host: "127.0.0.1", port: 5173 },
    { source: "ss", processName: "vite", pid: 1111, user: null, host: "::1", port: 5173 },
  ])).toEqual([
    { source: "merged", processName: "vite", pid: 1111, user: "dev", host: "127.0.0.1|::1", port: 5173 },
  ]);
});

test("mergeListenerRows keeps same-port listeners separate when owners differ", () => {
  expect(mergeListenerRows([
    { source: "ss", processName: "bun", pid: 1212, user: null, host: "127.0.0.1", port: 3000 },
    { source: "ss", processName: "docker-proxy", pid: 3434, user: null, host: "::1", port: 3000 },
  ])).toEqual([
    { source: "ss", processName: "bun", pid: 1212, user: null, host: "127.0.0.1", port: 3000 },
    { source: "ss", processName: "docker-proxy", pid: 3434, user: null, host: "::1", port: 3000 },
  ]);
});
