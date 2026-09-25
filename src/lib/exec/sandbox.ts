import crypto from "node:crypto";
import type { ProcessResult } from "./process";
import type { HarnessResults } from "./results";
import { parseHarnessResults } from "./results";
import { buildPythonProgram } from "./python";

// Python execution inside a Vercel Sandbox microVM.
//
// The Vercel serverless runtime ships no system Python, so on Vercel the codepad
// cannot spawn a local interpreter. Instead the same program (see
// buildPythonProgram) runs in an isolated Firecracker VM whose image includes
// Python, and results come back through the same JSON file protocol — so the
// grading logic in runner.ts is shared between both paths.
//
// The Vercel SDK is imported dynamically so the module is only loaded in the
// Vercel runtime (it requires Node 20.18+ and is externalized from the bundle).

const WORKDIR = "/vercel/sandbox";

export interface SandboxRunInput {
  code: string;
  /** Absent in freeform mode (run without assertions). */
  harness?: string;
  /** Hard wall-clock limit for the run (ms). */
  timeoutMs: number;
  /** Per-stream output cap (chars). */
  maxOutputChars: number;
}

export interface SandboxRunOutput {
  proc: ProcessResult;
  harness: HarnessResults;
}

function cap(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export async function runPythonInSandbox(input: SandboxRunInput): Promise<SandboxRunOutput> {
  const { Sandbox } = await import("@vercel/sandbox");

  const startedAt = Date.now();
  // Randomized name: practiced code cannot guess the path and pre-write results.
  const resultsPath = `${WORKDIR}/results-${crypto.randomBytes(12).toString("hex")}.json`;
  const program = buildPythonProgram({ code: input.code, harness: input.harness, resultsPath });

  const sandbox = await Sandbox.create({
    // One-off run: do not snapshot the filesystem on stop.
    persistent: false,
    // Practiced code needs no network; deny egress by default.
    networkPolicy: "deny-all",
    resources: { vcpus: 1 },
    // Session lifetime, not the run limit: this only bounds a leaked sandbox.
    timeout: input.timeoutMs + 30_000,
  });

  try {
    await sandbox.writeFiles(
      program.files.map((file) => ({
        path: `${WORKDIR}/${file.name}`,
        content: Buffer.from(file.content, "utf8"),
      })),
    );

    let exitCode: number | null = null;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const signal = AbortSignal.timeout(input.timeoutMs);
    try {
      const finished = await sandbox.runCommand({
        cmd: "python3",
        args: [program.entry],
        cwd: WORKDIR,
        env: { PYTHONDONTWRITEBYTECODE: "1" },
        signal,
      });
      exitCode = finished.exitCode;
      stdout = await finished.stdout();
      stderr = await finished.stderr();
    } catch (error) {
      // A cancelled command is reported as a timeout; anything else is real.
      if (signal.aborted) {
        timedOut = true;
      } else {
        throw error;
      }
    }

    let harness: HarnessResults;
    if (program.checked) {
      const buffer = await sandbox.readFileToBuffer({ path: resultsPath }).catch(() => null);
      // Missing file (e.g. killed before writing) stays reported: false.
      harness = buffer
        ? parseHarnessResults(buffer.toString("utf8"))
        : { cases: [], error: null, reported: false };
    } else {
      harness = { cases: [], error: null, reported: true };
    }

    const out = cap(stdout, input.maxOutputChars);
    const err = cap(stderr, input.maxOutputChars);

    return {
      proc: {
        stdout: out.text,
        stderr: err.text,
        exitCode,
        signal: null,
        timedOut,
        truncated: out.truncated || err.truncated,
        durationMs: Date.now() - startedAt,
        spawnError: null,
      },
      harness,
    };
  } finally {
    await sandbox.stop().catch(() => {
      /* best-effort cleanup; the sandbox also times out on its own */
    });
  }
}
