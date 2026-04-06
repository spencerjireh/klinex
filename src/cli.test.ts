import { expect, test } from "bun:test";

import { resolveCliText } from "./cli.ts";

const metadata = {
  packageName: "@klinex/klinex",
  version: "1.2.3",
};

test("resolveCliText returns version text", () => {
  expect(resolveCliText(["--version"], metadata)).toBe("@klinex/klinex 1.2.3");
  expect(resolveCliText(["-v"], metadata)).toBe("@klinex/klinex 1.2.3");
});

test("resolveCliText returns help text", () => {
  const helpText = resolveCliText(["--help"], metadata);

  expect(helpText).not.toBeNull();
  expect(helpText).toContain("Usage:");
  expect(helpText).toContain("klinex --version");
  expect(helpText).toContain("brew install klinex/tap/klinex");
});

test("resolveCliText ignores unknown arguments", () => {
  expect(resolveCliText([], metadata)).toBeNull();
  expect(resolveCliText(["--unknown"], metadata)).toBeNull();
});
