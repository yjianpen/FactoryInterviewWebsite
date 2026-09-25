import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { CaseResult } from "./types";

// The in-sandbox harness reports results by writing a JSON file (path chosen by
// the server, name randomized per run) rather than printing to stdout. That way:
//  - the stdout we show you is exactly your program's own output
//  - results cannot be faked by printing marker lines
//  - partial results survive a timeout, because the file is rewritten per case

const resultsFileSchema = z.object({
  cases: z
    .array(
      z.object({
        pass: z.boolean(),
        label: z.string(),
        expected: z.string(),
        actual: z.string(),
      }),
    )
    .default([]),
  error: z.string().nullable().default(null),
});

export interface HarnessResults {
  cases: CaseResult[];
  /** Your code failed to load, or the harness itself crashed. */
  error: string | null;
  /** False when the file is missing/unreadable (e.g. killed before writing). */
  reported: boolean;
}

/** Parse the raw JSON produced by the in-run harness. Shared by the local and sandbox runners. */
export function parseHarnessResults(raw: string): HarnessResults {
  try {
    const parsed = resultsFileSchema.parse(JSON.parse(raw));
    return {
      cases: parsed.cases.map((c) => ({
        label: c.label,
        passed: c.pass,
        expected: c.expected,
        actual: c.actual,
      })),
      error: parsed.error,
      reported: true,
    };
  } catch {
    return {
      cases: [],
      error: "The test harness wrote an unreadable result file (this is a bug in the question's harness).",
      reported: true,
    };
  }
}

export async function readHarnessResults(resultsPath: string): Promise<HarnessResults> {
  let raw: string;
  try {
    raw = await readFile(resultsPath, "utf8");
  } catch {
    return { cases: [], error: null, reported: false };
  }

  return parseHarnessResults(raw);
}
