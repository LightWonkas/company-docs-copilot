"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MIME_TYPES, kindFromName } from "@/lib/ingest/extract";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type UploadState = { ok?: string; error?: string };

const MAX_BYTES = 20 * 1024 * 1024;
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const uploadSchema = z.object({
  title: z.string().trim().min(3).max(200),
  language: z.enum(["tr", "en"]),
  scope: z.enum(["public", "department", "team", "restricted"]),
  departmentId: optionalId,
  teamId: optionalId,
  replaceId: optionalId,
});

function slugify(title: string) {
  return title
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Upload runs entirely on the admin's own JWT: Storage RLS checks the org
 * folder and admin role, documents RLS checks the insert, and DB triggers
 * compute the ACL and enqueue ingestion. No secret key in this path.
 */
export async function uploadDocument(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > MAX_BYTES) return { error: "File is larger than 20 MB." };

  let kind;
  try {
    kind = kindFromName(file.name);
  } catch {
    return { error: "Only PDF, DOCX and Markdown files are supported." };
  }
  const parsed = uploadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;
  const principals = formData.getAll("principals").map(String);
  if (input.scope === "department" && !input.departmentId) return { error: "Pick a department." };
  if (input.scope === "team" && !input.teamId) return { error: "Pick a team." };
  if (input.scope === "restricted" && principals.length === 0) return { error: "Pick at least one person or role." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const supabase = await createClient();

  let documentId: string = randomUUID();
  let version = 1;
  if (input.replaceId) {
    const { data: existing } = await supabase
      .from("documents")
      .select("id, version, checksum")
      .eq("id", input.replaceId)
      .single();
    if (!existing) return { error: "Document to replace not found." };
    if (existing.checksum === checksum) return { ok: "Unchanged file (same checksum): nothing to re-ingest." };
    documentId = existing.id;
    version = existing.version + 1;
  }

  const storagePath = `${admin.orgId}/${documentId}/v${version}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const upload = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: MIME_TYPES[kind], upsert: false });
  if (upload.error) return { error: `Upload failed: ${upload.error.message}` };

  const scopeFields = {
    scope: input.scope,
    department_id: input.scope === "department" ? input.departmentId : null,
    team_id: input.scope === "team" ? input.teamId : null,
  };

  if (input.replaceId) {
    // New file + status pending -> trigger enqueues; the worker swaps chunks
    // atomically, so readers see either the old or the new version.
    const { error } = await supabase
      .from("documents")
      .update({ ...scopeFields, title: input.title, language: input.language, version, storage_path: storagePath, mime_type: MIME_TYPES[kind], status: "pending" })
      .eq("id", documentId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("documents").insert({
      id: documentId,
      org_id: admin.orgId,
      slug: `${slugify(input.title)}-${documentId.slice(0, 6)}`,
      title: input.title,
      language: input.language,
      owner_id: admin.id,
      storage_path: storagePath,
      mime_type: MIME_TYPES[kind],
      status: "pending",
      ...scopeFields,
    });
    if (error) {
      await supabase.storage.from("documents").remove([storagePath]);
      return { error: error.message };
    }
  }

  if (input.scope === "restricted") {
    await supabase.from("document_acl").delete().eq("document_id", documentId);
    const rows = principals.map((p) => {
      const [type, id] = p.split(":");
      return { document_id: documentId, principal_id: id, principal_type: type as "user" | "role" };
    });
    const { error } = await supabase.from("document_acl").insert(rows);
    if (error) return { error: `Saved, but the access list failed: ${error.message}` };
  }

  revalidatePath("/admin/documents");
  return { ok: `${input.replaceId ? "New version uploaded" : "Uploaded"}; ingestion queued.` };
}

export async function deleteDocument(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("documentId"));
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).single();
  // Cascades to chunks (and their embeddings) and ACL rows.
  await supabase.from("documents").delete().eq("id", id);
  if (doc?.storage_path) {
    const folder = doc.storage_path.split("/").slice(0, 2).join("/");
    const { data: files } = await supabase.storage.from("documents").list(folder, { limit: 100 });
    // Versions live in v<n>/ subfolders; remove the current file at least.
    await supabase.storage.from("documents").remove([doc.storage_path, ...(files ?? []).map((f) => `${folder}/${f.name}`)]);
  }
  revalidatePath("/admin/documents");
}
