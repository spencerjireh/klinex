import type { CommandResult } from "./types.ts";

export async function runCommand(command: string[]): Promise<CommandResult> {
  const [binary, ...args] = command;

  if (!binary) {
    return {
      command,
      exitCode: null,
      stdout: "",
      stderr: "No command provided",
      notFound: true,
    };
  }

  const resolvedBinary = Bun.which(binary);
  if (!resolvedBinary) {
    return {
      command,
      exitCode: null,
      stdout: "",
      stderr: `${binary} is not installed`,
      notFound: true,
    };
  }

  try {
    const proc = Bun.spawn({
      cmd: [resolvedBinary, ...args],
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);

    return {
      command,
      exitCode,
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      notFound: false,
    };
  } catch (error) {
    return {
      command,
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      notFound: false,
    };
  }
}
