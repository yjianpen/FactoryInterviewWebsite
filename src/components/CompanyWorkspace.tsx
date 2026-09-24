"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { STAGE_META } from "@/lib/uiMeta";
import type { CompanyDto } from "@/lib/dto";
import { GenerateQuestionsModal } from "@/components/GenerateQuestionsModal";

const STAGES = ["APPLIED", "PREP", "INTERVIEWING", "OFFER", "REJECTED"] as const;
const FALLBACK_BADGE = "bg-slate-500/10 text-slate-300 ring-slate-500/30";
type GenerationSelection = {
  provider: "curated" | "openai";
  openAIKey?: string;
};

export function CompanyWorkspace({
  company,
  hasQuestions,
  refresh,
}: {
  company: CompanyDto;
  hasQuestions: boolean;
  refresh: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(company.stage);
  const [savingStage, setSavingStage] = useState(false);

  const stageMeta = STAGE_META[company.stage] ?? { label: company.stage, badge: FALLBACK_BADGE };

  const generate = async (selection: GenerationSelection) => {
    setGenerationModalOpen(false);
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/questions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Question generation failed.");
      startTransition(() => refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const deleteCompany = async () => {
    if (!window.confirm(`Delete ${company.name} and all of its questions?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const changeStage = async (next: string) => {
    setSavingStage(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not update stage.");
      }
      setStage(next);
      startTransition(() => refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingStage(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ${stageMeta.badge}`}
        >
          {stageMeta.label}
        </span>
        <div className="flex items-center gap-1">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => changeStage(s)}
              disabled={savingStage || stage === s}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed ${
                stage === s
                  ? "bg-indigo-500 text-white"
                  : "bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {STAGE_META[s]?.label ?? s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setGenerationModalOpen(true)}
            disabled={generating || isPending}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60"
          >
            {generating
              ? "Generating…"
              : hasQuestions
                ? "Regenerate question set"
                : "Generate question set"}
          </button>
          <button
            onClick={deleteCompany}
            disabled={isPending}
            className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <GenerateQuestionsModal
        open={generationModalOpen}
        companyName={company.name}
        generating={generating}
        onCancel={() => setGenerationModalOpen(false)}
        onGenerate={generate}
      />
    </div>
  );
}
