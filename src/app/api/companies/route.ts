import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCompanyDto } from "@/lib/dto";
import { getCurrentUser } from "@/lib/auth";

// CRUD for companies (the list of companies you applied to).

const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required.").max(120),
  role: z.string().trim().max(200).optional().nullable(),
  stage: z.enum(["APPLIED", "PREP", "INTERVIEWING", "OFFER", "REJECTED"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const companies = await prisma.company.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: { select: { questions: true } },
      questions: { where: { status: "MASTERED" }, select: { id: true } },
    },
  });

  return NextResponse.json({
    companies: companies.map((c) =>
      toCompanyDto(c, { total: c._count.questions, mastered: c.questions.length }),
    ),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const { name, role, stage, notes } = parsed.data;

  try {
    const company = await prisma.company.create({
      data: {
        userId: user.id,
        name,
        role: role ?? null,
        stage: stage ?? "APPLIED",
        notes: notes ?? null,
      },
    });
    return NextResponse.json({ company: toCompanyDto(company) }, { status: 201 });
  } catch (error) {
    // P2002: unique constraint on company name.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: `A company named "${name}" already exists in your account.` }, { status: 409 });
    }
    throw error;
  }
}
