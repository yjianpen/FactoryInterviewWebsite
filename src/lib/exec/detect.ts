import os from "node:os";
import { runProcess } from "./process";
import type { RunLanguage, RuntimeStatus } from "./types";

// Toolchain detection, cached per server process. Results feed /api/status and
// the codepad UI so a missing toolchain produces an actionable message instead
// of a mysterious failure.

export interface DetectOptions {
  language: RunLanguage;
  label: string;
  /** Tried in order; the first one that answers wins. */
  candidates: string[];
  versionArgs: string[];
  installHint: string;
}

const cache = new Map<RunLanguage, RuntimeStatus>();

export async function detectCommand(options: DetectOptions): Promise<RuntimeStatus> {
  const cached = cache.get(options.language);
  if (cached) return cached;

  const problems: string[] = [];

  for (const candidate of options.candidates) {
    const result = await runProcess({
      command: candidate,
      args: options.versionArgs,
      cwd: os.tmpdir(),
      timeoutMs: 5000,
      maxOutputChars: 4000,
    });

    const output = `${result.stdout}${result.stderr}`.trim();

    if (result.spawnError || result.exitCode !== 0) {
      // A toolchain can be installed but refuse to run. The Xcode license gate is
      // the common macOS case and has a specific fix, so pass it through verbatim.
      if (/have not agreed to the Xcode.*license/i.test(output)) {
        const status: RuntimeStatus = {
          language: options.language,
          label: options.label,
          available: false,
          version: null,
          command: null,
          hint: "macOS is blocking the compiler until you accept the Xcode license. Run `sudo xcodebuild -license accept` in a terminal, then restart the app.",
        };
        cache.set(options.language, status);
        return status;
      }
      if (output) problems.push(`${candidate}: ${output.split("\n")[0]}`);
      continue;
    }

    const status: RuntimeStatus = {
      language: options.language,
      label: options.label,
      available: true,
      version: output.split("\n")[0] || null,
      command: candidate,
      hint: null,
    };
    cache.set(options.language, status);
    return status;
  }

  const status: RuntimeStatus = {
    language: options.language,
    label: options.label,
    available: false,
    version: null,
    command: null,
    hint: problems.length ? `${options.installHint} (${problems[0]})` : options.installHint,
  };
  cache.set(options.language, status);
  return status;
}

/** Drop cached detection, e.g. after the user installs a toolchain. */
export function clearRuntimeCache() {
  cache.clear();
}
