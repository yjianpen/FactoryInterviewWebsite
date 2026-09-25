import crypto from "node:crypto";
import type { ProcessResult } from "./process";
import type { HarnessResults } from "./results";
import { parseHarnessResults } from "./results";
import { buildCppProgram } from "./cpp";
import { buildJavaProgram } from "./java";
import { buildPythonProgram } from "./python";
import type { RunLanguage } from "./types";

const WORKDIR = "/vercel/sandbox";

export interface SandboxRunInput {
  language: RunLanguage;
  code: string;
  harness?: string;
  timeoutMs: number;
  maxOutputChars: number;
}

export interface SandboxRunOutput {
  proc: ProcessResult;
  harness: HarnessResults;
  compileError: string | null;
}

function cap(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export async function runInSandbox(input: SandboxRunInput): Promise<SandboxRunOutput> {
  const { Sandbox } = await import("@vercel/sandbox");
  const startedAt = Date.now();
  const resultsPath = `${WORKDIR}/results-${crypto.randomBytes(12).toString("hex")}.json`;
  let program: {
    files: { name: string; content: string }[];
    checked: boolean;
    compile: { command: string; args: string[] } | null;
    run: { command: string; args: string[]; env?: Record<string, string> };
  };
  if (input.language === "python") {
    const built = buildPythonProgram({ code: input.code, harness: input.harness, resultsPath });
    program = {
      files: built.files,
      checked: built.checked,
      compile: null,
      run: {
        command: "python3",
        args: [built.entry],
        env: { PYTHONDONTWRITEBYTECODE: "1" },
      },
    };
  } else if (input.language === "cpp") {
    const built = buildCppProgram({ code: input.code, harness: input.harness, resultsPath });
    program = { ...built, compile: built.compile, run: built.run };
  } else {
    const built = buildJavaProgram({ code: input.code, harness: input.harness, resultsPath });
    program = { ...built, compile: built.compile, run: built.run };
  }
  const snapshotId = process.env.SANDBOX_TOOLCHAIN_SNAPSHOT_ID;
  const sandbox = snapshotId
    ? await Sandbox.create({
        persistent: false,
        networkPolicy: "deny-all",
        resources: { vcpus: 1 },
        timeout: input.timeoutMs + 30_000,
        source: { type: "snapshot", snapshotId },
      })
    : await Sandbox.create({
        persistent: false,
        networkPolicy: "deny-all",
        resources: { vcpus: 1 },
        timeout: input.timeoutMs + 30_000,
      });

  try {
    await sandbox.writeFiles(
      program.files.map((file) => ({
        path: `${WORKDIR}/${file.name}`,
        content: Buffer.from(file.content, "utf8"),
      })),
    );

    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let truncated = false;
    const execute = async (command: string, args: string[], env?: Record<string, string>) => {
      const signal = AbortSignal.timeout(input.timeoutMs);
      try {
        const finished = await sandbox.runCommand({ cmd: command, args, cwd: WORKDIR, env, signal });
        exitCode = finished.exitCode;
        const out = cap(await finished.stdout(), input.maxOutputChars);
        const err = cap(await finished.stderr(), input.maxOutputChars);
        stdout = out.text;
        stderr = err.text;
        truncated = out.truncated || err.truncated;
      } catch (error) {
        if (signal.aborted) timedOut = true;
        else throw error;
      }
    };

    if (program.compile) {
      await execute(program.compile.command, program.compile.args);
      if (timedOut || exitCode !== 0) {
        return {
          proc: {
            stdout,
            stderr,
            exitCode,
            signal: null,
            timedOut,
            truncated,
            durationMs: Date.now() - startedAt,
            spawnError: null,
          },
          harness: { cases: [], error: null, reported: false },
          compileError: timedOut ? "Compilation timed out." : `${stdout}${stderr}`.trim() || "Compilation failed.",
        };
      }
    }

    await execute(program.run.command, program.run.args, program.run.env);

    const harness = program.checked
      ? await sandbox
          .readFileToBuffer({ path: resultsPath })
          .then((buffer) =>
            buffer ? parseHarnessResults(buffer.toString("utf8")) : { cases: [], error: null, reported: false },
          )
      : { cases: [], error: null, reported: true };
    return {
      proc: {
        stdout,
        stderr,
        exitCode,
        signal: null,
        timedOut,
        truncated,
        durationMs: Date.now() - startedAt,
        spawnError: null,
      },
      harness,
      compileError: null,
    };
  } finally {
    await sandbox.stop().catch(() => {
      /* best-effort cleanup; the sandbox also times out on its own */
    });
  }
}
