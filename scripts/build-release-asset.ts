import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";

interface ReleaseBuildOptions {
  target: string;
  assetName: string;
}

const RELEASE_DIR = "dist/release";
const RELEASE_BINARY_NAME = "klinex";

function parseArgs(args: string[]): ReleaseBuildOptions {
  const target = readArgValue(args, "--target");
  const assetName = readArgValue(args, "--asset-name");

  if (!target || !assetName) {
    throw new Error("Usage: bun run scripts/build-release-asset.ts --target <bun-target> --asset-name <asset-name>");
  }

  return {
    target,
    assetName,
  };
}

function readArgValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

async function runCommand(command: string[], label: string): Promise<void> {
  const proc = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const binaryPath = `${RELEASE_DIR}/${RELEASE_BINARY_NAME}`;
  const archivePath = `${RELEASE_DIR}/${options.assetName}.tar.gz`;
  const checksumPath = `${archivePath}.sha256`;

  await mkdir(RELEASE_DIR, { recursive: true });
  await rm(binaryPath, { force: true });
  await rm(archivePath, { force: true });
  await rm(checksumPath, { force: true });

  await runCommand(
    ["bun", "build", "./index.ts", "--compile", "--target", options.target, "--outfile", binaryPath],
    "binary build",
  );
  await runCommand([binaryPath, "--version"], "binary smoke test");
  await runCommand(["tar", "-czf", archivePath, "-C", RELEASE_DIR, RELEASE_BINARY_NAME], "archive packaging");

  const archive = Bun.file(archivePath);
  const archiveBytes = await archive.arrayBuffer();
  const checksum = createHash("sha256").update(new Uint8Array(archiveBytes)).digest("hex");

  await Bun.write(checksumPath, `${checksum}  ${options.assetName}.tar.gz\n`);
}

await main();
