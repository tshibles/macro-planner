import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable without a session. Everything else requires auth.
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

export async function middleware(request: NextRequest) {
  // API routes handle their own auth — skip middleware entirely so POST
  // requests (e.g. Stripe webhooks) are never redirected.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Legacy auth page — now split into /login and /signup.
  if (pathname === "/auth") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/plan" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/plan";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|auth/callback).*)",
  ],
};
