"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { CompanyWorkspace } from "@/components/CompanyWorkspace";
import { QuestionCard } from "@/components/QuestionCard";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/uiMeta";
import type { CompanyDto, QuestionDto } from "@/lib/dto";

export default function CompanyPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${params.id}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load company.");
      setCompany(data.company);
      setQuestions(data.questions ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (questionId: string, status: string) => {
    const res = await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    await load(); // refresh statuses from the server
  };

  if (loadError) {
    return (
      <>
        <SiteHeader backHref="/" />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-rose-400">{loadError}</p>
        </main>
      </>
    );
  }

  if (!company) {
    return (
      <>
        <SiteHeader backHref="/" />
        <main className="mx-auto max-w-6xl px-6 py-10 text-slate-400">Loading…</main>
      </>
    );
  }

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    meta: CATEGORY_META[cat],
    questions: questions
      .filter((q) => q.category === cat)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return (
    <>
      <SiteHeader backHref="/" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{company.name}</h1>
          {company.role && <p className="mt-1 text-sm text-slate-400">{company.role}</p>}
        </div>

        <CompanyWorkspace
          company={company}
          hasQuestions={questions.length > 0}
          refresh={load}
        />

        {questions.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-800 p-10 text-center">
            <p className="text-slate-300">No questions yet.</p>
            <p className="mt-1 text-sm text-slate-500">
              Hit &ldquo;Generate question set&rdquo; above to create coding, behavioral,
              system design and domain questions for {company.name}.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {byCategory.map(({ category, meta, questions: qs }) =>
              qs.length === 0 ? null : (
                <section key={category}>
                  <div className="mb-3">
                    <h2 className="text-base font-semibold text-slate-100">{meta.label}</h2>
                    <p className="text-sm text-slate-500">{meta.description}</p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {qs.map((q) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        onStatusChange={handleStatusChange}
                        onRefresh={load}
                      />
                    ))}
                  </div>
                </section>
              ),
            )}
          </div>
        )}
      </main>
    </>
  );
}
