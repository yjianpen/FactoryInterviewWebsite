"use client";

import { useEffect, useState } from "react";

type GenerationSelection = {
  provider: "curated" | "openai";
  openAIKey?: string;
};

export function GenerateQuestionsModal({
  open,
  companyName,
  generating,
  onCancel,
  onGenerate,
}: {
  open: boolean;
  companyName: string;
  generating: boolean;
  onCancel: () => void;
  onGenerate: (selection: GenerationSelection) => void;
}) {
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) setApiKey("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [generating, onCancel, open]);

  if (!open) return null;

  const trimmedKey = apiKey.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !generating) onCancel();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-questions-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="generate-questions-title" className="text-lg font-semibold text-slate-100">
              Generate questions for {companyName}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Add an OpenAI API key for higher-quality, current company-specific questions and
              public interview-report research.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={generating}
            aria-label="Close generation dialog"
            className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <label htmlFor="openai-generation-key" className="mt-5 block text-sm font-medium text-slate-300">
          OpenAI API key <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="openai-generation-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
          disabled={generating}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500"
        />
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          The key is sent only with this request and is not saved in the database or browser
          storage. Leave it blank to use the curated offline generator. A server-configured key,
          if present, can also be used.
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onGenerate({ provider: "curated" })}
            disabled={generating}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            Use curated fallback
          </button>
          <button
            type="button"
            onClick={() =>
              onGenerate({ provider: "openai", openAIKey: trimmedKey || undefined })
            }
            disabled={generating}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate high-quality set"}
          </button>
        </div>
      </div>
    </div>
  );
}
