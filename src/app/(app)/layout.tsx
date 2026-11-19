import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth/session";

// Every page below reads the session per request, so instant-navigation
// validation has nothing to prerender; opt the segment out of its feedback.
export const instant = false;

// Authenticated area. The header reads the session, so it streams behind a
// boundary while the page shell prerenders.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold">
            Docs Copilot
          </Link>
          <Suspense fallback={<span className="text-sm text-muted-foreground">…</span>}>
            <Nav />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4">{children}</div>
    </div>
  );
}

async function Nav() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  return (
    <nav className="flex flex-1 items-center gap-4 text-sm">
      <Link href="/">Ask</Link>
      {isAdmin && <Link href="/admin/documents">Documents</Link>}
      {isAdmin && <Link href="/admin/users">Users</Link>}
      {isAdmin && <Link href="/admin/search">Search debug</Link>}
      {(isAdmin || user.isAuditor) && <Link href="/admin">Dashboard</Link>}
      {user.isAuditor && <Link href="/admin/audit">Audit log</Link>}
      <span className="ml-auto text-muted-foreground">
        {user.fullName} · {user.role.replace("_", " ")}
        {user.isAuditor ? " · auditor" : ""}
      </span>
      <form action={signOut}>
        <button type="submit" className="text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </form>
    </nav>
  );
}
