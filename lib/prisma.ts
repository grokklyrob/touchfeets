import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Prisma singleton for Next.js (avoids hot-reload multiple client instances)
 */
export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;