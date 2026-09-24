import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toQuestionDto } from "@/lib/dto";

// Per-question endpoints:
//  - GET    -> the full question INCLUDING the solution (reveal-on-demand)
//  - PATCH  -> update practice status (TODO | PRACTICING | MASTERED)

const updateStatusSchema = z.object({
  status: z.enum(["TODO", "PRACTICING", "MASTERED"]),
});

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const question = await prisma.question.findUnique({
    where: { id: params.id },
    include: { testCases: { orderBy: { sortOrder: "asc" } } },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }
  // Reveal endpoint: the only place the solution is sent to the client.
  return NextResponse.json({
    question: { ...toQuestionDto(question), solution: question.solution },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const existing = await prisma.question.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status must be TODO, PRACTICING or MASTERED." }, { status: 400 });
  }
  const question = await prisma.question.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ question: toQuestionDto(question) });
}
