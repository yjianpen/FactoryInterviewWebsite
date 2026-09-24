import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

// Reuse a single PrismaClient across dev hot-reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // SQLite + Prisma 5: WAL journaling is on by default; nothing else to tune here.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type { Prisma };
