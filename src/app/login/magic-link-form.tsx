"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, type LoginState } from "./actions";

export function MagicLinkForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="email">Work email</Label>
      <Input id="email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Sending…" : "Send magic link"}
      </Button>
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
