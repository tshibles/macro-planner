// Decides where a signed-in user should land based on their subscription,
// free-trial, and saved-plan state. Used after login and when an
// authenticated user hits the public landing page.
export async function resolvePostAuthDestination(): Promise<string> {
  const [{ plan }, trial, sub] = await Promise.all([
    fetch("/api/meal-plans/saved").then((r) => r.json()).catch(() => ({ plan: null })),
    fetch("/api/free-trial/status").then((r) => r.json()).catch(() => ({ used: false })),
    fetch("/api/subscriptions/status").then((r) => r.json()).catch(() => ({ unlocked: false })),
  ]);

  if (sub.unlocked) return plan ? "/plan" : "/onboarding";
  return trial.used ? "/upgrade" : "/choose-plan";
}
