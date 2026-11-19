import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Company Docs Copilot</h1>
      {/* Reads the session cookie, so it streams in behind a boundary while
          the static shell above prerenders. */}
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SignedInAs />
      </Suspense>
    </main>
  );
}

async function SignedInAs() {
  const user = await requireUser();
  return <p className="text-muted-foreground">Signed in as {user.email ?? user.id}</p>;
}
