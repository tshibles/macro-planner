"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { createClient } from "@/app/lib/supabase/client";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      // No key in this environment — skip analytics entirely rather than
      // calling init(undefined) and breaking silently.
      return;
    }

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "identified_only",
      // Capture SPA navigations (/plan -> /grocery -> /settings) as
      // pageviews, not just the initial document load.
      capture_pageview: "history_change",
    });

    // Tie events to real people for BOTH auth methods. The getUser call
    // covers sessions that already exist on load (OAuth/confirmation
    // landings); onAuthStateChange covers password sign-in and sign-out
    // from anywhere. identify() is idempotent, so repeat calls are harmless.
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) posthog.identify(data.user.id, { email: data.user.email });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        posthog.identify(session.user.id, { email: session.user.email });
      } else if (event === "SIGNED_OUT") {
        posthog.reset();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
