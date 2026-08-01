import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles Supabase's email confirmation / magic-link redirect. Requires the
// Supabase project's "Confirm signup" (and similar) email templates to point
// here with a token_hash + type instead of the default {{ .ConfirmationURL }},
// which uses an older hash-fragment delivery this app never processes.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log("[auth-confirm-debug] verifyOtp succeeded", {
        userId: user?.id,
        metaKeys: Object.keys(user?.user_metadata ?? {}),
        pendingCompanyName: user?.user_metadata?.pending_company_name,
      });
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.log("[auth-confirm-debug] verifyOtp error:", error.message);
  } else {
    console.log("[auth-confirm-debug] missing token_hash or type on request", {
      tokenHash,
      type,
      url: request.url,
    });
  }

  return NextResponse.redirect(`${origin}/login`);
}
