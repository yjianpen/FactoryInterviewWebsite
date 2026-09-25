import { writeFile } from "node:fs/promises";
import path from "node:path";
import { JAVA_JUDGE_SOURCE } from "./judge";
import type { LanguageRuntime, PreparedProgram } from "./runner";
import type { RuntimeStatus } from "./types";
import { detectCommand } from "./detect";

export interface JavaProgram {
  files: { name: string; content: string }[];
  compile: { command: string; args: string[] };
  run: { command: string; args: string[] };
  checked: boolean;
}

export function buildJavaProgram(input: {
  code: string;
  harness?: string;
  resultsPath: string;
}): JavaProgram {
  if (!input.harness) {
    return {
      files: [{ name: "Solution.java", content: input.code }],
      compile: { command: "javac", args: ["-d", ".", "Solution.java"] },
      run: { command: "java", args: ["Solution"] },
      checked: false,
    };
  }
  return {
    files: [
      { name: "Solution.java", content: input.code },
      {
        name: "Judge.java",
        content: JAVA_JUDGE_SOURCE.replace("__RESULTS_PATH__", JSON.stringify(input.resultsPath)),
      },
      { name: "Main.java", content: input.harness },
    ],
    compile: { command: "javac", args: ["-d", ".", "Main.java"] },
    run: { command: "java", args: ["Main"] },
    checked: true,
  };
}

export const javaRuntime: LanguageRuntime = {
  language: "java",

  async detect() {
    if (process.env.VERCEL) {
      return {
        language: "java",
        label: "Java 21",
        available: true,
        version: null,
        command: "vercel-sandbox",
        hint: null,
      } satisfies RuntimeStatus;
    }
    return detectCommand({
      language: "java",
      label: "Java 21",
      candidates: ["javac"],
      versionArgs: ["-version"],
      installHint: "Install a Java JDK (for example `brew install openjdk`) and restart the app.",
    });
  },

  async prepare({ dir, code, harness, resultsPath }): Promise<PreparedProgram> {
    const status = await javaRuntime.detect();
    if (!status.available || !status.command) {
      return { error: status.hint ?? "A Java JDK was not found on this machine." };
    }
    const program = buildJavaProgram({ code, harness, resultsPath });
    await Promise.all(
      program.files.map((file) => writeFile(path.join(dir, file.name), file.content, "utf8")),
    );
    return {
      compileCommand: "javac",
      compileArgs: program.compile.args,
      command: program.run.command,
      args: program.run.args,
    };
  },
};
