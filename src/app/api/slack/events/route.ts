import { createHandler } from "@vercel/slack-bolt";
import { slackApp } from "@/lib/slack/app";

export const maxDuration = 60;

// Single endpoint for Slack events, slash commands and interactivity.
export async function POST(request: Request) {
  let slack;
  try {
    slack = slackApp();
  } catch {
    return new Response("Slack integration is not configured", { status: 503 });
  }
  return createHandler(slack.app, slack.receiver)(request);
}
