import { prisma } from "@/lib/prisma";
import { toCompanyDto } from "@/lib/dto";
import { SiteHeader } from "@/components/SiteHeader";
import { CompanyCard } from "@/components/CompanyCard";
import { AddCompanyForm } from "@/components/AddCompanyForm";
import { CONFIG } from "@/lib/config";
import { providerStatus } from "@/lib/llm";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

let statusInfo: ReturnType<typeof providerStatus> | null = null;
try {
  statusInfo = providerStatus();
} catch {
  statusInfo = null; // e.g. QUESTION_PROVIDER=openai without a key
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const companies = await prisma.company.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: { select: { questions: true } },
      questions: { where: { status: "MASTERED" }, select: { id: true } },
    },
  });

  const dtos = companies.map((c) =>
    toCompanyDto(c, { total: c._count.questions, mastered: c.questions.length }),
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            Your interview prep workspace
          </h1>
          <p className="mt-3 text-slate-400">
            Add each company you&apos;ve applied to, then generate a tailored question set:
            coding, behavioral, system design and domain-specific questions with test
            examples and on-demand solutions.
          </p>
        </div>

        {CONFIG.showExtras && (
          <p className="mt-4 text-xs text-slate-500">
            {statusInfo ? (
              <>
                Question generator:{" "}
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
                  {statusInfo.provider}
                </span>
                {" ("}
                {statusInfo.hasOpenAIKey
                  ? `${statusInfo.model} via OpenAI`
                  : "offline curated set — add OPENAI_API_KEY to .env for tailored AI questions"}
                ) · {statusInfo.questionsPerCategory} questions per category.
              </>
            ) : (
              <>
                Question generator is misconfigured — check{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                  QUESTION_PROVIDER
                </code>{" "}
                and{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                  OPENAI_API_KEY
                </code>{" "}
                in <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">.env</code>.
              </>
            )}
          </p>
        )}

        <AddCompanyForm />

        {dtos.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-800 p-10 text-center">
            <p className="text-slate-300">No companies yet.</p>
            <p className="mt-1 text-sm text-slate-500">
              Start by adding the first company you&apos;ve applied to above.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dtos.map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
