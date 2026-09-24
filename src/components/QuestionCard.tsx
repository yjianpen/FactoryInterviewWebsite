"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { CATEGORY_META, DIFFICULTY_META, STATUS_META } from "@/lib/uiMeta";
import { CodePad } from "@/components/CodePad";
import type { QuestionDto } from "@/lib/dto";

const STATUSES = ["TODO", "PRACTICING", "MASTERED"] as const;
const FALLBACK_BADGE = "bg-slate-500/10 text-slate-300 ring-slate-500/30";

export function QuestionCard({
  question,
  onStatusChange,
  onRefresh,
}: {
  question: QuestionDto;
  onStatusChange: (id: string, status: string) => void;
  /** Called when the server changed something on its own (e.g. auto-mastered). */
  onRefresh?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [solution, setSolution] = useState<string | null>(null);
  const [loadingSolution, setLoadingSolution] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(false);

  const practice = question.practice;
  const canPractice = Boolean(practice && practice.languages.length > 0);

  const category = CATEGORY_META[question.category] ?? {
    label: question.category,
    description: "",
    badge: FALLBACK_BADGE,
  };
  const difficulty = DIFFICULTY_META[question.difficulty] ?? {
    label: question.difficulty,
    badge: FALLBACK_BADGE,
  };
  const statusMeta = STATUS_META[question.status] ?? { label: question.status, badge: FALLBACK_BADGE };

  const toggleSolution = async () => {
    if (solution) {
      setRevealed((v) => !v);
      return;
    }
    setLoadingSolution(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${question.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load the solution.");
      setSolution(data.question?.solution ?? "");
      setRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSolution(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${category.badge}`}>
          {category.label}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${difficulty.badge}`}>
          {difficulty.label}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${statusMeta.badge}`}>
          {statusMeta.label}
        </span>
        <span className="rounded-full bg-slate-800/70 px-2.5 py-0.5 text-[11px] font-medium text-slate-400">
          {question.source === "openai" ? "AI-generated" : "curated"}
        </span>
      </div>

      <h4 className="mt-3 font-semibold text-slate-100">{question.title}</h4>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {question.prompt}
      </p>

      {question.testCases.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="px-3 py-2 font-medium">Example</th>
                <th className="px-3 py-2 font-medium">Input</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {question.testCases.map((tc, i) => (
                <tr key={tc.id} className="border-b border-slate-800/60 align-top last:border-0">
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-slate-200">{tc.input}</td>
                  <td className="px-3 py-2 font-mono text-emerald-300">{tc.expected}</td>
                  <td className="px-3 py-2 text-slate-400">{tc.explanation ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {!canPractice && practice?.note && (
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
          {practice.note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canPractice && (
          <button
            onClick={() => setPracticeOpen((v) => !v)}
            className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/40 transition hover:bg-emerald-500/25"
          >
            {practiceOpen ? "Close editor" : "Practice in editor"}
          </button>
        )}
        <button
          onClick={toggleSolution}
          disabled={loadingSolution}
          className="rounded-lg bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/40 transition hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-60"
        >
          {loadingSolution ? "Loading…" : revealed ? "Hide solution" : "Show me the solution"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(question.id, s)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                question.status === s
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {s === "TODO" ? "To do" : s === "PRACTICING" ? "Practicing" : "Mastered"}
            </button>
          ))}
        </div>
      </div>

      {canPractice && practiceOpen && practice && (
        <CodePad
          questionId={question.id}
          practice={practice}
          onAllPassed={onRefresh}
        />
      )}

      {revealed && solution && (
        <div className="mt-4 rounded-xl border border-indigo-500/30 bg-slate-950/70 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Solution
          </p>
          <div className="prose prose-sm prose-invert max-w-none prose-headings:text-slate-100 prose-code:text-indigo-200 prose-pre:bg-slate-900 prose-pre:text-slate-200">
            <ReactMarkdown>{solution}</ReactMarkdown>
          </div>
        </div>
      )}
    </article>
  );
}
