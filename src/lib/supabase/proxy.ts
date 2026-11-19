import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, isPublicPath } from "@/lib/auth/paths";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Refreshes the Supabase session cookies and does an *optimistic* redirect for
 * signed-out users. This is not the authorization boundary: pages, actions and
 * route handlers re-check with getClaims(), and the database enforces RLS.
 */
export async function updateSession(request: NextRequest) {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Mirror refreshed tokens onto the request (for this render) and the
        // response (for the browser).
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // no-store headers: a CDN must never cache a response carrying a session.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Nothing may run between client creation and getClaims(): it is what
  // refreshes an expired access token. getClaims() verifies the JWT signature
  // (locally with asymmetric keys), unlike getSession() which trusts the cookie.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) return redirectKeepingCookies(request, response, LOGIN_PATH);
  if (signedIn && pathname === LOGIN_PATH) return redirectKeepingCookies(request, response, "/");
  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Carry over cookie writes (e.g. a cleared, expired session) and cache headers.
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}
