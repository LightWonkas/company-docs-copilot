import "server-only";
import { App, type webApi } from "@slack/bolt";
import { VercelReceiver } from "@vercel/slack-bolt";
import { answerQuestion } from "@/lib/answer/answer";
import { getServerEnv } from "@/lib/env";
import { formatAnswerMrkdwn, stripForeignUrls } from "./format";
import { sessionForSlackUser } from "./identity";
import { createLinkToken } from "./link-token";

type Reply = (text: string) => Promise<unknown>;

/**
 * One handler for /ask, @mentions and DMs. Answers are private to the asker:
 * the answer reflects the ASKER's permissions, so posting it where others can
 * read it would leak documents to channel members who lack access. Channels
 * and slash commands get ephemeral replies; only DMs are streamed.
 */
async function handleQuestion(args: {
  client: webApi.WebClient;
  teamId: string;
  slackUserId: string;
  question: string;
  channel: string;
  threadTs?: string;
  isDm: boolean;
  reply: Reply;
}) {
  const appUrl = getServerEnv().APP_URL;
  const question = args.question.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!question) return args.reply("Ask me a question, e.g. `/ask Yıllık izin hakkım kaç gün?`");

  const bridge = await sessionForSlackUser(args.teamId, args.slackUserId);
  if (!bridge) {
    const secret = process.env.SLACK_LINK_SECRET;
    if (!secret) return args.reply("Account linking is not configured.");
    const token = createLinkToken(args.teamId, args.slackUserId, secret);
    return args.reply(`Link your Slack account first: <${appUrl}/slack/link?t=${token}|sign in to Company Docs Copilot> (link valid 15 minutes).`);
  }

  try {
    if (args.threadTs) {
      await args.client.agents.sessions
        .setStatus({ channel_id: args.channel, thread_ts: args.threadTs, status: "Searching your documents…" })
        .catch(() => undefined); // status is cosmetic
    }

    if (!args.isDm) {
      const answer = await answerQuestion(bridge.session, { question });
      return args.reply(formatAnswerMrkdwn(answer, appUrl));
    }

    // DM: stream the answer as it is written, then append validated sources.
    const started = await args.client.chat.startStream({ channel: args.channel, thread_ts: args.threadTs ?? "" });
    const ts = started.ts!;
    let pending = "";
    let lastFlush = Date.now();
    const flush = async () => {
      if (!pending) return;
      const text = stripForeignUrls(pending, appUrl);
      pending = "";
      lastFlush = Date.now();
      await args.client.chat.appendStream({ channel: args.channel, ts, markdown_text: text });
    };
    // Batch deltas (~200 chars / 500 ms) to stay within Slack rate limits;
    // appends are chained so they arrive in order.
    let chain: Promise<void> = Promise.resolve();
    const answer = await answerQuestion(bridge.session, { question }, (e) => {
      if (e.type !== "delta") return;
      pending += e.text;
      if (pending.length > 200 || Date.now() - lastFlush > 500) chain = chain.then(flush);
    });
    await chain;
    await flush();
    const sources = answer.sources.map(
      (s, i) => `${i + 1}. [${s.title}](${appUrl}/documents/${s.documentId}?chunk=${s.chunkId})`,
    );
    await args.client.chat.stopStream({
      channel: args.channel,
      ts,
      markdown_text: answer.abstained ? answer.text : sources.length ? `\n\n**Sources**\n${sources.join("\n")}` : "",
    });
  } finally {
    await bridge.release();
  }
}

let instance: { app: App; receiver: VercelReceiver } | undefined;

export function slackApp() {
  if (instance) return instance;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!signingSecret || !token) throw new Error("Slack is not configured");

  // VercelReceiver verifies the Slack request signature before any handler runs.
  const receiver = new VercelReceiver({ signingSecret });
  const app = new App({ token, signingSecret, receiver, deferInitialization: true });

  app.command("/ask", async ({ ack, command, respond, client }) => {
    await ack();
    await handleQuestion({
      client,
      teamId: command.team_id,
      slackUserId: command.user_id,
      question: command.text,
      channel: command.channel_id,
      isDm: false,
      reply: (text) => respond({ response_type: "ephemeral", text }),
    });
  });

  app.event("app_mention", async ({ event, client, context }) => {
    if (!event.user) return;
    const user = event.user;
    await handleQuestion({
      client,
      teamId: context.teamId ?? "",
      slackUserId: user,
      question: event.text,
      channel: event.channel,
      threadTs: event.thread_ts ?? event.ts,
      isDm: false,
      reply: (text) => client.chat.postEphemeral({ channel: event.channel, user, thread_ts: event.thread_ts ?? event.ts, text }),
    });
  });

  app.message(async ({ message, client, context }) => {
    if (message.channel_type !== "im" || message.subtype || !("user" in message) || !message.user) return;
    const user = message.user;
    await handleQuestion({
      client,
      teamId: context.teamId ?? "",
      slackUserId: user,
      question: "text" in message ? (message.text ?? "") : "",
      channel: message.channel,
      threadTs: message.thread_ts ?? message.ts,
      isDm: true,
      reply: (text) => client.chat.postMessage({ channel: message.channel, thread_ts: message.thread_ts ?? message.ts, text }),
    });
  });

  instance = { app, receiver };
  return instance;
}
