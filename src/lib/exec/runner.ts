import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { CONFIG } from "@/lib/config";
import { readHarnessResults } from "./results";
import type { HarnessResults } from "./results";
import { runProcess } from "./process";
import type { ProcessResult } from "./process";
import { runInSandbox } from "./sandbox";
import { cppRuntime } from "./cpp";
import { javaRuntime } from "./java";
import { pythonRuntime } from "./python";
import { RUN_LANGUAGES, LANGUAGE_META } from "./types";
import type { ExecSpec, RunLanguage, RunResult, RuntimeStatus } from "./types";

// Runtime registry + the single entry point the API route uses.
//
// HOW TO ADD A LANGUAGE (e.g. C++):
//  1. Create src/lib/exec/cpp.ts exporting a LanguageRuntime. `prepare` may compile
//     first and return { error } to report a compile error.
//  2. Register it in RUNTIMES below.
//  3. Add "cpp" to RUN_LANGUAGES / LANGUAGE_META / languagesSchema in ./types.ts.
//  4. Give questions a cpp `starter` + `harness` in src/lib/practice/specs.ts.
// The API route, the UI and the results table are all language-agnostic already.

export interface PreparedProgram {
  /** Optional build step. Its failures are reported as compileError. */
  compileCommand?: string;
  compileArgs?: string[];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Set instead of command/args when the program cannot be built at all. */
  error?: string;
}

export interface PrepareInput {
  /** Throwaway working directory, deleted after the run. */
  dir: string;
  code: string;
  /** Absent in freeform mode (run without assertions). */
  harness?: string;
  /** Where the harness must write its JSON results. */
  resultsPath: string;
}

export interface LanguageRuntime {
  readonly language: RunLanguage;
  detect(): Promise<RuntimeStatus>;
  prepare(input: PrepareInput): Promise<PreparedProgram>;
}

const RUNTIMES: Partial<Record<RunLanguage, LanguageRuntime>> = {
  python: pythonRuntime,
  cpp: cppRuntime,
  java: javaRuntime,
};

export async function runtimeStatuses(): Promise<RuntimeStatus[]> {
  return Promise.all(
    RUN_LANGUAGES.map(async (language) => {
      const runtime = RUNTIMES[language];
      if (!runtime) {
        return {
          language,
          label: LANGUAGE_META[language].label,
          available: false,
          version: null,
          command: null,
          hint: "No runtime is registered for this language yet.",
        } satisfies RuntimeStatus;
      }
      return runtime.detect();
    }),
  );
}

export class CodeExecutionDisabledError extends Error {}

/**
 * Turn a finished process plus its harness results into the RunResult the API
 * and UI consume. Shared by the local spawn runner and the Vercel Sandbox
 * runner so grading behaviour is identical on both.
 */
function assembleResult(
  base: RunResult,
  proc: ProcessResult,
  harnessResults: HarnessResults,
  mode: RunResult["mode"],
): RunResult {
  const passed = harnessResults.cases.filter((c) => c.passed).length;
  const total = harnessResults.cases.length;
  const timeoutSeconds = Math.round(CONFIG.runTimeoutMs / 1000);

  let runtimeError: string | null = harnessResults.error;
  if (proc.timedOut) {
    runtimeError = `Timed out after ${timeoutSeconds}s — check for an infinite loop.`;
  } else if (!runtimeError && mode === "checked" && !harnessResults.reported) {
    runtimeError =
      proc.exitCode === 0
        ? "The run finished without reporting any results (the question's harness may be broken)."
        : "Your program crashed before the tests could report. See the error output below.";
  } else if (!runtimeError && mode === "freeform" && proc.exitCode !== 0) {
    runtimeError = "Your program exited with a non-zero status. See the error output below.";
  }

  return {
    ...base,
    ok: !proc.timedOut && !runtimeError,
    cases: harnessResults.cases,
    passed,
    total,
    allPassed: mode === "checked" && total > 0 && passed === total && !proc.timedOut && !runtimeError,
    stdout: proc.stdout.replace(/\s+$/, ""),
    stderr: proc.stderr.replace(/\s+$/, ""),
    runtimeError,
    timedOut: proc.timedOut,
    truncated: proc.truncated,
    exitCode: proc.exitCode,
    durationMs: proc.durationMs,
  };
}

export interface RunCodeInput {
  language: RunLanguage;
  code: string;
  spec: ExecSpec | null;
}

export async function runCode({ language, code, spec }: RunCodeInput): Promise<RunResult> {
  if (!CONFIG.codeExecutionEnabled) {
    throw new CodeExecutionDisabledError(
      "Code execution is disabled. Set CODE_EXECUTION_ENABLED=true in .env to enable it.",
    );
  }

  const runtime = RUNTIMES[language];
  if (!runtime) throw new Error(`No runtime is registered for ${language}.`);

  const harness = spec?.languages?.[language]?.harness;
  const mode = harness ? "checked" : "freeform";

  const base: RunResult = {
    language,
    mode,
    ok: false,
    cases: [],
    passed: 0,
    total: 0,
    allPassed: false,
    stdout: "",
    stderr: "",
    compileError: null,
    runtimeError: null,
    timedOut: false,
    truncated: false,
    exitCode: null,
    durationMs: 0,
  };

  // Vercel's serverless runtime has no language toolchains, so every language
  // runs in an isolated Sandbox microVM there.
  if (process.env.VERCEL) {
    const sandboxed = await runInSandbox({
      language,
      code,
      harness,
      timeoutMs: CONFIG.runTimeoutMs,
      maxOutputChars: CONFIG.maxRunOutputChars,
    });
    if (sandboxed.compileError) {
      return { ...base, compileError: sandboxed.compileError, durationMs: sandboxed.proc.durationMs };
    }
    return assembleResult(base, sandboxed.proc, sandboxed.harness, mode);
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "interview-prep-run-"));
  // Randomized name: practiced code cannot guess the path and pre-write results.
  const resultsPath = path.join(dir, `results-${crypto.randomBytes(12).toString("hex")}.json`);

  try {
    const prepared = await runtime.prepare({ dir, code, harness, resultsPath });
    if (prepared.error || !prepared.command) {
      return { ...base, compileError: prepared.error ?? "Could not prepare the program." };
    }

    if (prepared.compileCommand) {
      const compile = await runProcess({
        command: prepared.compileCommand,
        args: prepared.compileArgs ?? [],
        cwd: dir,
        timeoutMs: CONFIG.runTimeoutMs,
        maxOutputChars: CONFIG.maxRunOutputChars,
      });
      if (compile.spawnError) {
        return {
          ...base,
          compileError: `Could not start ${prepared.compileCommand}: ${compile.spawnError}`,
          durationMs: compile.durationMs,
        };
      }
      if (compile.timedOut || compile.exitCode !== 0) {
        return {
          ...base,
          compileError: `${compile.stdout}${compile.stderr}`.trim() || "Compilation failed.",
          timedOut: compile.timedOut,
          truncated: compile.truncated,
          exitCode: compile.exitCode,
          durationMs: compile.durationMs,
        };
      }
    }

    const proc = await runProcess({
      command: prepared.command,
      args: prepared.args ?? [],
      cwd: dir,
      timeoutMs: CONFIG.runTimeoutMs,
      maxOutputChars: CONFIG.maxRunOutputChars,
      env: prepared.env,
    });

    if (proc.spawnError) {
      return {
        ...base,
        compileError: `Could not start ${prepared.command}: ${proc.spawnError}`,
        durationMs: proc.durationMs,
      };
    }

    const harnessResults =
      mode === "checked"
        ? await readHarnessResults(resultsPath)
        : { cases: [], error: null, reported: true };

    return assembleResult(base, proc, harnessResults, mode);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      /* temp dir cleanup is best-effort */
    });
  }
}
