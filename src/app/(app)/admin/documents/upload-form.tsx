"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadDocument, type UploadState } from "./actions";

export type Option = { id: string; name: string };
const selectClass = "h-8 rounded-lg border bg-background px-2 text-sm";

export function UploadForm(props: {
  departments: Option[];
  teams: Option[];
  principals: Option[];
  documents: Option[];
}) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadDocument, {});
  const [scope, setScope] = useState("public");
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" name="file" accept=".pdf,.docx,.md,.txt" required className="h-8 w-72" />
        <Input name="title" placeholder="Title" required className="h-8 w-72" />
        <select name="language" className={selectClass} aria-label="Language" defaultValue="tr">
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
        <select name="replaceId" className={selectClass} aria-label="Replace existing" defaultValue="">
          <option value="">New document</option>
          {props.documents.map((d) => (
            <option key={d.id} value={d.id}>
              New version of: {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select name="scope" className={selectClass} aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="public">Public (whole org)</option>
          <option value="department">Department</option>
          <option value="team">Team</option>
          <option value="restricted">Restricted (allow-list)</option>
        </select>
        {scope === "department" && (
          <select name="departmentId" className={selectClass} aria-label="Department" required>
            <option value="">— department —</option>
            {props.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {scope === "team" && (
          <select name="teamId" className={selectClass} aria-label="Team" required>
            <option value="">— team —</option>
            {props.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {scope === "restricted" && (
          <select name="principals" multiple className="h-28 rounded-lg border bg-background px-2 text-sm" aria-label="Allowed people and roles">
            {props.principals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-muted-foreground">{state.ok}</p>}
    </form>
  );
}
