import { expect, test } from "bun:test";
import { parseProcessRelations } from "./parse.ts";
import { resolveProcessTree } from "./process-tree.ts";

test("parseProcessRelations reads ps pid/ppid output", () => {
  expect(parseProcessRelations(" 10 1\n 11 10\n 12 11")).toEqual([
    { pid: 10, ppid: 1 },
    { pid: 11, ppid: 10 },
    { pid: 12, ppid: 11 },
  ]);
});

test("resolveProcessTree returns descendants before the root pid", () => {
  const relations = [
    { pid: 10, ppid: 1 },
    { pid: 11, ppid: 10 },
    { pid: 12, ppid: 11 },
    { pid: 13, ppid: 10 },
  ];

  expect(resolveProcessTree(10, relations)).toEqual([12, 13, 11, 10]);
});
