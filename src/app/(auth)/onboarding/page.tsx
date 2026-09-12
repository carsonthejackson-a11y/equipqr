import { Suspense } from "react";
import { OnboardingForm } from "./onboarding-form";

// OnboardingForm reads ?kind= via useSearchParams(), which requires a
// Suspense boundary so the rest of the route can still prerender (same
// pattern as (auth)/signup/page.tsx and (auth)/login/page.tsx).
export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingForm />
    </Suspense>
  );
}
