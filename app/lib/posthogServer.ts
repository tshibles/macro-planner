// Server-side PostHog capture via the HTTP API — used where client-side
// posthog-js can't run (route handlers like the auth callback). The public
// project key is a capture-only credential, so it's safe to use here.
// Fire-and-forget: never throws, never blocks the caller meaningfully.
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.error("[posthog] server capture failed:", e);
  }
}
