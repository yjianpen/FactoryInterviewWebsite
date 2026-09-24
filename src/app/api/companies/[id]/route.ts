import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCompanyDto, toQuestionDto } from "@/lib/dto";

// Per-company detail: GET (company + questions, no solutions), PATCH (edit), DELETE.

const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().max(200).nullable().optional(),
  stage: z.enum(["APPLIED", "PREP", "INTERVIEWING", "OFFER", "REJECTED"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      questions: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
        include: { testCases: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  const { questions, ...rest } = company;
  return NextResponse.json({
    company: toCompanyDto(rest),
    questions: questions.map(toQuestionDto),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const existing = await prisma.company.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const company = await prisma.company.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    return NextResponse.json({ company: toCompanyDto(company) });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Another company already uses that name." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const existing = await prisma.company.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  await prisma.company.delete({ where: { id: params.id } }); // cascades questions + test cases
  return NextResponse.json({ ok: true });
}
