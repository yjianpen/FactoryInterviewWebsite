import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExecSpec } from "@/lib/practice/specs";
import { CodeExecutionDisabledError, runCode } from "@/lib/exec/runner";
import { runRequestSchema } from "@/lib/exec/types";
import { getCurrentUser } from "@/lib/auth";

// Runs submitted code for one question and checks it against the question's
// server-side test harness.
//
// When every case passes, the question is marked MASTERED (chosen behaviour:
// passing the full suite is the definition of done for a coding question).
//
// This executes real code on the server with the server user's permissions. It is
// gated by CONFIG.codeExecutionEnabled, which is off by default in production.
// See the README before exposing this route beyond localhost.

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const question = await prisma.question.findFirst({
    where: { id: params.id, company: { userId: user.id } },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid run request." },
      { status: 400 },
    );
  }
  const { language, code } = parsed.data;

  const spec = parseExecSpec(question.execSpec);
  if (spec && !spec.languages[language]) {
    return NextResponse.json(
      { error: `This question does not support ${language} yet.` },
      { status: 400 },
    );
  }

  try {
    const result = await runCode({ language, code, spec });

    // All green -> the question counts as mastered.
    let statusUpdated: string | null = null;
    if (result.allPassed && question.status !== "MASTERED") {
      await prisma.question.update({
        where: { id: question.id },
        data: { status: "MASTERED" },
      });
      statusUpdated = "MASTERED";
    }

    return NextResponse.json({ result, statusUpdated });
  } catch (error) {
    if (error instanceof CodeExecutionDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not run your code." },
      { status: 500 },
    );
  }
}
