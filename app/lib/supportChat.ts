import Anthropic from "@anthropic-ai/sdk";

// AI support intake for Campus Macros. The assistant is a smart intake form:
// it understands the product, asks 1-2 clarifying questions, then files a
// ticket (categorize + summarize + draft reply) which we email to the support
// inbox via Resend. It NEVER executes account actions and never promises
// refunds or changes — every safety constraint lives in the system prompt AND
// in the shape of its single tool, which can only describe the issue.

const SUPPORT_MODEL = "claude-sonnet-4-6";
const SUPPORT_INBOX = "campusmacros@gmail.com";
const SUPPORT_FROM = "Campus Macros Support <support@campusmacros.com>";

export const SUPPORT_CATEGORIES = [
  "billing/refund",
  "bug",
  "meal-plan question",
  "account/login",
  "feature request",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface SupportUserInfo {
  email: string;
  userId: string;
  subscriptionTier: string | null;
  subscriptionExpiresAt: string | null;
  planBudget: number | null;
  planGoal: string | null;
}

export interface SupportChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SupportTurnResult {
  message: string;     // assistant reply to show the user
  concluded: boolean;  // true once the ticket was filed (chat should close)
  emailSent: boolean;  // whether the Resend call succeeded
  category?: SupportCategory;
}

// Hard request-shape limits — this is a support chat, not a free LLM proxy.
export const MAX_MESSAGES = 24;
export const MAX_MESSAGE_CHARS = 2000;

function systemPrompt(user: SupportUserInfo): string {
  return `You are the friendly support assistant for Campus Macros, a meal-planning SaaS for college students.

## What Campus Macros is
- Users enter their weekly grocery budget, body metrics (weight, height, age, activity level), and a goal weight + timeframe. The app computes their TDEE and calorie/protein targets, then generates a multi-week MEAL-PREP plan (two batch-cooking sessions per week: Sunday and Wednesday) with 150+ real recipes and a per-week grocery list priced for their US state and sized to their budget.
- Users can swap meals, like/dislike meals, and regenerate plans from the Settings page.
- Pricing: a free 7-day trial (no card), Monthly at $8 for a 30-day plan, Annual at $60 per year. Payments go through Stripe. Built on Next.js and Supabase.
- If a plan's full portions cost more than the user's budget, the app honestly reduces portions and shows a message explaining the real grocery cost.

## The user you are talking to
- Email: ${user.email}
- Subscription: ${user.subscriptionTier ? `${user.subscriptionTier}${user.subscriptionExpiresAt ? `, expires ${user.subscriptionExpiresAt}` : ""}` : "no active subscription on record"}
- Saved plan: ${user.planBudget != null ? `$${user.planBudget}/week budget${user.planGoal ? `, goal: ${user.planGoal}` : ""}` : "none on record"}

## Your job — you are an intake assistant, nothing more
1. Greet briefly and understand the user's issue. Ask 1-2 clarifying questions if needed (what page, what they expected vs. saw, error messages, when it started). Don't interrogate — two questions maximum, fewer if the issue is already clear.
2. You may explain how the product works (features, pricing, how plans/budgets/swaps behave) to clear up confusion.
3. Once you understand the issue well enough for a teammate to act on it, call the file_support_ticket tool with a category, a concise summary, and a suggested draft reply for the human team.
4. After filing, tell the user: "Thanks, I've passed this along to our team and you'll hear back at ${user.email} soon." — then conclude. Do not keep the conversation going after filing.

## Hard rules — never break these
- NEVER promise refunds, credits, discounts, account changes, subscription changes, or any specific billing action. You only gather information. If asked, say the team will review it and follow up by email.
- NEVER claim to have fixed, changed, canceled, refunded, or resolved anything yourself. You cannot take any account action and must not imply otherwise.
- NEVER ask for passwords, payment card numbers, or other credentials. You already know their account email — never ask them to confirm sensitive data.
- Stay on Campus Macros support topics. For anything unrelated (general life advice, other products, coding help), politely say you can only help with Campus Macros and steer back.
- If the user is angry or the issue is urgent (e.g. double charge), be empathetic, gather the facts quickly, and file the ticket — that IS the escalation path.
- Keep replies short (2-4 sentences) and warm. No markdown headers or bullet lists in chat replies.`;
}

const FILE_TICKET_TOOL: Anthropic.Tool = {
  name: "file_support_ticket",
  description:
    "File the user's issue with the human support team. Call this exactly once, when you understand the issue well enough for a teammate to act on it (after at most 1-2 clarifying questions). This is the ONLY action you can take — it sends the details to the team; it does not change anything on the account.",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: [...SUPPORT_CATEGORIES],
        description: "The category that best fits the user's issue.",
      },
      summary: {
        type: "string",
        description:
          "A concise 2-4 sentence summary of the issue for the support team: what's wrong, what the user expected, and any key details (page, error text, timing).",
      },
      draft_reply: {
        type: "string",
        description:
          "A suggested email reply the human team could send the user, written in a warm support voice. Do not promise refunds or specific actions — offer what the team will look into.",
      },
    },
    required: ["category", "summary", "draft_reply"],
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendTicketEmail(
  user: SupportUserInfo,
  ticket: { category: SupportCategory; summary: string; draft_reply: string },
  transcript: SupportChatMessage[]
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[support] RESEND_API_KEY missing — ticket not emailed");
    return false;
  }

  const transcriptHtml = transcript
    .map(
      (m) =>
        `<p style="margin:6px 0"><strong>${m.role === "user" ? "User" : "Assistant"}:</strong> ${escapeHtml(m.content)}</p>`
    )
    .join("");

  const html = `
    <h2 style="margin-bottom:4px">New support ticket — ${escapeHtml(ticket.category)}</h2>
    <table style="border-collapse:collapse;margin:12px 0" cellpadding="4">
      <tr><td><strong>User</strong></td><td>${escapeHtml(user.email)}</td></tr>
      <tr><td><strong>User ID</strong></td><td>${escapeHtml(user.userId)}</td></tr>
      <tr><td><strong>Subscription</strong></td><td>${escapeHtml(user.subscriptionTier ?? "none")}${user.subscriptionExpiresAt ? ` (expires ${escapeHtml(user.subscriptionExpiresAt)})` : ""}</td></tr>
      <tr><td><strong>Saved plan</strong></td><td>${user.planBudget != null ? `$${user.planBudget}/week${user.planGoal ? `, ${escapeHtml(user.planGoal)}` : ""}` : "none"}</td></tr>
    </table>
    <h3>Summary</h3>
    <p>${escapeHtml(ticket.summary)}</p>
    <h3>Suggested draft reply</h3>
    <blockquote style="border-left:3px solid #15803d;margin:8px 0;padding:4px 12px;color:#333">${escapeHtml(ticket.draft_reply).replace(/\n/g, "<br/>")}</blockquote>
    <h3>Full transcript</h3>
    ${transcriptHtml}
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SUPPORT_FROM,
      to: [SUPPORT_INBOX],
      reply_to: user.email,
      subject: `[Support] ${ticket.category} — ${user.email}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("[support] Resend send failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

// One assistant turn: send the conversation to Claude; if it files the ticket,
// email the team and return the model's closing message. The manual tool loop
// (instead of a tool runner) is deliberate — the email send is gated right
// here, and the tool can only ever describe the issue, never act on accounts.
export async function runSupportTurn(
  history: SupportChatMessage[],
  user: SupportUserInfo
): Promise<SupportTurnResult> {
  const client = new Anthropic();

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response = await client.messages.create({
    model: SUPPORT_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: systemPrompt(user),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [FILE_TICKET_TOOL],
    messages,
  });

  let concluded = false;
  let emailSent = false;
  let category: SupportCategory | undefined;

  // Tool loop: at most a couple of iterations (the model files one ticket).
  for (let i = 0; i < 3 && response.stop_reason === "tool_use"; i++) {
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "file_support_ticket" && !concluded) {
        const input = tu.input as {
          category: SupportCategory;
          summary: string;
          draft_reply: string;
        };
        category = SUPPORT_CATEGORIES.includes(input.category)
          ? input.category
          : "other";
        emailSent = await sendTicketEmail(
          user,
          { ...input, category },
          history
        );
        concluded = true;
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: emailSent
            ? "Ticket filed and sent to the support team."
            : "Ticket recorded. (Email delivery hit an issue but the team will still see the log — reassure the user normally.)",
        });
      } else {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "No action taken.",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });

    response = await client.messages.create({
      model: SUPPORT_MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: systemPrompt(user),
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [FILE_TICKET_TOOL],
      messages,
    });
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    message:
      text ||
      `Thanks, I've passed this along to our team and you'll hear back at ${user.email} soon.`,
    concluded,
    emailSent,
    category,
  };
}
