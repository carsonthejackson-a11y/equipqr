import { describe, expect, it } from "vitest";
import { isBillingLimitError } from "@/lib/billing-errors";

describe("isBillingLimitError", () => {
  it("recognizes the plan-limit message from assertCanAddEquipment/assertCanAddLocation/assertCanAddMember", () => {
    expect(
      isBillingLimitError("You've reached the 25-unit limit of the Starter plan. Upgrade to add more.")
    ).toBe(true);
    expect(
      isBillingLimitError(
        "You've reached the 3-member limit of the Pro plan (including pending invitations). Upgrade or revoke a pending invite to add more."
      )
    ).toBe(true);
  });

  it("recognizes the locked-trial message shared by every assertCanAdd*() guard", () => {
    expect(isBillingLimitError("Your trial has ended. Choose a plan on the Billing page to keep going.")).toBe(
      true
    );
  });

  it("does not match unrelated errors", () => {
    expect(isBillingLimitError("Name and equipment type are required")).toBe(false);
    expect(isBillingLimitError("Equipment not found")).toBe(false);
    expect(isBillingLimitError("Not authenticated")).toBe(false);
  });
});
