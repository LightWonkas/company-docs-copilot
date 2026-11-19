import "server-only";
import org from "../../../seed/org.json";
import { getServerEnv } from "@/lib/env";

export type DemoPersona = { key: string; name: string; label: string };

const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  team_lead: "Team lead",
  department_head: "Department head",
  executive: "Executive",
  admin: "Admin",
};

/** Seeded personas offered as one-click demo logins (only when DEMO_MODE). */
export function demoPersonas(): DemoPersona[] {
  if (!getServerEnv().DEMO_MODE) return [];
  return org.personas.map((p) => ({
    key: p.key,
    name: p.name,
    label: [ROLE_LABEL[p.role], p.team ?? p.department, p.auditor ? "auditor" : null]
      .filter(Boolean)
      .join(" · "),
  }));
}

export function demoEmail(key: string): string | null {
  const persona = org.personas.find((p) => p.key === key);
  return persona ? `${persona.key}@${org.emailDomain}` : null;
}
