import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { addLoopsContact } from "@/app/lib/loops";
import { captureServerEvent } from "@/app/lib/posthogServer";

// A signup is "fresh" when the account was created or email-confirmed within
// this window. Email/password accounts are confirmed the moment this callback
// runs (even days after the signup form), and OAuth accounts are created
// moments before it — so both NEW-signup paths pass, while returning OAuth
// logins (old confirmation timestamps) are skipped.
const FRESH_SIGNUP_WINDOW_MS = 15 * 60_000;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Default to /plan, not "/": signed-in users on the landing page are no
  // longer auto-redirected, and /plan's restore + the AppShell gate route
  // brand-new users onward (onboarding/choose-plan) without a detour through
  // the marketing page. Only same-site paths are honored.
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/plan";

  if (code) {
    const cookieStore = cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }

    // New-signup hook: both signup paths complete here (the email
    // confirmation link and Google OAuth both land on this callback), so this
    // is the one place a new account is known to be fully created.
    // addLoopsContact never throws and times out fast, so auth is never
    // blocked by the email service.
    const user = data?.user;
    if (user?.email) {
      const anchor = user.email_confirmed_at ?? user.created_at;
      const isFreshSignup =
        !anchor || Date.now() - new Date(anchor).getTime() < FRESH_SIGNUP_WINDOW_MS;
      if (isFreshSignup) {
        const fullName: unknown =
          user.user_metadata?.full_name ?? user.user_metadata?.name;
        await addLoopsContact({
          email: user.email,
          firstName:
            typeof fullName === "string" && fullName.trim()
              ? fullName.trim().split(/\s+/)[0]
              : undefined,
          source: "signup",
        });
        // Google OAuth signups never run the client-side signup capture in
        // AuthForm (they redirect straight to Google), so capture them here.
        // Email signups are already captured client-side at the signup form —
        // gating on the provider avoids double-counting those.
        if (user.app_metadata?.provider === "google") {
          await captureServerEvent("signup", user.id, {
            method: "google",
            $set: { email: user.email },
          });
        }
      }
    }

    // Session cookies are written to cookieStore above; Next.js merges them
    // into this redirect response automatically.
    return NextResponse.redirect(`${origin}${next}`);
  }

  // No code in the URL — redirect URL was not whitelisted in Supabase or OAuth failed
  return NextResponse.redirect(`${origin}/login?error=missing_oauth_code`);
}
