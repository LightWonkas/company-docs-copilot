"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUser, updateUser, type ActionState } from "./actions";

export type Option = { id: string; name: string };
export type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isAuditor: boolean;
  departmentId: string | null;
  teamId: string | null;
};

const ROLES = ["employee", "team_lead", "department_head", "executive", "admin"] as const;
const selectClass = "h-8 rounded-lg border bg-background px-2 text-sm";

function Fields({ row, departments, teams }: { row?: UserRow; departments: Option[]; teams: Option[] }) {
  return (
    <>
      <select name="role" defaultValue={row?.role ?? "employee"} className={selectClass} aria-label="Role">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace("_", " ")}
          </option>
        ))}
      </select>
      <select name="departmentId" defaultValue={row?.departmentId ?? ""} className={selectClass} aria-label="Department">
        <option value="">— department —</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select name="teamId" defaultValue={row?.teamId ?? ""} className={selectClass} aria-label="Team">
        <option value="">— team —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="isAuditor" defaultChecked={row?.isAuditor} /> auditor
      </label>
    </>
  );
}

function Status({ state }: { state: ActionState }) {
  if (state.error) return <span className="text-xs text-destructive">{state.error}</span>;
  if (state.ok) return <span className="text-xs text-muted-foreground">{state.ok}</span>;
  return null;
}

export function EditUserForm(props: { row: UserRow; departments: Option[]; teams: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateUser, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={props.row.id} />
      <Fields {...props} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Save
      </Button>
      <Status state={state} />
    </form>
  );
}

export function CreateUserForm(props: { departments: Option[]; teams: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUser, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input name="fullName" placeholder="Full name" required className="h-8 w-44" />
      <Input name="email" type="email" placeholder="email@atlas-lojistik.test" required className="h-8 w-60" />
      <Fields {...props} />
      <Button type="submit" size="sm" disabled={pending}>
        Create user
      </Button>
      <Status state={state} />
    </form>
  );
}
