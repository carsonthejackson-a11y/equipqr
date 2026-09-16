import type { AuthError } from "@supabase/supabase-js";

// Supabase's password-reset and resend-confirmation endpoints must never
// reveal whether an email has an account: resetPasswordForEmail() always
// "succeeds" regardless of whether the address is registered, and a repeat
// signUp()/resend() for an unconfirmed address resends rather than erroring.
// Any error one of these calls *does* return is therefore either a genuine,
// non-identifying problem (rate limiting) or noise — and everything except a
// real rate limit should collapse into the same "check your email" state a
// successful send would show, so a stranger probing an address can't tell
// the difference. Only a rate limit is safe, and useful, to surface as-is.
export function isRateLimitError(error: Pick<AuthError, "status"> | null | undefined): boolean {
  return error?.status === 429;
}
