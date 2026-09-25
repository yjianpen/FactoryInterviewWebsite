"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { LANGUAGE_META } from "@/lib/exec/types";
import type { PracticeMeta, RunLanguage, RunResult } from "@/lib/exec/types";

// CodeMirror touches the DOM, so it must not render during SSR.
const CodeMirror = dynamic(() => import("@uiw/react-codemirror").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-950/60" />
  ),
});

function draftKey(questionId: string, language: RunLanguage) {
  return `interview-prep:draft:${questionId}:${language}`;
}

export function CodePad({
  questionId,
  practice,
  onAllPassed,
}: {
  questionId: string;
  practice: PracticeMeta;
  /** Called after the server marks the question mastered, so the page can refresh. */
  onAllPassed?: () => void;
}) {
  const languages = practice.languages;
  const [language, setLanguage] = useState<RunLanguage>(languages[0] ?? "python");
  const starter = practice.starters[language] ?? "";
  const [code, setCode] = useState(starter);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  // Restore the draft for this question+language, falling back to the starter.
  useEffect(() => {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(draftKey(questionId, language));
    setCode(saved ?? practice.starters[language] ?? "");
    setResult(null);
    setError(null);
  }, [questionId, language, practice.starters]);

  const updateCode = useCallback(
    (value: string) => {
      setCode(value);
      try {
        window.localStorage.setItem(draftKey(questionId, language), value);
      } catch {
        /* storage can be full or blocked; drafts are a convenience only */
      }
    },
    [questionId, language],
  );

  const reset = () => {
    const fresh = practice.starters[language] ?? "";
    setCode(fresh);
    setResult(null);
    setError(null);
    try {
      window.localStorage.removeItem(draftKey(questionId, language));
    } catch {
      /* ignore */
    }
  };

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${questionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not run your code.");
      setResult(data.result as RunResult);
      setShowOutput(Boolean(data.result?.stdout || data.result?.stderr));
      if (data.statusUpdated === "MASTERED") onAllPassed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [code, language, questionId, onAllPassed]);

  const extensions = useMemo(() => {
    const extension = { python, cpp, java }[language];
    return [extension()];
  }, [language]);
  const runLabel = practice.mode === "checked" ? "Run tests" : "Run code";

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Codepad
        </span>
        {practice.mode === "freeform" && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30">
            no auto-check
          </span>
        )}
        {languages.length > 1 && (
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as RunLanguage)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_META[l].label}
              </option>
            ))}
          </select>
        )}
        {languages.length === 1 && (
          <span className="text-xs text-slate-500">{LANGUAGE_META[languages[0]].label}</span>
        )}
        <span className="ml-auto text-[11px] text-slate-500">⌘/Ctrl + Enter to run</span>
      </div>

      {practice.entry && (
        <p className="mt-2 font-mono text-xs text-indigo-300">{practice.entry}</p>
      )}
      {practice.note && <p className="mt-1 text-xs text-slate-500">{practice.note}</p>}

      <div
        className="mt-3 overflow-hidden rounded-xl border border-slate-800"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (!running) void run();
          }
        }}
      >
        <CodeMirror
          value={code}
          height="320px"
          theme={oneDark}
          extensions={extensions}
          onChange={updateCode}
          basicSetup={{ tabSize: 4, autocompletion: false }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
        >
          {running ? "Running…" : runLabel}
        </button>
        <button
          onClick={reset}
          disabled={running}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800/60"
        >
          Reset
        </button>
        {result && (
          <>
            {result.mode === "checked" && result.total > 0 && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  result.allPassed
                    ? "bg-green-500/10 text-green-300 ring-green-500/30"
                    : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                }`}
              >
                {result.passed}/{result.total} tests passed
                {result.allPassed ? " · marked mastered" : ""}
              </span>
            )}
            <span className="text-[11px] text-slate-500">{result.durationMs} ms</span>
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {result?.compileError && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-200">
          {result.compileError}
        </pre>
      )}

      {result?.runtimeError && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
          {result.runtimeError}
        </pre>
      )}

      {result && result.cases.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="px-3 py-2 font-medium">Test</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Your result</th>
              </tr>
            </thead>
            <tbody>
              {result.cases.map((c, i) => (
                <tr key={`${c.label}-${i}`} className="border-b border-slate-800/60 align-top last:border-0">
                  <td className="px-3 py-2">
                    <span className={c.passed ? "text-green-400" : "text-rose-400"}>
                      {c.passed ? "PASS" : "FAIL"}
                    </span>
                    <span className="ml-2 text-slate-300">{c.label}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{c.expected}</td>
                  <td
                    className={`px-3 py-2 font-mono ${c.passed ? "text-slate-400" : "text-rose-300"}`}
                  >
                    {c.actual}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (result.stdout || result.stderr) && (
        <div className="mt-3">
          <button
            onClick={() => setShowOutput((v) => !v)}
            className="text-xs font-medium text-slate-400 transition hover:text-slate-200"
          >
            {showOutput ? "Hide" : "Show"} program output
          </button>
          {showOutput && (
            <div className="mt-2 space-y-2">
              {result.stdout && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                  {result.stdout}
                </pre>
              )}
              {result.stderr && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-amber-200/90">
                  {result.stderr}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {result?.truncated && (
        <p className="mt-2 text-[11px] text-slate-500">
          Output was truncated because it exceeded the size limit.
        </p>
      )}
    </div>
  );
}
