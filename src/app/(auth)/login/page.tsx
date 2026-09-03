import { Suspense } from "react";
import { LoginForm } from "./login-form";

// LoginForm reads ?next= via useSearchParams(), which requires a Suspense
// boundary so the rest of the route can still prerender.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
