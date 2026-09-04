import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles Supabase's email confirmation / magic-link redirect. Requires the
// Supabase project's "Confirm signup" (and similar) email templates to point
// here with a token_hash + type instead of the default {{ .ConfirmationURL }},
// which uses an older hash-fragment delivery this app never processes.

// Only ever redirect to a same-origin path after confirmation — never follow
// an absolute/protocol-relative/userinfo-smuggling `next` value, which would
// be an open redirect (e.g. `next=@evil.com` turned `${origin}${next}` into
// a URL whose host is attacker-controlled). Mirrors the client-side
// safeNext() in src/app/(auth)/login/login-form.tsx.
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
