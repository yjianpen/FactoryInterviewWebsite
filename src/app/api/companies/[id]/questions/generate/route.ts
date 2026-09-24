import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateQuestionSet } from "@/lib/llm";
import { profileFor } from "@/lib/companyKnowledge";
import { execSpecForTitle } from "@/lib/practice/specs";
import type { GeneratedQuestion } from "@/lib/llm/types";
import type { ExecSpec } from "@/lib/exec/types";

/**
 * Attach the codepad configuration for a generated question:
 *  1. a verified harness from the practice registry (real pass/fail checking), or
 *  2. provider-supplied starter code (runs, but nothing is asserted), or
 *  3. nothing.
 */
function serializeExecSpec(question: GeneratedQuestion): string | null {
  const curated = execSpecForTitle(question.title);
  if (curated) return JSON.stringify(curated);

  const python = question.starterCode?.python?.trim();
  if (question.category === "CODING" && python) {
    const spec: ExecSpec = {
      note: "Generated starter code: your code runs, but there is no automatic test harness for this question yet. Compare against the example test cases above.",
      languages: { python: { starter: python.endsWith("\n") ? python : `${python}\n` } },
    };
    return JSON.stringify(spec);
  }

  return null;
}

// Generate a company's question set (curated offline or via OpenAI) and
// persist it. Regenerating replaces the existing set for that company.
// The DB is only touched AFTER generation succeeds, so a failed LLM call
// never wipes an existing question set.

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const profile = profileFor(company.name);

  let generated;
  try {
    generated = await generateQuestionSet({
      companyName: company.name,
      role: company.role,
      domains: profile?.domains ?? [],
      focusAreas: profile?.focusAreas ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Question generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Replace previous questions (statuses reset on regeneration).
  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { companyId: company.id } });

    for (let i = 0; i < generated.questions.length; i++) {
      const q = generated.questions[i];
      await tx.question.create({
        data: {
          companyId: company.id,
          category: q.category,
          title: q.title,
          prompt: q.prompt,
          difficulty: q.difficulty,
          solution: q.solution,
          status: "TODO",
          source: generated.source,
          sortOrder: i,
          execSpec: serializeExecSpec(q),
          testCases: {
            create: q.testCases.map((tc, j) => ({
              input: tc.input,
              expected: tc.expected,
              explanation: tc.explanation ?? null,
              sortOrder: j,
            })),
          },
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    source: generated.source,
    count: generated.questions.length,
  });
}
