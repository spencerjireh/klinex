import { runCommand } from "./command.ts";
import { loadProcessRelations, resolveProcessTree } from "./process-tree.ts";
import type { ActionResult, StopAction } from "./types.ts";

export async function openUrl(url: string): Promise<ActionResult> {
  const command = process.platform === "darwin" ? ["open", url] : ["xdg-open", url];
  const result = await runCommand(command);

  if (result.notFound) {
    return {
      ok: false,
      message: process.platform === "darwin" ? "The macOS open command is unavailable" : "xdg-open is required to open a browser",
    };
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: result.stderr || `Failed to open ${url}`,
    };
  }

  return {
    ok: true,
    message: `Opened ${url}`,
  };
}

export async function stopProcess(pid: number, action: StopAction): Promise<ActionResult> {
  const signal = action.startsWith("kill") ? "SIGKILL" : "SIGTERM";
  const treeMode = action.endsWith("tree");
  const targetPids = treeMode ? await resolveTreeTargets(pid) : [pid];

  for (const targetPid of targetPids) {
    try {
      process.kill(targetPid, signal);
    } catch (error) {
      if (isMissingProcess(error)) {
        continue;
      }

      if (isPermissionError(error)) {
        return {
          ok: false,
          permissionDenied: true,
          message: `Permission denied while sending ${signal} to PID ${targetPid}. Re-run klinex with sudo if you need elevated access.`,
        };
      }

      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (signal === "SIGTERM") {
    await Bun.sleep(700);
  }

  const stillRunning = isProcessAlive(pid);
  const modeLabel = treeMode ? "process tree" : "process";
  const verb = signal === "SIGTERM" ? "Sent SIGTERM to" : "Sent SIGKILL to";

  return {
    ok: true,
    stillRunning,
    message: stillRunning && signal === "SIGTERM"
      ? `${verb} ${modeLabel} for PID ${pid}. It is still running, so force kill remains available.`
      : `${verb} ${modeLabel} for PID ${pid}.`,
  };
}

async function resolveTreeTargets(rootPid: number): Promise<number[]> {
  const relations = await loadProcessRelations();
  const targets = resolveProcessTree(rootPid, relations);
  return targets.length > 0 ? targets : [rootPid];
}

function isPermissionError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EPERM";
}

function isMissingProcess(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isMissingProcess(error);
  }
}
