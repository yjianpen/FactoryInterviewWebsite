import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authRequestSchema } from "@/lib/authValidation";
import {
  clearLoginFailures,
  createSession,
  getLoginRateLimitKey,
  isLoginRateLimited,
  normalizeUserEmail,
  recordLoginFailure,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = authRequestSchema.safeParse(body);
  const email = typeof body?.email === "string" ? normalizeUserEmail(body.email) : "";
  const rateKey = getLoginRateLimitKey(request, email);

  if (isLoginRateLimited(rateKey)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }
  if (!parsed.success) {
    recordLoginFailure(rateKey);
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid login details." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  clearLoginFailures(rateKey);
  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
