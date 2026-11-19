"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok?: string; error?: string };

const roleSchema = z.enum(["employee", "team_lead", "department_head", "executive", "admin"]);
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const userFields = z.object({
  role: roleSchema,
  departmentId: optionalId,
  teamId: optionalId,
  isAuditor: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

const createSchema = userFields.extend({
  email: z.email(),
  fullName: z.string().trim().min(2).max(120),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;

  // Creating an auth identity is the one step that needs the secret key (an
  // admin job, run only after requireAdmin). The profile row — which decides
  // what the user can see — is written with the admin's own JWT, so RLS still
  // checks org and admin role.
  const authAdmin = createAdminClient().auth.admin;
  const { data, error } = await authAdmin.createUser({ email: input.email, email_confirm: true });
  if (error) return { error: error.message };

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    org_id: admin.orgId,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    is_auditor: input.isAuditor,
    department_id: input.departmentId,
    team_id: input.teamId,
  });
  if (profileError) {
    await authAdmin.deleteUser(data.user.id);
    return { error: profileError.message };
  }
  revalidatePath("/admin/users");
  return { ok: `Created ${input.email}. They can sign in with a magic link.` };
}

const updateSchema = userFields.extend({ userId: z.uuid() });

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      role: input.role,
      is_auditor: input.isAuditor,
      department_id: input.departmentId,
      team_id: input.teamId,
    })
    .eq("id", input.userId)
    .select("id");
  if (error) return { error: error.message };
  // RLS filters the update silently (e.g. editing yourself or another org).
  if (!data?.length) return { error: "Not allowed: admins cannot edit their own account." };
  revalidatePath("/admin/users");
  return { ok: "Saved. Access changes apply on the user's next request." };
}
