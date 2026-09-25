import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CPP_JUDGE_HEADER } from "./judge";
import type { LanguageRuntime, PreparedProgram } from "./runner";
import type { RuntimeStatus } from "./types";
import { detectCommand } from "./detect";

export interface CppProgram {
  files: { name: string; content: string }[];
  compile: { command: string; args: string[] };
  run: { command: string; args: string[] };
  checked: boolean;
}

export function buildCppProgram(input: {
  code: string;
  harness?: string;
  resultsPath: string;
}): CppProgram {
  if (!input.harness) {
    return {
      files: [{ name: "solution.cpp", content: input.code }],
      compile: { command: "g++", args: ["-std=c++20", "-O2", "solution.cpp", "-o", "solution"] },
      run: { command: "./solution", args: [] },
      checked: false,
    };
  }

  return {
    files: [
      { name: "solution.cpp", content: input.code },
      {
        name: "judge.hpp",
        content: CPP_JUDGE_HEADER.replace("__RESULTS_PATH__", JSON.stringify(input.resultsPath)),
      },
      {
        name: "harness.cpp",
        content: `#include "judge.hpp"\n#include "solution.cpp"\n\n${input.harness}`,
      },
    ],
    compile: { command: "g++", args: ["-std=c++20", "-O2", "harness.cpp", "-o", "solution"] },
    run: { command: "./solution", args: [] },
    checked: true,
  };
}

export const cppRuntime: LanguageRuntime = {
  language: "cpp",

  async detect() {
    if (process.env.VERCEL) {
      return {
        language: "cpp",
        label: "C++ 20",
        available: true,
        version: null,
        command: "vercel-sandbox",
        hint: null,
      } satisfies RuntimeStatus;
    }
    return detectCommand({
      language: "cpp",
      label: "C++ 20",
      candidates: ["g++", "clang++"],
      versionArgs: ["--version"],
      installHint: "Install a C++20 compiler (Xcode Command Line Tools or `brew install gcc`) and restart the app.",
    });
  },

  async prepare({ dir, code, harness, resultsPath }): Promise<PreparedProgram> {
    const status = await cppRuntime.detect();
    if (!status.available || !status.command) {
      return { error: status.hint ?? "A C++ compiler was not found on this machine." };
    }
    const program = buildCppProgram({ code, harness, resultsPath });
    const compiler = status.command;
    await Promise.all(
      program.files.map((file) => writeFile(path.join(dir, file.name), file.content, "utf8")),
    );
    return {
      compileCommand: compiler,
      compileArgs: program.compile.args,
      command: program.run.command,
      args: program.run.args,
    };
  },
};
