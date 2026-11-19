import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 py-8">
      <h1 className="text-2xl font-semibold">Company Docs Copilot</h1>
      {/* Reads the session cookie, so it streams in behind a boundary while
          the static shell above prerenders. */}
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const user = await requireUser();
  return <p className="text-muted-foreground">Signed in as {user.fullName}</p>;
}
