import { spawn } from "node:child_process";

// Low-level process helper used by every language runtime.
//
// Guarantees for a local-first app:
//  - hard wall-clock timeout (SIGTERM, then SIGKILL)
//  - the whole process group is killed, so spawned children cannot outlive the run
//  - stdout/stderr are capped, so an infinite print loop cannot exhaust memory
//  - stdin is closed and the environment is minimal (no inherited secrets such as
//    OPENAI_API_KEY, no DATABASE_URL)
//
// NOTE: this is process-level isolation, not a sandbox. Practiced code runs with
// the permissions of the server user. That is acceptable for a local single-user
// app; see the README before exposing this endpoint to anyone else.

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
  /** Set when the binary itself could not be started (e.g. ENOENT). */
  spawnError: string | null;
}

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  /** Extra variables added to a deliberately minimal environment. */
  env?: Record<string, string>;
}

/** Environment handed to practiced code: no app secrets, temp-dir HOME. */
function buildEnv(cwd: string, extra?: Record<string, string>): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/local/bin",
    HOME: cwd,
    TMPDIR: cwd,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    PYTHONIOENCODING: "utf-8",
    ...extra,
  };
}

export function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  const { command, args, cwd, timeoutMs, maxOutputChars, env } = options;
  const startedAt = Date.now();

  return new Promise<ProcessResult>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      // Cast: next-env.d.ts makes NODE_ENV required on ProcessEnv, but practiced
      // code is deliberately started without the app's own environment.
      env: buildEnv(cwd, env) as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"] as const,
      // Own process group: lets us kill grandchildren too.
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let spawnError: string | null = null;

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* already gone */
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      // Escalate if it ignores SIGTERM.
      setTimeout(() => killGroup("SIGKILL"), 500);
    }, timeoutMs);

    const collect = (which: "out" | "err") => (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (which === "out") {
        if (stdout.length >= maxOutputChars) {
          truncated = true;
          return;
        }
        stdout += text.slice(0, maxOutputChars - stdout.length);
      } else {
        if (stderr.length >= maxOutputChars) {
          truncated = true;
          return;
        }
        stderr += text.slice(0, maxOutputChars - stderr.length);
      }
      if (stdout.length + stderr.length >= maxOutputChars * 2) {
        truncated = true;
        killGroup("SIGKILL");
      }
    };

    child.stdout?.on("data", collect("out"));
    child.stderr?.on("data", collect("err"));

    child.on("error", (err) => {
      spawnError = err instanceof Error ? err.message : String(err);
    });

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut,
        truncated,
        durationMs: Date.now() - startedAt,
        spawnError,
      });
    };

    child.on("close", finish);
  });
}
