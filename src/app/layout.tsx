import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Space_Grotesk, Source_Serif_4 } from "next/font/google";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif"
});

export const metadata = {
  title: "Golf Weekend Live Scoring",
  description: "Callaway scoring for 16 players"
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let activeEvent: { name: string } | null = null;
  try {
    activeEvent = await prisma.event.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { name: true }
    });
  } catch {
    activeEvent = null;
  }
  const appName = activeEvent?.name ?? "Golf Weekend";

  return (
    <html lang="en-AU">
      <body className={`${sans.variable} ${serif.variable} min-h-screen`}>
        <header className="sticky top-0 z-10 border-b border-white/60 bg-[#fffcf6]/80 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/leaderboard" className="font-serif text-2xl font-semibold tracking-tight text-slate-900">
              {appName} <span className="text-base text-teal-700">Live</span>
            </Link>
            <div className="flex items-center gap-2 text-sm font-medium">
              {session ? (
                <>
                  {session.role === "ADMIN" && <Link className="btn-secondary" href="/admin">Admin</Link>}
                  {session.role === "PLAYER" && <Link className="btn-secondary" href="/scorecard">My Scorecard</Link>}
                  <Link className="btn-secondary" href="/leaderboard">Leaderboard</Link>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit" className="btn-primary">
                      Logout
                    </button>
                  </form>
                </>
              ) : (
                <Link className="btn-primary" href="/login">Login</Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
