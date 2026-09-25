import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authRequestSchema } from "@/lib/authValidation";
import { createSession, hashPassword, normalizeUserEmail } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = authRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid registration details." },
      { status: 400 },
    );
  }

  const email = normalizeUserEmail(parsed.data.email);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true },
    });
    await createSession(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    throw error;
  }
}
