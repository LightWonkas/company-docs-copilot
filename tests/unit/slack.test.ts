import { describe, expect, it } from "vitest";
import type { FinalAnswer } from "@/lib/answer/answer";
import { escapeMrkdwn, formatAnswerMrkdwn, stripForeignUrls } from "@/lib/slack/format";
import { createLinkToken, verifyLinkToken } from "@/lib/slack/link-token";

const SECRET = "test-secret-at-least-32-characters-long";

describe("Slack link token", () => {
  it("round-trips team and user", () => {
    const token = createLinkToken("T1", "U1", SECRET);
    expect(verifyLinkToken(token, SECRET)).toMatchObject({ teamId: "T1", slackUserId: "U1" });
  });

  it("rejects a tampered payload (e.g. swapping in another Slack user)", () => {
    const token = createLinkToken("T1", "U1", SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ t: "T1", u: "U_CEO", exp: 9e9 })).toString("base64url");
    expect(verifyLinkToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects expired tokens and the wrong secret", () => {
    const token = createLinkToken("T1", "U1", SECRET, Date.now() - 16 * 60 * 1000);
    expect(verifyLinkToken(token, SECRET)).toBeNull();
    expect(verifyLinkToken(createLinkToken("T1", "U1", SECRET), "other-secret")).toBeNull();
  });
});

describe("Slack formatting", () => {
  const appUrl = "https://copilot.example";

  it("removes foreign URLs so Slack never unfurls them", () => {
    expect(stripForeignUrls("see https://exfil.example/c?d=secret and https://copilot.example/x", appUrl)).toBe(
      "see [link removed] and https://copilot.example/x",
    );
  });

  it("escapes mrkdwn so model text can't build links or mentions", () => {
    expect(escapeMrkdwn("<https://evil|click> <!channel>")).toBe("&lt;https://evil|click&gt; &lt;!channel&gt;");
  });

  it("numbers citations and links sources into the app", () => {
    const answer = {
      blocks: [
        { text: "16 days.", status: "cited", citations: [{ chunkId: "c1", documentId: "d1", title: "Leave", citedText: "x" }] },
      ],
      sources: [{ chunkId: "c1", documentId: "d1", title: "Leave" }],
    } as unknown as FinalAnswer;
    expect(formatAnswerMrkdwn(answer, appUrl)).toBe(
      "16 days.[1]\n\n*Sources*\n1. <https://copilot.example/documents/d1?chunk=c1|Leave>",
    );
  });
});
