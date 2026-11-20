import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The secret-key client bypasses RLS. Only admin jobs and the ingest worker
// may import it; retrieval, chat, Slack and MCP must run on the user's JWT.
const SECRET_CLIENT = "@/lib/supabase/admin";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: SECRET_CLIENT,
              message: "Secret-key client is only allowed in admin jobs and the ingest worker (see CLAUDE.md).",
            },
          ],
          patterns: [
            {
              group: ["**/supabase/admin"],
              message: "Secret-key client is only allowed in admin jobs and the ingest worker (see CLAUDE.md).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/(app)/admin/**", "src/app/api/cron/**", "src/lib/ingest/**", "src/lib/slack/identity.ts", "scripts/**"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".claude/worktrees/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/supabase/database.types.ts"]),
]);

export default eslintConfig;
