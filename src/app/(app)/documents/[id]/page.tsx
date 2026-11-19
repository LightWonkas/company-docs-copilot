import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Document viewer. Content comes from chunks under RLS, so this page can only
// show what the viewer may read (admins see metadata-only pages for docs they
// can't read). Text is rendered as plain text, never as Markdown/HTML, so a
// poisoned document can't inject links, images or markup here.
export default function DocumentPage(props: PageProps<"/documents/[id]">) {
  return (
    <main className="flex flex-col gap-4 py-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <DocumentView {...props} />
      </Suspense>
    </main>
  );
}

async function DocumentView({ params, searchParams }: PageProps<"/documents/[id]">) {
  await requireUser();
  const { id } = await params;
  const { chunk } = await searchParams;
  const supabase = await createClient();

  const [{ data: doc }, { data: chunks }] = await Promise.all([
    supabase.from("documents").select("title, language, scope, version, updated_at").eq("id", id).maybeSingle(),
    supabase.from("chunks").select("id, ordinal, heading_path, text, injection_suspected").eq("document_id", id).eq("kind", "chunk").order("ordinal"),
  ]);
  if (!doc) notFound();

  return (
    <>
      <header>
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        <p className="text-xs text-muted-foreground">
          {doc.scope} · {doc.language.toUpperCase()} · v{doc.version}
        </p>
      </header>
      {(chunks ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">You can see this document&apos;s metadata but not its content.</p>
      )}
      {(chunks ?? []).map((c) => (
        <section
          key={c.id}
          id={c.id}
          className={`rounded-lg border p-3 text-sm whitespace-pre-wrap ${c.id === chunk ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : ""}`}
        >
          <div className="mb-1 text-xs text-muted-foreground">
            {c.heading_path.slice(1).join(" › ")}
            {c.injection_suspected && <span className="ml-2 text-destructive">quarantined: possible prompt injection</span>}
          </div>
          {c.text}
        </section>
      ))}
      {typeof chunk === "string" && (
        // Scroll to the cited chunk; tiny inline script, no user data.
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById(${JSON.stringify(chunk)})?.scrollIntoView({block:"center"})` }} />
      )}
    </>
  );
}
