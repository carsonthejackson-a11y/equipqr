// src/lib/billing.ts is `import "server-only"`, so its assertCanAdd*() guards
// can't be imported from a Client Component. Those guards' `{ error }`
// strings are the only channel a client form gets for "you're locked" or
// "you're at your plan's limit" — this recognizes them well enough to attach
// a real Billing link instead of leaving the plan name as dead text.
export function isBillingLimitError(message: string): boolean {
  return /reached the .* limit of the .* plan|choose a plan on the billing page/i.test(message);
}
