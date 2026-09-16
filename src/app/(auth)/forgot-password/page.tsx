import { Suspense } from "react";
import { ForgotPasswordForm } from "./forgot-password-form";

// ForgotPasswordForm reads ?expired= via useSearchParams(), which requires a
// Suspense boundary so the rest of the route can still prerender.
export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
