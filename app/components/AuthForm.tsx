"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { createClient } from "@/app/lib/supabase/client";
import { resolvePostAuthDestination } from "@/app/lib/postAuth";
import { PageFooter, PageHeader } from "@/app/components/PageHeader";

function AuthFormContent({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const urlError = searchParams.get("error");
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  function switchMode(m: "signin" | "signup") {
    router.push(m === "signin" ? "/login" : "/signup");
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmPasswordError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        const dest = await resolvePostAuthDestination();
        router.push(dest);
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: "https://www.campusmacros.com/auth/callback",
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        posthog.capture("signup", { method: "email" });
        setEmailSent(true);
        setLoading(false);
      }
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://www.campusmacros.com/auth/callback",
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  const spinnerSvg = (
    <svg
      className="w-4 h-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );

  return (
    <main className="min-h-screen flex flex-col">
      <PageHeader showUser={false} />

      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">

          {/* ── Email-sent confirmation screen ── */}
          {emailSent ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl backdrop-blur-sm text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Check your email</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                We sent a confirmation link to{" "}
                <span className="text-white font-medium">{email}</span>.
                Click the link to activate your account, then come back to sign in.
              </p>
              <button
                onClick={() => switchMode("signin")}
                className="w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/20 text-sm mt-2"
              >
                Back to sign in
              </button>
              <p className="text-xs text-gray-600">
                Didn&apos;t get it? Check your spam folder or{" "}
                <button
                  onClick={() => setEmailSent(false)}
                  className="text-brand-400 hover:underline"
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-extrabold text-white mb-2">
                  {mode === "signin" ? "Welcome back" : "Create account"}
                </h1>
                <p className="text-gray-400 text-sm">
                  {mode === "signin"
                    ? "Sign in to access your meal plans"
                    : "Sign up to start with a free 7-day trial"}
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-5">
                {/* Google OAuth */}
                <button
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className="w-full flex items-center justify-center gap-3 bg-white/8 hover:bg-white/12 border border-white/10 hover:border-white/20 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition-colors text-sm"
                >
                  {googleLoading ? spinnerSvg : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  Continue with Google
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-gray-600">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Mode toggle — navigates between /login and /signup */}
                <div className="flex rounded-xl bg-white/5 border border-white/10 p-1">
                  {(["signin", "signup"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        mode === m ? "bg-brand-500 text-white" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {m === "signin" ? "Sign in" : "Sign up"}
                    </button>
                  ))}
                </div>

                {/* Email form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="email" className="text-sm font-medium text-gray-300">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="password" className="text-sm font-medium text-gray-300">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition text-sm"
                    />
                  </div>

                  {mode === "signup" && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-300">
                        Confirm password
                      </label>
                      <input
                        id="confirmPassword"
                        type="password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (confirmPasswordError) setConfirmPasswordError(null);
                        }}
                        placeholder="Re-enter your password"
                        className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 transition text-sm ${
                          confirmPasswordError
                            ? "border-red-500/60 focus:ring-red-500/30 focus:border-red-500/60"
                            : "border-white/10 focus:ring-brand-500/50 focus:border-brand-500/50"
                        }`}
                      />
                      {confirmPasswordError && (
                        <p className="text-red-400 text-xs mt-0.5">{confirmPasswordError}</p>
                      )}
                    </div>
                  )}

                  {error && (
                    <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? spinnerSvg : null}
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </button>
                </form>
              </div>

              <p className="mt-6 text-center text-xs text-gray-600">
                Free 7-day trial included with every account.
              </p>
            </>
          )}
        </div>
      </section>

      <PageFooter />
    </main>
  );
}

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  return (
    <Suspense>
      <AuthFormContent mode={mode} />
    </Suspense>
  );
}
