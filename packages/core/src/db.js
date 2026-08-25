import { PrismaClient } from "@prisma/client";

// Prevent multiple PrismaClient instances in dev (hot-reload) from
// exhausting Supabase's connection pool.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}