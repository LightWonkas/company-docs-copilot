import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clears the session cookies. Used when a validly signed JWT belongs to a
// user who no longer has a profile (deprovisioned, or a reseeded dev DB):
// Server Components can't write cookies, so they redirect here instead of
// bouncing between /login and / forever.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const reason = request.nextUrl.searchParams.get("error");
  const url = new URL("/login", request.url);
  if (reason === "no_profile") url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}
