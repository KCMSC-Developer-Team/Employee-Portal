import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Credentials auth uses Prisma for account lookup. JWT sessions avoid requiring
// adapter-owned OAuth models; role is reloaded at sign-in.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: { label: "Employee ID / email", type: "text" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const login = credentials.email.trim();
        const user = await prisma.user.findFirst({
          where: { OR: [{ email: login.toLowerCase() }, { employee: { is: { employeeId: login } } }] },
          include: { employee: true }
        });
        if (!user || !user.active || !(await bcrypt.compare(credentials.password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.employee?.fullNameEnglish || user.email, role: user.role } as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = (user as any).role; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) { (session.user as any).id = token.id; (session.user as any).role = token.role; }
      return session;
    }
  },
  pages: { signIn: "/login" }
};
