import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoPersonas } from "@/lib/auth/demo";
import { demoSignIn } from "./actions";
import { MagicLinkForm } from "./magic-link-form";

export const metadata: Metadata = { title: "Sign in · Company Docs Copilot" };

const ERRORS: Record<string, string> = {
  demo_unavailable: "Demo login is not enabled.",
  demo_failed: "Demo login failed. Has the database been seeded (pnpm seed)?",
  link_invalid: "That sign-in link is invalid or has expired.",
  no_profile: "Your account is not provisioned in any organization.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to Company Docs Copilot</CardTitle>
            <CardDescription>
              Atlas Lojistik internal assistant. You only get answers from documents you are allowed
              to read.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Suspense>
              <LoginError searchParams={searchParams} />
            </Suspense>
            <MagicLinkForm />
          </CardContent>
        </Card>
        <Suspense>
          <DemoLogins />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

async function DemoLogins() {
  // DEMO_MODE is runtime config, so read it per request, not at build time.
  await connection();
  const personas = demoPersonas();
  if (personas.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Demo accounts</CardTitle>
        <CardDescription>
          Same question, different answers: each persona sees a different slice of the documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={demoSignIn} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {personas.map((p) => (
            <button
              key={p.key}
              type="submit"
              name="persona"
              value={p.key}
              className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.label}</span>
            </button>
          ))}
        </form>
      </CardContent>
    </Card>
  );
}
