import NextAuth, { type NextAuthOptions, type Session } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";

/**
 * NextAuth configuration:
 * - Google provider only (no age gate, no TOS gating)
 * - Minimal session: expose user id and email only
 * - Prisma adapter for DB persistence
 */
export const authConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: false,
    }),
    // Email provider can be added later if SMTP is configured
    // Email({
    //   server: process.env.EMAIL_SERVER,
    //   from: process.env.EMAIL_FROM,
    // }),
  ],
  session: {
    // Database sessions via Prisma Adapter
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }: { session: Session; user: AdapterUser }) {
      // Return minimal session data as requested
      if (session.user) {
        session.user = {
          id: user.id,
          email: user.email ?? null,
          name: user.name ?? null,
          image: user.image ?? null,
        } as typeof session.user;
      }
      return session;
    },
  },
  // Use secure defaults; set NEXTAUTH_URL and NEXTAUTH_SECRET in env
} satisfies NextAuthOptions;

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };