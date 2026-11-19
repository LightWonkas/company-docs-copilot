import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { verifyLinkToken } from "@/lib/slack/link-token";
import { linkSlackAccount } from "./actions";

// Reached from the bot's DM. The user is signed in (proxy enforces it), so
// the app identity is theirs; the Slack identity comes from the signed token.
export default function SlackLinkPage({ searchParams }: PageProps<"/slack/link">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Confirm({ searchParams }: Pick<PageProps<"/slack/link">, "searchParams">) {
  const user = await requireUser();
  const { t, done } = await searchParams;
  if (done === "1") return <p className="text-sm">Linked. You can ask questions in Slack now.</p>;
  const claims = typeof t === "string" && process.env.SLACK_LINK_SECRET ? verifyLinkToken(t, process.env.SLACK_LINK_SECRET) : null;
  if (!claims) return <p className="text-sm text-destructive">This link is invalid or has expired. Ask the bot again for a new one.</p>;
  return (
    <form action={linkSlackAccount} className="flex max-w-md flex-col gap-3 rounded-lg border p-6 text-sm">
      <p>
        Link Slack user <code>{claims.slackUserId}</code> to <strong>{user.fullName}</strong>? The bot will then answer
        you from exactly the documents you can read here.
      </p>
      <input type="hidden" name="t" value={t as string} />
      <Button type="submit">Link account</Button>
    </form>
  );
}
