import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { decideAuthorization } from "./actions";

// Consent screen for Supabase Auth's OAuth 2.1 server (MCP clients). The
// signed-in employee decides whether a client may act as them; the client then
// sees exactly what this employee can see, nothing more.
export default function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Consent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Consent({ searchParams }: Pick<PageProps<"/oauth/consent">, "searchParams">) {
  const { authorization_id: id } = await searchParams;
  if (typeof id !== "string") return <p className="text-sm text-destructive">Missing authorization request.</p>;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <p className="text-sm text-destructive">This authorization request is invalid or expired.</p>;
  // Already decided (e.g. previously approved): Auth hands back the redirect.
  if ("redirect_url" in data) redirect(data.redirect_url);

  return (
    <form action={decideAuthorization} className="flex max-w-md flex-col gap-3 rounded-lg border p-6 text-sm">
      <h1 className="text-base font-semibold">Allow {data.client.name || "this application"} to use Company Docs Copilot as you?</h1>
      <p className="text-muted-foreground">
        It will be able to search and read the documents <strong>{data.user.email}</strong> can access, and ask
        questions on your behalf. Every request is logged.
      </p>
      <p className="text-xs text-muted-foreground">Redirects to: {data.redirect_uri}</p>
      <input type="hidden" name="authorization_id" value={id} />
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approve">
          Allow
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline">
          Deny
        </Button>
      </div>
    </form>
  );
}
