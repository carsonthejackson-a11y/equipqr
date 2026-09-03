import { Suspense } from "react";
import { SignupForm } from "./signup-form";

// SignupForm reads ?invite= via useSearchParams(), which requires a Suspense
// boundary so the rest of the route can still prerender.
export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
