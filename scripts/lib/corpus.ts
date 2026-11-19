// Uploads the synthetic corpus (seed/corpus/manifest.json) as the admin job
// would: file to Storage, document row with scope, ACL rows for restricted
// docs. The DB trigger enqueues each document for the worker.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

export type ManifestEntry = {
  slug: string;
  file: string;
  title: string;
  language: "tr" | "en";
  scope: "public" | "department" | "team" | "restricted";
  department: string | null;
  team: string | null;
  restricted_to: string[];
  canary: string | null;
  superseded_by: string | null;
  poisoned: boolean;
  attack: string | null;
  injection_marker: string | null;
};

export function readManifest(): ManifestEntry[] {
  return JSON.parse(readFileSync("seed/corpus/manifest.json", "utf8"));
}

export async function uploadCorpus(db: SupabaseClient<Database>, orgId: string, emailDomain: string) {
  const manifest = readManifest();
  const [departments, teams, roles, profiles] = await Promise.all([
    db.from("departments").select("id, slug").eq("org_id", orgId),
    db.from("teams").select("id, slug").eq("org_id", orgId),
    db.from("roles").select("id, key").eq("org_id", orgId),
    db.from("profiles").select("id, email").eq("org_id", orgId),
  ]);
  const dept = new Map(departments.data?.map((d) => [d.slug, d.id]));
  const team = new Map(teams.data?.map((t) => [t.slug, t.id]));
  const role = new Map(roles.data?.map((r) => [r.key, r.id]));
  const user = new Map(profiles.data?.map((p) => [p.email.split("@")[0], p.id]));

  const ids = new Map<string, string>();
  for (const entry of manifest) {
    const id = randomUUID();
    ids.set(entry.slug, id);
    const storagePath = `${orgId}/${id}/v1/${basename(entry.file)}`;
    const bytes = readFileSync(`seed/corpus/${entry.file}`);
    const upload = await db.storage.from("documents").upload(storagePath, bytes, { contentType: "text/markdown" });
    if (upload.error) throw new Error(`upload ${entry.file}: ${upload.error.message}`);

    const { error } = await db.from("documents").insert({
      id,
      org_id: orgId,
      slug: entry.slug,
      title: entry.title,
      language: entry.language,
      scope: entry.scope,
      department_id: entry.scope === "department" ? (dept.get(entry.department ?? "") ?? null) : null,
      team_id: entry.scope === "team" ? (team.get(entry.team ?? "") ?? null) : null,
      storage_path: storagePath,
      mime_type: "text/markdown",
      status: "pending",
    });
    if (error) throw new Error(`document ${entry.slug}: ${error.message}`);

    if (entry.scope === "restricted") {
      const acl = entry.restricted_to.map((principal) => {
        const [kind, key] = principal.split(":");
        const principalId = kind === "role" ? role.get(key) : user.get(key);
        if (!principalId) throw new Error(`${entry.slug}: unknown principal ${principal} (${emailDomain})`);
        return { document_id: id, principal_id: principalId, principal_type: kind as "role" | "user" };
      });
      const { error: aclError } = await db.from("document_acl").insert(acl);
      if (aclError) throw new Error(`acl ${entry.slug}: ${aclError.message}`);
    }
  }

  for (const entry of manifest.filter((e) => e.superseded_by)) {
    await db
      .from("documents")
      .update({ superseded_by: ids.get(entry.superseded_by!) ?? null })
      .eq("id", ids.get(entry.slug)!);
  }
  return manifest.length;
}
