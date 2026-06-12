import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { addLoopsContact } from "@/app/lib/loops";

// A signup is "fresh" when the account was created or email-confirmed within
// this window. Email/password accounts are confirmed the moment this callback
// runs (even days after the signup form), and OAuth accounts are created
// moments before it — so both NEW-signup paths pass, while returning OAuth
// logins (old confirmation timestamps) are skipped.
const FRESH_SIGNUP_WINDOW_MS = 15 * 60_000;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

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
      }
    }

    // Session cookies are written to cookieStore above; Next.js merges them
    // into this redirect response automatically.
    return NextResponse.redirect(`${origin}${next}`);
  }

  // No code in the URL — redirect URL was not whitelisted in Supabase or OAuth failed
  return NextResponse.redirect(`${origin}/login?error=missing_oauth_code`);
}
